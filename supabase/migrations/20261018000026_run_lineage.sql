-- 026 Run lineage and field-level provenance (route-a-completion §2א: DI-4 §4 + DI-5; 18C §5–§7; 18A §45; 23D §132–133;
-- MASTER_SPEC 19.09 §19). Closes status-report finding F-02: tool_runs, provenance_edges, entity_field_sources and the
-- observations' canonical link were defined in 016/005 but never written.
--   1. processing_record_tool_runs: each code-rule run of a document (reader, classifier, adapters, semantic engine,
--      verification, promotion planner, reconciliation) is recorded as parser / rule_engine with its own version, the
--      document and the file hash. A Skill is never recorded as a product run (MASTER_SPEC §22; §2ב).
--   2. processing_promote gains p_tool_run_id (default null — existing callers keep working). Each promoted record gets a
--      provenance edge source_record → entity (step 'promote', run id, processing version) and its fields are traced to
--      the observations they came from (observations.canonical_* + entity_field_sources). Unmapped observations are never
--      linked to canonical truth (chapter 5 §5).
--   3. dictionary_values: the canonical glossary values reach production (seed.sql runs only on a local reset).
-- Additive only: no table, column or row is removed; existing rows change only by the new canonical links on observations
-- of records promoted from now on. The previous processing_promote signature is dropped and recreated with the extra
-- optional argument (function only, no data).

-- ---------- concept → canonical field (chapter 5 §4 concepts; 18A canonical columns). null = no canonical field.
create or replace function public.lineage_canonical_field(p_concept text, p_entity text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_entity = 'transaction' then case p_concept
      when 'transaction_date' then 'transaction_date' when 'value_date' then 'value_date' when 'charge_date' then 'charge_date'
      when 'amount' then 'amount_minor' when 'debit_amount' then 'amount_minor' when 'credit_amount' then 'amount_minor'
      when 'transaction_amount' then 'amount_minor' when 'charge_amount' then 'amount_minor'
      when 'balance' then 'balance_after_minor' when 'description' then 'description_original' when 'reference' then 'reference'
      when 'currency' then 'currency_code' when 'direction' then 'direction' end
    when p_entity in ('income', 'expense') then case p_concept
      when 'document_date' then case p_entity when 'income' then 'event_date' else 'expense_date' end
      when 'gross_amount' then 'gross_minor' when 'gross_amount_ils' then 'gross_minor' when 'amount' then 'gross_minor'
      when 'net_amount' then 'net_minor' when 'net_amount_ils' then 'net_minor' when 'vat_amount' then 'vat_minor'
      when 'currency' then 'currency_code' end
  end
$$;

-- ---------- one promoted record: edge from its source record + field sources from its observations
create or replace function public.lineage_link_record(
  p_uid uuid, p_record uuid, p_entity text, p_entity_id uuid, p_version text, p_tool_run_id uuid, p_correlation_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_record is null then return; end if;
  insert into public.provenance_edges (owner_user_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, step, processing_version, tool_run_id, correlation_id)
  values (p_uid, 'source_record', p_record, p_entity, p_entity_id, 'promote', p_version, p_tool_run_id, p_correlation_id);
  with linked as (
    update public.observations o
       set canonical_entity_type = p_entity, canonical_entity_id = p_entity_id, canonical_field = public.lineage_canonical_field(o.concept_code, p_entity)
     where o.source_record_id = p_record and o.owner_user_id = p_uid and not o.unmapped and o.canonical_entity_id is null
       and public.lineage_canonical_field(o.concept_code, p_entity) is not null
    returning o.id, o.source_id, o.canonical_field
  )
  insert into public.entity_field_sources (owner_user_id, entity_type, entity_id, field_name, source_id, observation_id, is_primary)
  select p_uid, p_entity, p_entity_id, l.canonical_field, l.source_id, l.id, count(*) over (partition by l.canonical_field) = 1
    from linked l;
end $$;

-- ---------- code-rule runs of a document
-- p_runs: [{tool_type: parser|rule_engine, tool_name, version, status: success|partial|failed, output}] → {tool_name: id}
create or replace function public.processing_record_tool_runs(p_document_id uuid, p_runs jsonb, p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc record;
  v_r jsonb;
  v_id uuid;
  v_ids jsonb := '{}'::jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select d.id, d.processing_version, f.id as file_id, f.sha256 into v_doc
    from public.documents d join public.source_files f on f.id = d.source_file_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_doc.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  for v_r in select * from jsonb_array_elements(coalesce(p_runs, '[]'::jsonb)) loop
    if coalesce(v_r ->> 'tool_type', '') not in ('parser', 'rule_engine') or coalesce(v_r ->> 'status', '') not in ('success', 'partial', 'failed')
       or coalesce(v_r ->> 'tool_name', '') = '' or coalesce(v_r ->> 'version', '') = '' then
      raise exception 'VALIDATE_ENUM' using errcode = '22023';
    end if;
    insert into public.tool_runs (owner_user_id, tool_type, tool_name, version, input_refs, input_hash, output_ref, completed_at, status, correlation_id)
    values (v_uid, v_r ->> 'tool_type', v_r ->> 'tool_name', v_r ->> 'version',
            jsonb_build_array(jsonb_build_object('document_id', p_document_id, 'source_file_id', v_doc.file_id, 'processing_version', v_doc.processing_version)),
            v_doc.sha256, coalesce(v_r -> 'output', '{}'::jsonb), now(), v_r ->> 'status', p_correlation_id)
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_r ->> 'tool_name', v_id);
    if v_r ->> 'tool_name' = 'reader' then
      insert into public.provenance_edges (owner_user_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, step, processing_version, tool_run_id, correlation_id)
      values (v_uid, 'source_file', v_doc.file_id, 'document', p_document_id, 'read', v_doc.processing_version, v_id, p_correlation_id);
    end if;
  end loop;
  return v_ids;
end $$;

-- ---------- promotion with lineage (body of 025 + lineage; behaviour otherwise unchanged)
drop function public.processing_promote(uuid, text, text, jsonb, jsonb, uuid);
create or replace function public.processing_promote(
  p_document_id uuid, p_account_type text, p_account_name text, p_transactions jsonb, p_documents jsonb, p_correlation_id uuid,
  p_tool_run_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc record;
  v_account uuid;
  v_t jsonb;
  v_d jsonb;
  v_rec uuid;
  v_ev uuid;
  v_id uuid;
  v_tx int := 0;
  v_docs int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select d.id, d.processing_version, f.source_id, s.source_type into v_doc
    from public.documents d join public.source_files f on f.id = d.source_file_id join public.sources s on s.id = f.source_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_doc.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;

  if jsonb_array_length(coalesce(p_transactions, '[]'::jsonb)) > 0 then
    if p_account_type not in ('checking', 'payment_app', 'credit_card') then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
    -- one account per Route A source in this slice (Gap: several bank accounts need an account identity from the source)
    v_account := md5(v_uid::text || ':account:' || v_doc.source_type)::uuid;
    insert into public.accounts (id, owner_user_id, account_type_code, account_name, currency_code, primary_source_id)
    values (v_account, v_uid, p_account_type, p_account_name, coalesce(p_transactions -> 0 ->> 'currency', 'ILS'), v_doc.source_id)
    on conflict (id) do nothing;

    for v_t in select * from jsonb_array_elements(p_transactions) loop
      select r.id into v_rec from public.source_records r
       where r.source_id = v_doc.source_id and r.row_number = (v_t ->> 'row_number')::int and coalesce(r.raw_json ->> 'sheet', '') = coalesce(v_t ->> 'sheet', '')
       limit 1;
      -- the same movement already stored under the previous key version (a re-read after a key change) is not stored again
      if coalesce(v_t ->> 'legacy_key', '') <> '' and exists (select 1 from public.transactions x
           where x.account_id = v_account and x.external_transaction_id = v_t ->> 'legacy_key' and x.archived_at is null) then
        continue;
      end if;
      insert into public.transactions (owner_user_id, account_id, source_id, source_record_id, external_transaction_id, transaction_date, value_date,
                                       charge_date, direction, amount_minor, currency_code, description_original, reference, balance_after_minor, transaction_type_code)
      values (v_uid, v_account, v_doc.source_id, v_rec, v_t ->> 'key', (v_t ->> 'date')::date, nullif(v_t ->> 'value_date', '')::date,
              nullif(v_t ->> 'charge_date', '')::date,
              v_t ->> 'direction', (v_t ->> 'amount_minor')::bigint, v_t ->> 'currency', v_t ->> 'description', v_t ->> 'reference',
              nullif(v_t ->> 'balance_after_minor', '')::bigint, v_t ->> 'type_code')
      on conflict (account_id, external_transaction_id) where external_transaction_id is not null do nothing
      returning id into v_id;
      if v_id is null then continue; end if;
      insert into public.evidence (owner_user_id, evidence_type, source_id, document_id, source_record_id, sheet_name, row_number, quoted_value, capture_method, extractor_version)
      values (v_uid, 'source_record', v_doc.source_id, p_document_id, v_rec, nullif(v_t ->> 'sheet', ''), (v_t ->> 'row_number')::int,
              coalesce((select raw_json -> 'cells' from public.source_records where id = v_rec), '[]'::jsonb), 'parser', v_doc.processing_version)
      returning id into v_ev;
      insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
      values (v_uid, v_ev, 'transaction', v_id, 'supports', 'direct', 'system');
      perform public.lineage_link_record(v_uid, v_rec, 'transaction', v_id, v_doc.processing_version, p_tool_run_id, p_correlation_id);
      v_tx := v_tx + 1;
    end loop;

    -- reported balance = the balance printed on the latest-dated row of the source (Reported, not calculated)
    update public.accounts a set reported_balance_minor = t.balance_after_minor, balance_as_of = t.transaction_date
      from (select balance_after_minor, transaction_date from public.transactions
             where account_id = v_account and balance_after_minor is not null
             order by transaction_date desc, created_at desc limit 1) t
     where a.id = v_account and (a.balance_as_of is null or t.transaction_date >= a.balance_as_of);
  end if;

  for v_d in select * from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb)) loop
    v_id := md5(v_uid::text || ':' || (v_d ->> 'side') || ':' || (v_d ->> 'key'))::uuid;
    select r.id into v_rec from public.source_records r
     where r.source_id = v_doc.source_id and r.row_number = (v_d -> 'row_numbers' ->> 0)::int and coalesce(r.raw_json ->> 'sheet', '') = coalesce(v_d ->> 'sheet', '')
     limit 1;
    if v_d ->> 'side' = 'income' then
      insert into public.income (id, owner_user_id, event_date, recognition_date, gross_minor, net_minor, vat_minor, currency_code, context, actuality_status, primary_source_id)
      values (v_id, v_uid, (v_d ->> 'date')::date, (v_d ->> 'date')::date, (v_d ->> 'gross_minor')::bigint, nullif(v_d ->> 'net_minor', '')::bigint,
              nullif(v_d ->> 'vat_minor', '')::bigint, v_d ->> 'currency', 'business', 'actual', v_doc.source_id)
      on conflict (id) do nothing returning id into v_id;
    elsif v_d ->> 'side' = 'expense' then
      insert into public.expenses (id, owner_user_id, expense_date, gross_minor, net_minor, vat_minor, currency_code, context, actuality_status, primary_source_id)
      values (v_id, v_uid, (v_d ->> 'date')::date, (v_d ->> 'gross_minor')::bigint, nullif(v_d ->> 'net_minor', '')::bigint,
              nullif(v_d ->> 'vat_minor', '')::bigint, v_d ->> 'currency', 'business', 'actual', v_doc.source_id)
      on conflict (id) do nothing returning id into v_id;
    else
      raise exception 'VALIDATE_ENUM' using errcode = '22023';
    end if;
    if v_id is null then continue; end if;
    insert into public.evidence (owner_user_id, evidence_type, source_id, document_id, source_record_id, sheet_name, row_number, quoted_value, normalized_value, capture_method, extractor_version)
    values (v_uid, 'source_record', v_doc.source_id, p_document_id, v_rec, nullif(v_d ->> 'sheet', ''), (v_d -> 'row_numbers' ->> 0)::int,
            jsonb_build_object('document_number', v_d ->> 'document_number', 'party', v_d ->> 'party', 'role', v_d ->> 'role', 'row_numbers', v_d -> 'row_numbers'),
            v_d, 'parser', v_doc.processing_version)
    returning id into v_ev;
    insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
    values (v_uid, v_ev, v_d ->> 'side', v_id, 'supports', 'direct', 'system');
    perform public.lineage_link_record(v_uid, v_rec, v_d ->> 'side', v_id, v_doc.processing_version, p_tool_run_id, p_correlation_id);
    v_docs := v_docs + 1;
  end loop;

  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'IMPORT_PROMOTED', 'document', p_document_id,
          jsonb_build_object('transactions', v_tx, 'documents', v_docs, 'account_id', v_account, 'tool_run_id', p_tool_run_id), p_correlation_id);
  return jsonb_build_object('transactions', v_tx, 'documents', v_docs, 'account_id', v_account);
end $$;

revoke all on function public.lineage_canonical_field(text, text) from public, anon, authenticated;
revoke all on function public.lineage_link_record(uuid, uuid, text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.processing_record_tool_runs(uuid, jsonb, uuid) from public, anon;
grant execute on function public.processing_record_tool_runs(uuid, jsonb, uuid) to authenticated;
revoke all on function public.processing_promote(uuid, text, text, jsonb, jsonb, uuid, uuid) from public, anon;
grant execute on function public.processing_promote(uuid, text, text, jsonb, jsonb, uuid, uuid) to authenticated;

-- ---------- canonical dictionary values in production (same rows as seed.sql, generated from docs/stage-0/glossary.json)
insert into public.dictionary_values (dictionary, code, sort_order) values
('context', 'personal', 0),
('context', 'business', 1),
('context', 'mixed', 2),
('context', 'unknown', 3),
('coverage_status', 'unknown', 0),
('coverage_status', 'none', 1),
('coverage_status', 'partial', 2),
('coverage_status', 'complete', 3),
('coverage_status', 'stale', 4),
('verification_status', 'unverified', 0),
('verification_status', 'verified', 1),
('verification_status', 'rejected', 2),
('verification_status', 'needs_review', 3),
('verification_status', 'contradicted', 4),
('reconciliation_status', 'unmatched', 0),
('reconciliation_status', 'candidate', 1),
('reconciliation_status', 'partial', 2),
('reconciliation_status', 'matched', 3),
('reconciliation_status', 'rejected', 4),
('reconciliation_status', 'needs_review', 5),
('actuality_status', 'planned', 0),
('actuality_status', 'expected', 1),
('actuality_status', 'actual', 2),
('actuality_status', 'cancelled', 3),
('record_lifecycle', 'active', 0),
('record_lifecycle', 'archived', 1),
('record_lifecycle', 'void', 2),
('confidence_level', 'high', 0),
('confidence_level', 'medium', 1),
('confidence_level', 'low', 2),
('confidence_level', 'unknown', 3),
('date_precision', 'day', 0),
('date_precision', 'month', 1),
('date_precision', 'year', 2),
('date_precision', 'range', 3),
('date_precision', 'unknown', 4),
('pipeline_state', 'uploaded', 0),
('pipeline_state', 'accepted', 1),
('pipeline_state', 'rejected', 2),
('pipeline_state', 'duplicate', 3),
('pipeline_state', 'classification_pending', 4),
('pipeline_state', 'classified', 5),
('pipeline_state', 'extraction_pending', 6),
('pipeline_state', 'extracted', 7),
('pipeline_state', 'normalization_pending', 8),
('pipeline_state', 'normalized', 9),
('pipeline_state', 'verification_pending', 10),
('pipeline_state', 'verified', 11),
('pipeline_state', 'reconciliation_pending', 12),
('pipeline_state', 'reconciled', 13),
('pipeline_state', 'qa_pending', 14),
('pipeline_state', 'ready_for_review', 15),
('pipeline_state', 'canonical_ready', 16),
('pipeline_state', 'canonical_promoted', 17),
('pipeline_state', 'projection_pending', 18),
('pipeline_state', 'ready', 19),
('pipeline_state', 'failed', 20),
('pipeline_state', 'needs_review', 21),
('pipeline_state', 'archived', 22),
('processing_status', 'pending', 0),
('processing_status', 'processing', 1),
('processing_status', 'completed', 2),
('processing_status', 'failed', 3),
('processing_status', 'needs_review', 4),
('processing_status', 'archived', 5),
('job_status', 'queued', 0),
('job_status', 'running', 1),
('job_status', 'succeeded', 2),
('job_status', 'failed', 3),
('job_status', 'retry_wait', 4),
('job_status', 'needs_review', 5),
('job_status', 'cancelled', 6),
('job_priority', 'normal', 0),
('job_priority', 'high', 1),
('job_priority', 'critical', 2),
('job_type', 'process_source', 0),
('job_type', 'reconcile_scope', 1),
('job_type', 'quality_gate', 2),
('job_type', 'promote_canonical', 3),
('job_type', 'refresh_projections', 4),
('job_type', 'reprocess_source', 5),
('job_type', 'sync_external_source', 6),
('job_type', 'create_export', 7),
('provider_health', 'healthy', 0),
('provider_health', 'degraded', 1),
('provider_health', 'unavailable', 2),
('exception_severity', 'info', 0),
('exception_severity', 'low', 1),
('exception_severity', 'medium', 2),
('exception_severity', 'high', 3),
('exception_severity', 'critical', 4),
('exception_status', 'open', 0),
('exception_status', 'in_review', 1),
('exception_status', 'resolved', 2),
('exception_status', 'accepted_difference', 3),
('exception_status', 'invalidated', 4),
('review_item_status', 'open', 0),
('review_item_status', 'in_review', 1),
('review_item_status', 'waiting_for_source', 2),
('review_item_status', 'waiting_for_professional', 3),
('review_item_status', 'resolved', 4),
('review_item_status', 'dismissed', 5),
('qa_run_status', 'queued', 0),
('qa_run_status', 'running', 1),
('qa_run_status', 'passed', 2),
('qa_run_status', 'passed_with_warnings', 3),
('qa_run_status', 'failed', 4),
('qa_trigger', 'ingestion', 0),
('qa_trigger', 'reprocess', 1),
('qa_trigger', 'manual', 2),
('qa_trigger', 'pre_publish', 3),
('qa_trigger', 'pre_action', 4),
('evidence_status', 'active', 0),
('evidence_status', 'superseded', 1),
('evidence_status', 'invalidated', 2),
('evidence_status', 'archived', 3),
('rule_status', 'draft', 0),
('rule_status', 'active', 1),
('rule_status', 'superseded', 2),
('rule_status', 'invalidated', 3),
('run_status', 'success', 0),
('run_status', 'failed', 1),
('run_status', 'partial', 2),
('knowledge_type', 'fact', 0),
('knowledge_type', 'calculation', 1),
('knowledge_type', 'interpretation', 2),
('knowledge_type', 'hypothesis', 3),
('knowledge_type', 'contradiction', 4),
('knowledge_type', 'open_question', 5),
('knowledge_type', 'decision', 6),
('knowledge_type', 'investigation_status', 7),
('finding_type', 'missing', 0),
('finding_type', 'partial', 1),
('finding_type', 'mismatch', 2),
('finding_type', 'duplicate', 3),
('finding_type', 'overpayment', 4),
('finding_type', 'underpayment', 5),
('finding_type', 'tax_issue', 6),
('finding_type', 'legal_issue', 7),
('finding_type', 'pattern', 8),
('finding_type', 'other', 9),
('finding_status', 'open', 0),
('finding_status', 'verified', 1),
('finding_status', 'rejected', 2),
('finding_status', 'resolved', 3),
('finding_status', 'superseded', 4),
('finding_status', 'not_applicable', 5),
('obligation_status', 'planned', 0),
('obligation_status', 'expected', 1),
('obligation_status', 'due', 2),
('obligation_status', 'paid', 3),
('obligation_status', 'cancelled', 4),
('obligation_status', 'paused', 5),
('obligation_status', 'needs_verification', 6),
('occurrence_status', 'expected', 0),
('occurrence_status', 'due', 1),
('occurrence_status', 'paid', 2),
('occurrence_status', 'overdue', 3),
('occurrence_status', 'cancelled', 4),
('receivable_status', 'expected', 0),
('receivable_status', 'partial', 1),
('receivable_status', 'paid', 2),
('receivable_status', 'overdue', 3),
('receivable_status', 'cancelled', 4),
('receivable_status', 'disputed', 5),
('loan_status', 'active', 0),
('loan_status', 'closed', 1),
('loan_status', 'restructured', 2),
('loan_status', 'settled', 3),
('loan_status', 'unknown', 4),
('interest_type', 'fixed', 0),
('interest_type', 'variable', 1),
('interest_type', 'prime', 2),
('interest_type', 'indexed', 3),
('interest_type', 'other', 4),
('interest_type', 'unknown', 5),
('debt_status', 'open', 0),
('debt_status', 'arranged', 1),
('debt_status', 'settled', 2),
('debt_status', 'closed', 3),
('debt_status', 'disputed', 4),
('debt_status', 'unknown', 5),
('agreement_type', 'settlement', 0),
('agreement_type', 'payment_plan', 1),
('agreement_type', 'restructure', 2),
('agreement_type', 'other', 3),
('agreement_status', 'draft', 0),
('agreement_status', 'active', 1),
('agreement_status', 'completed', 2),
('agreement_status', 'breached', 3),
('agreement_status', 'cancelled', 4),
('agreement_status', 'unknown', 5),
('legal_case_type', 'enforcement', 0),
('legal_case_type', 'court', 1),
('legal_case_type', 'collection', 2),
('legal_case_type', 'authority', 3),
('legal_case_type', 'other', 4),
('legal_case_status', 'open', 0),
('legal_case_status', 'closed', 1),
('legal_case_status', 'stayed', 2),
('legal_case_status', 'settled', 3),
('legal_case_status', 'unknown', 4),
('account_type', 'checking', 0),
('account_type', 'savings', 1),
('account_type', 'credit_card', 2),
('account_type', 'payment_app', 3),
('account_type', 'other', 4),
('account_status', 'active', 0),
('account_status', 'closed', 1),
('account_status', 'unknown', 2),
('facility_type', 'account', 0),
('facility_type', 'card', 1),
('facility_type', 'loan_line', 2),
('facility_type', 'other', 3),
('tax_type', 'vat', 0),
('tax_type', 'income_tax', 1),
('tax_type', 'withholding', 2),
('tax_type', 'other', 3),
('tax_record_type', 'return', 0),
('tax_record_type', 'assessment', 1),
('tax_record_type', 'payment', 2),
('tax_record_type', 'credit', 3),
('tax_record_type', 'refund', 4),
('tax_record_type', 'demand', 5),
('tax_record_status', 'draft', 0),
('tax_record_status', 'filed', 1),
('tax_record_status', 'paid', 2),
('tax_record_status', 'open', 3),
('tax_record_status', 'closed', 4),
('tax_record_status', 'amended', 5),
('tax_record_status', 'unknown', 6),
('authority_record_type', 'charge', 0),
('authority_record_type', 'debt', 1),
('authority_record_type', 'right', 2),
('authority_record_type', 'benefit', 3),
('authority_record_type', 'refund', 4),
('authority_record_type', 'decision', 5),
('authority_record_type', 'demand', 6),
('authority_record_status', 'open', 0),
('authority_record_status', 'paid', 1),
('authority_record_status', 'approved', 2),
('authority_record_status', 'rejected', 3),
('authority_record_status', 'pending', 4),
('authority_record_status', 'closed', 5),
('authority_record_status', 'unknown', 6),
('direction', 'debit', 0),
('direction', 'credit', 1),
('extraction_method', 'parser', 0),
('extraction_method', 'vision', 1),
('extraction_method', 'skill', 2),
('extraction_method', 'manual', 3),
('evidence_relation', 'supports', 0),
('evidence_relation', 'contradicts', 1),
('evidence_relation', 'derived_from', 2),
('evidence_relation', 'explains', 3),
('evidence_relation', 'verifies', 4),
('evidence_relation', 'replaces', 5),
('evidence_strength', 'direct', 0),
('evidence_strength', 'supporting', 1),
('evidence_strength', 'contextual', 2),
('error_type', 'validation', 0),
('error_type', 'business_rule', 1),
('error_type', 'conflict', 2),
('error_type', 'provider', 3),
('error_type', 'processing', 4),
('error_type', 'authorization', 5),
('error_type', 'system', 6),
('source_type', 'bank_statement', 0),
('source_type', 'credit_card_statement', 1),
('source_type', 'p2p_payment', 2),
('source_type', 'business_expense_export', 3),
('source_type', 'business_income_export', 4),
('source_type', 'accounting_ledger', 5),
('source_type', 'tax_document', 6),
('source_type', 'government_authority', 7),
('source_type', 'loan_document', 8),
('source_type', 'credit_report', 9),
('source_type', 'debt_collection', 10),
('source_type', 'enforcement', 11),
('source_type', 'legal_document', 12),
('source_type', 'local_authority', 13),
('source_type', 'asset_right', 14),
('source_type', 'payment_proof', 15),
('source_type', 'correspondence', 16),
('source_type', 'user_report', 17),
('source_type', 'official_reference', 18),
('source_type', 'prior_analysis', 19),
('reliability_status', 'direct_verified', 0),
('reliability_status', 'calculated', 1),
('reliability_status', 'supported', 2),
('reliability_status', 'reported', 3),
('reliability_status', 'estimated', 4),
('reliability_status', 'needs_verification', 5),
('reliability_status', 'unknown', 6),
('reliability_status', 'contradicted', 7),
('materiality', 'low', 0),
('materiality', 'medium', 1),
('materiality', 'high', 2),
('materiality', 'critical', 3),
('contradiction_type', 'amount', 0),
('contradiction_type', 'date', 1),
('contradiction_type', 'party', 2),
('contradiction_type', 'document_number', 3),
('contradiction_type', 'status', 4),
('contradiction_type', 'category', 5),
('contradiction_type', 'balance', 6),
('contradiction_type', 'legal_rule', 7),
('contradiction_type', 'other', 8),
('contradiction_resolution_type', 'source_precedence', 0),
('contradiction_resolution_type', 'manual_confirmation', 1),
('contradiction_resolution_type', 'additional_evidence', 2),
('contradiction_resolution_type', 'calculation', 3),
('contradiction_resolution_type', 'explained_difference', 4),
('resolved_by', 'user', 0),
('resolved_by', 'system_rule', 1),
('resolved_by', 'professional', 2),
('coverage_domain', 'bank', 0),
('coverage_domain', 'credit', 1),
('coverage_domain', 'green_invoice', 2),
('coverage_domain', 'accounting', 3),
('coverage_domain', 'tax', 4),
('coverage_domain', 'bit', 5),
('coverage_domain', 'enforcement', 6),
('coverage_domain', 'loan', 7),
('coverage_domain', 'other', 8),
('expected_frequency', 'monthly', 0),
('expected_frequency', 'bimonthly', 1),
('expected_frequency', 'annual', 2),
('expected_frequency', 'event_based', 3),
('received_status', 'received', 0),
('received_status', 'partial', 1),
('received_status', 'missing', 2),
('received_status', 'not_applicable', 3),
('blocking_scope', 'snapshot', 0),
('blocking_scope', 'vat', 1),
('blocking_scope', 'planning', 2),
('blocking_scope', 'investigation', 3),
('freshness_status', 'fresh', 0),
('freshness_status', 'aging', 1),
('freshness_status', 'stale', 2),
('freshness_status', 'unknown', 3),
('evidence_type', 'source_document', 0),
('evidence_type', 'source_record', 1),
('evidence_type', 'document_fragment', 2),
('evidence_type', 'table_row', 3),
('evidence_type', 'api_record', 4),
('evidence_type', 'user_report', 5),
('evidence_type', 'calculation_input', 6),
('evidence_type', 'calculation_output', 7),
('evidence_type', 'reconciliation_link', 8),
('evidence_type', 'professional_response', 9),
('evidence_type', 'official_rule', 10),
('evidence_type', 'system_event', 11),
('capture_method', 'manual', 0),
('capture_method', 'api', 1),
('capture_method', 'parser', 2),
('capture_method', 'ocr', 3),
('capture_method', 'vision', 4),
('capture_method', 'import', 5),
('created_by_type', 'user', 0),
('created_by_type', 'system', 1),
('created_by_type', 'rule', 2),
('created_by_type', 'skill', 3),
('created_by_type', 'ai', 4),
('tool_type', 'skill', 0),
('tool_type', 'ai', 1),
('tool_type', 'parser', 2),
('tool_type', 'rule_engine', 3),
('accepted_by', 'rule', 0),
('accepted_by', 'user', 1),
('accepted_by', 'system', 2),
('exception_type', 'missing_required_field', 0),
('exception_type', 'unsupported_format', 1),
('exception_type', 'duplicate_source', 2),
('exception_type', 'ambiguous_match', 3),
('exception_type', 'amount_mismatch', 4),
('exception_type', 'currency_mismatch', 5),
('exception_type', 'period_gap', 6),
('exception_type', 'stale_data', 7),
('exception_type', 'rule_not_resolved', 8),
('exception_type', 'processing_failure', 9),
('exception_type', 'evidence_missing', 10),
('review_item_type', 'reconciliation', 0),
('review_item_type', 'contradiction', 1),
('review_item_type', 'exception', 2),
('review_item_type', 'finding', 3),
('review_item_type', 'document', 4),
('review_item_type', 'calculation', 5),
('review_item_type', 'rule', 6),
('qa_check_result', 'passed', 0),
('qa_check_result', 'warned', 1),
('qa_check_result', 'failed', 2),
('review_blocking', 'canonical', 0),
('review_blocking', 'prediction', 1),
('review_blocking', 'action', 2)
on conflict (dictionary, code) do update set sort_order = excluded.sort_order, active = true;
