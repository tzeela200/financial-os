-- 022 processing pipeline write path (Stage 3 plan v2; decisions D3/D5; ADR-007 import path).
-- Uses the existing Stage 1 infrastructure only: jobs, processing_runs, dead_letter_jobs, documents, source_records,
-- observations, qa_runs, qa_check_results, exceptions, review_queue_items, evidence, evidence_links, audit_events,
-- rule_versions, accounts, transactions, income, expenses (18 V2 §7–§12; 18B §4–§6, §16–§17; 18C).
-- All tables above are SELECT-only for the owner, so every write goes through these SECURITY DEFINER functions, which
-- authorise with auth.uid() and never accept an owner id. Upload = register + enqueue (18 V2 §44); the job runs on the
-- server. Technical failure → retry → DLQ; business problem → needs_review + exception + review item (18 V2 §10B).

-- ---------- jobs ----------
create or replace function public.processing_enqueue(
  p_file_id uuid, p_job_type text, p_processing_version text, p_correlation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_file record;
  v_job uuid;
  v_key text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_job_type not in ('process_source', 'reprocess_source') then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
  select f.id, f.pipeline_state into v_file from public.source_files f
   where f.id = p_file_id and f.owner_user_id = v_uid and f.archived_at is null;
  if v_file.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_file.pipeline_state = 'duplicate' then raise exception 'VALIDATE_DUPLICATE_FILE' using errcode = '22023'; end if;

  -- reprocess while a job is active returns the existing job (18D §57)
  select j.id into v_job from public.jobs j
   where j.owner_user_id = v_uid and j.scope_type = 'source_file' and j.scope_id = p_file_id
     and j.status in ('queued', 'running', 'retry_wait')
   order by j.created_at desc limit 1;
  if v_job is not null then return v_job; end if;

  v_key := p_job_type || ':' || p_file_id::text || ':' || p_processing_version;
  select j.id into v_job from public.jobs j where j.idempotency_key = v_key and j.owner_user_id = v_uid;
  if v_job is not null then
    -- same version already ran: a manual retry re-queues it under the same lineage (18 V2 §10: retry never bypasses idempotency)
    update public.jobs set status = 'queued', available_at = now(), locked_at = null, lock_owner = null,
           attempt_count = 0, error_code = null, error_detail = null, completed_at = null
     where id = v_job and status in ('failed', 'needs_review', 'succeeded', 'cancelled');
    return v_job;
  end if;

  insert into public.jobs (owner_user_id, job_type, scope_type, scope_id, idempotency_key, correlation_id, max_attempts, processing_version, input_json)
  values (v_uid, p_job_type, 'source_file', p_file_id, v_key, p_correlation_id, 3, p_processing_version, jsonb_build_object('source_file_id', p_file_id))
  returning id into v_job;

  if v_file.pipeline_state = 'uploaded' then
    update public.source_files set pipeline_state = 'classification_pending' where id = p_file_id;
    insert into public.processing_runs (owner_user_id, entity_type, entity_id, from_state, to_state, reason, actor_type, processing_version, correlation_id)
    values (v_uid, 'source_file', p_file_id, 'uploaded', 'accepted', 'stored and registered', 'system', p_processing_version, p_correlation_id),
           (v_uid, 'source_file', p_file_id, 'accepted', 'classification_pending', 'job queued', 'system', p_processing_version, p_correlation_id);
  end if;
  return v_job;
end $$;

-- claims the given job (or the oldest due job of the owner) with a lease; expired leases are claimable (18D §57)
create or replace function public.processing_claim(p_lock_owner text, p_job_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.jobs;
  v_file record;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_job from public.jobs j
   where j.owner_user_id = v_uid and (p_job_id is null or j.id = p_job_id)
     and ((j.status in ('queued', 'retry_wait') and j.available_at <= now())
          or (j.status = 'running' and j.locked_at < now() - interval '10 minutes'))
   order by j.available_at limit 1
   for update skip locked;
  if v_job.id is null then return null; end if;

  if v_job.attempt_count >= v_job.max_attempts then
    update public.jobs set status = 'failed', error_code = coalesce(error_code, 'MAX_ATTEMPTS'), completed_at = now(), locked_at = null where id = v_job.id;
    insert into public.dead_letter_jobs (owner_user_id, job_id, error_history, attempt_history, correlation_id, status)
    values (v_uid, v_job.id, jsonb_build_array(jsonb_build_object('code', v_job.error_code, 'detail', v_job.error_detail)),
            jsonb_build_array(jsonb_build_object('attempts', v_job.attempt_count)), v_job.correlation_id, 'open')
    on conflict (job_id) do nothing;
    return null;
  end if;

  update public.jobs set status = 'running', attempt_count = attempt_count + 1, locked_at = now(), lock_owner = p_lock_owner,
         started_at = coalesce(started_at, now())
   where id = v_job.id;
  select f.id, f.source_id, f.storage_path, f.original_filename, f.pipeline_state, s.source_type into v_file
    from public.source_files f join public.sources s on s.id = f.source_id where f.id = v_job.scope_id;
  return jsonb_build_object('job_id', v_job.id, 'job_type', v_job.job_type, 'attempt', v_job.attempt_count + 1,
    'correlation_id', v_job.correlation_id, 'file_id', v_file.id, 'source_id', v_file.source_id, 'storage_path', v_file.storage_path,
    'filename', v_file.original_filename, 'source_type', v_file.source_type, 'pipeline_state', v_file.pipeline_state);
end $$;

-- every state change of a file / document is recorded with from/to/reason (18B §16.1)
create or replace function public.processing_transition(
  p_file_id uuid, p_document_id uuid, p_to text, p_reason text, p_processing_version text, p_correlation_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select pipeline_state into v_from from public.source_files where id = p_file_id and owner_user_id = v_uid;
  if v_from is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  update public.source_files set pipeline_state = p_to, processing_version = p_processing_version where id = p_file_id;
  if p_document_id is not null then
    update public.documents set pipeline_state = p_to where id = p_document_id and owner_user_id = v_uid;
  end if;
  insert into public.processing_runs (owner_user_id, entity_type, entity_id, from_state, to_state, reason, actor_type, processing_version, correlation_id)
  values (v_uid, 'source_file', p_file_id, v_from, p_to, p_reason, 'system', p_processing_version, p_correlation_id);
end $$;

-- finish a job: success, business needs_review (no retry, no DLQ), or technical failure (backoff, then DLQ)
create or replace function public.processing_finish_job(p_job_id uuid, p_outcome text, p_error_code text, p_detail text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.jobs;
  v_delay interval;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_outcome not in ('succeeded', 'needs_review', 'failed_technical') then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
  select * into v_job from public.jobs where id = p_job_id and owner_user_id = v_uid for update;
  if v_job.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;

  if p_outcome in ('succeeded', 'needs_review') then
    update public.jobs set status = p_outcome, completed_at = now(), locked_at = null, lock_owner = null,
           error_code = p_error_code, error_detail = p_detail where id = p_job_id;
    return jsonb_build_object('status', p_outcome);
  end if;

  if v_job.attempt_count < v_job.max_attempts then
    -- exponential backoff + jitter (18 V2 §10)
    v_delay := make_interval(secs => (power(2, v_job.attempt_count) * 30 + floor(random() * 15))::int);
    update public.jobs set status = 'retry_wait', available_at = now() + v_delay, locked_at = null, lock_owner = null,
           error_code = p_error_code, error_detail = p_detail where id = p_job_id;
    return jsonb_build_object('status', 'retry_wait', 'available_at', now() + v_delay);
  end if;

  update public.jobs set status = 'failed', completed_at = now(), locked_at = null, lock_owner = null,
         error_code = p_error_code, error_detail = p_detail where id = p_job_id;
  insert into public.dead_letter_jobs (owner_user_id, job_id, error_history, attempt_history, correlation_id, status)
  values (v_uid, p_job_id, jsonb_build_array(jsonb_build_object('code', p_error_code, 'detail', p_detail)),
          jsonb_build_array(jsonb_build_object('attempts', v_job.attempt_count)), v_job.correlation_id, 'open')
  on conflict (job_id) do nothing;
  insert into public.exceptions (owner_user_id, exception_type, severity, entity_type, entity_id, description, correlation_id)
  values (v_uid, 'processing_failure', 'medium', 'source_file', v_job.scope_id, p_error_code, v_job.correlation_id);
  return jsonb_build_object('status', 'failed');
end $$;

-- ---------- extraction write ----------
create or replace function public.processing_begin_document(
  p_file_id uuid, p_processing_version text, p_family text, p_correlation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.source_files where id = p_file_id and owner_user_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  -- same version: continue the same document (records are idempotent by hash); new version: a new run, old kept (18B §5.8)
  select id into v_doc from public.documents
   where source_file_id = p_file_id and owner_user_id = v_uid and processing_version = p_processing_version and archived_at is null;
  if v_doc is null then
    insert into public.documents (owner_user_id, source_file_id, document_family_code, pipeline_state, processing_version)
    values (v_uid, p_file_id, p_family, 'extraction_pending', p_processing_version) returning id into v_doc;
    insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
    values (v_uid, 'system', 'EXTRACTION_STARTED', 'document', v_doc,
            jsonb_build_object('source_file_id', p_file_id, 'processing_version', p_processing_version), p_correlation_id);
  end if;
  return v_doc;
end $$;

-- p_records: [{row_key,row_number,record_hash,raw:{sheet,kind,cells},observations:[{concept_code,value_original,
--   value_normalized,data_type,currency_code,locator,unmapped,confidence}]}]
create or replace function public.processing_write_records(p_document_id uuid, p_records jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_source uuid;
  v_version text;
  v_rec jsonb;
  v_rid uuid;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select f.source_id, d.processing_version into v_source, v_version
    from public.documents d join public.source_files f on f.id = d.source_file_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_source is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  for v_rec in select * from jsonb_array_elements(p_records) loop
    insert into public.source_records (owner_user_id, source_id, source_row_key, raw_json, row_number, record_hash)
    values (v_uid, v_source, v_rec ->> 'row_key', v_rec -> 'raw', (v_rec ->> 'row_number')::int, v_rec ->> 'record_hash')
    on conflict (source_id, record_hash) do nothing
    returning id into v_rid;
    if v_rid is null then continue; end if;
    insert into public.observations (owner_user_id, source_id, document_id, source_record_id, concept_code, value_original,
                                     value_normalized_json, data_type, currency_code, locator_json, extraction_method,
                                     extraction_version, confidence_score, unmapped)
    select v_uid, v_source, p_document_id, v_rid, o ->> 'concept_code', o ->> 'value_original', o -> 'value_normalized',
           o ->> 'data_type', nullif(o ->> 'currency_code', ''), o -> 'locator', 'parser', v_version,
           (o ->> 'confidence')::numeric, coalesce((o ->> 'unmapped')::boolean, false)
      from jsonb_array_elements(coalesce(v_rec -> 'observations', '[]'::jsonb)) o;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- p_checks: [{code,status,detail,rows:[...],exception_type|null,severity}]
create or replace function public.processing_record_checks(
  p_document_id uuid, p_checks jsonb, p_processing_version text, p_correlation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_run uuid;
  v_c jsonb;
  v_check uuid;
  v_exc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.documents where id = p_document_id and owner_user_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  insert into public.qa_runs (owner_user_id, scope_type, scope_id, qa_profile, status, trigger, checks_total, checks_passed, checks_warned,
                              checks_failed, processing_version, correlation_id, completed_at)
  select v_uid, 'document', p_document_id, 'stage3_extraction',
         case when bool_or(c ->> 'status' = 'failed') then 'failed' when bool_or(c ->> 'status' = 'warned') then 'passed_with_warnings' else 'passed' end,
         'ingestion', count(*), count(*) filter (where c ->> 'status' = 'passed'), count(*) filter (where c ->> 'status' = 'warned'),
         count(*) filter (where c ->> 'status' = 'failed'), p_processing_version, p_correlation_id, now()
    from jsonb_array_elements(p_checks) c
  returning id into v_run;
  for v_c in select * from jsonb_array_elements(p_checks) loop
    insert into public.qa_check_results (owner_user_id, qa_run_id, check_code, severity, result, actual, entity_type, entity_id)
    values (v_uid, v_run, v_c ->> 'code', coalesce(v_c ->> 'severity', 'low'), v_c ->> 'status',
            jsonb_build_object('detail', v_c ->> 'detail', 'rows', v_c -> 'rows'), 'document', p_document_id)
    returning id into v_check;
    if v_c ->> 'status' <> 'passed' and v_c ->> 'exception_type' is not null then
      insert into public.exceptions (owner_user_id, exception_type, severity, entity_type, entity_id, description, qa_check_result_id, correlation_id)
      values (v_uid, v_c ->> 'exception_type', coalesce(v_c ->> 'severity', 'low'), 'document', p_document_id, v_c ->> 'code', v_check, p_correlation_id)
      returning id into v_exc;
      insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, required_action, origin_ref)
      values (v_uid, 'exception', 'exception', v_exc, v_c ->> 'code', coalesce(v_c ->> 'severity', 'low'), v_c ->> 'action',
              jsonb_build_object('document_id', p_document_id, 'qa_check_result_id', v_check));
    end if;
  end loop;
  return v_run;
end $$;

create or replace function public.processing_flag_document(
  p_document_id uuid, p_reason_code text, p_required_action text, p_severity text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.documents where id = p_document_id and owner_user_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = '22023';
  end if;
  if not exists (select 1 from public.review_queue_items where owner_user_id = v_uid and entity_type = 'document'
                  and entity_id = p_document_id and reason_code = p_reason_code and status in ('open', 'in_review')) then
    insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, required_action)
    values (v_uid, 'document', 'document', p_document_id, p_reason_code, p_severity, p_required_action);
  end if;
end $$;

create or replace function public.processing_finish_document(
  p_document_id uuid, p_summary jsonb, p_period_start date, p_period_end date, p_currency text, p_correlation_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.documents
     set period_start = p_period_start, period_end = p_period_end,
         currency_code = case when p_currency ~ '^[A-Z]{3}$' then p_currency else currency_code end,
         metadata_json = metadata_json || jsonb_build_object('extraction', p_summary)
   where id = p_document_id and owner_user_id = v_uid;
  if not found then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'EXTRACTION_COMPLETED', 'document', p_document_id, p_summary, p_correlation_id);
end $$;

-- ---------- import-path promotion (ADR-007; 18A §46: server-side, with Evidence + Audit; never matched here) ----------
-- p_transactions: [{key,row_number,sheet,date,value_date,charge_date,direction,amount_minor,currency,description,reference,balance_after_minor,type_code}]
-- p_documents:    [{key,side,row_numbers,sheet,role,date,document_number,party,gross_minor,net_minor,vat_minor,currency}]
create or replace function public.processing_promote(
  p_document_id uuid, p_account_type text, p_account_name text, p_transactions jsonb, p_documents jsonb, p_correlation_id uuid
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
    v_docs := v_docs + 1;
  end loop;

  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'IMPORT_PROMOTED', 'document', p_document_id,
          jsonb_build_object('transactions', v_tx, 'documents', v_docs, 'account_id', v_account), p_correlation_id);
  return jsonb_build_object('transactions', v_tx, 'documents', v_docs, 'account_id', v_account);
end $$;

-- ---------- Source Adapter approval (21D §12 Import Mapping; chapter 5 §20) ----------
-- Interim storage (Gap G-A, no schema change): rule_versions with domain 'source_adapter', versioned, previous superseded.
create or replace function public.processing_save_adapter(
  p_source_type text, p_signature text, p_adapter jsonb, p_correlation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_rule text := 'source_adapter:' || p_source_type || ':' || md5(p_signature);
  v_next int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(p_signature, '') = '' or p_adapter is null then raise exception 'VALIDATE_REQUIRED_FIELD' using errcode = '22023'; end if;
  select coalesce(max(version::int), 0) + 1 into v_next from public.rule_versions where owner_user_id = v_uid and rule_id = v_rule;
  update public.rule_versions set status = 'superseded' where owner_user_id = v_uid and rule_id = v_rule and status = 'active';
  insert into public.rule_versions (owner_user_id, rule_id, version, domain, logic_json, status, valid_from)
  values (v_uid, v_rule, v_next::text, 'source_adapter',
          p_adapter || jsonb_build_object('sourceType', p_source_type, 'signature', p_signature, 'version', v_next::text), 'active', current_date)
  returning id into v_id;
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', 'ADAPTER_APPROVED', 'rule_version', v_id, jsonb_build_object('rule_id', v_rule, 'version', v_next), p_correlation_id);
  return v_id;
end $$;


-- ---------- reconciliation (chapter 7; 18B §8): candidates are stored, never auto-approved ----------
-- p_candidates: [{key,type,left,right:[ids],amount_minor,currency,basis}]
create or replace function public.reconciliation_write_candidates(p_candidates jsonb, p_rule_version text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_c jsonb;
  v_id uuid;
  v_n int := 0;
  v_ids uuid[];
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  for v_c in select * from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) loop
    if v_c ->> 'type' not in ('card_settlement', 'payment_app_funding', 'internal_transfer') then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
    if exists (select 1 from public.match_candidates where owner_user_id = v_uid and score_breakdown_json ->> 'key' = v_c ->> 'key') then continue; end if;
    v_ids := array(select (v_c ->> 'left')::uuid union all select x::uuid from jsonb_array_elements_text(v_c -> 'right') x);
    -- every member must be the caller's own transaction
    if (select count(*) from public.transactions where id = any(v_ids) and owner_user_id = v_uid) <> cardinality(v_ids) then
      raise exception 'AUTH_FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.match_candidates (owner_user_id, candidate_type, left_ref, right_ref, score, score_breakdown_json, status, generated_by_version)
    values (v_uid, v_c ->> 'type', jsonb_build_object('entity_type', 'transaction', 'entity_id', v_c ->> 'left'),
            jsonb_build_object('entity_type', 'transaction', 'entity_id', v_c -> 'right' ->> 0, 'members', v_c -> 'right'),
            null, (v_c -> 'basis') || jsonb_build_object('key', v_c ->> 'key', 'amount_minor', v_c ->> 'amount_minor', 'currency', v_c ->> 'currency'),
            'candidate', p_rule_version)
    returning id into v_id;
    update public.transactions set reconciliation_status = 'candidate'
     where id = any(v_ids) and owner_user_id = v_uid and reconciliation_status = 'unmatched';
    insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, required_action)
    values (v_uid, 'reconciliation', 'match_candidate', v_id, v_c ->> 'type', 'medium', 'approve_or_reject_match');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.reconciliation_decide(p_candidate_id uuid, p_decision text, p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_c public.match_candidates;
  v_rec uuid;
  v_left uuid;
  v_right uuid[];
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
  select * into v_c from public.match_candidates where id = p_candidate_id and owner_user_id = v_uid for update;
  if v_c.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_c.status <> 'candidate' then raise exception 'CONFLICT_ALREADY_DECIDED' using errcode = '22023'; end if;
  v_left := (v_c.left_ref ->> 'entity_id')::uuid;
  v_right := array(select x::uuid from jsonb_array_elements_text(v_c.right_ref -> 'members') x);

  if p_decision = 'reject' then
    update public.match_candidates set status = 'rejected' where id = p_candidate_id;
    update public.transactions t set reconciliation_status = 'unmatched'
     where t.owner_user_id = v_uid and t.reconciliation_status = 'candidate' and (t.id = v_left or t.id = any(v_right))
       and not exists (select 1 from public.match_candidates m where m.owner_user_id = v_uid and m.status = 'candidate' and m.id <> p_candidate_id
                        and (m.left_ref ->> 'entity_id' = t.id::text or m.right_ref -> 'members' ? t.id::text));
  else
    insert into public.reconciliations (owner_user_id, reconciliation_type, status, rule_version, approved_at, notes)
    values (v_uid, v_c.candidate_type, 'matched', v_c.generated_by_version, now(), v_c.score_breakdown_json ->> 'rule')
    returning id into v_rec;
    insert into public.reconciliation_members (owner_user_id, reconciliation_id, entity_type, entity_id, member_role, allocated_amount_minor, currency_code)
    values (v_uid, v_rec, 'transaction', v_left,
            case v_c.candidate_type when 'card_settlement' then 'settlement' when 'payment_app_funding' then 'funding' else 'transfer_out' end,
            (v_c.score_breakdown_json ->> 'amount_minor')::bigint, v_c.score_breakdown_json ->> 'currency');
    insert into public.reconciliation_members (owner_user_id, reconciliation_id, entity_type, entity_id, member_role)
    select v_uid, v_rec, 'transaction', x,
           case v_c.candidate_type when 'card_settlement' then 'cycle_record' when 'payment_app_funding' then 'payment' else 'transfer_in' end
      from unnest(v_right) x;
    update public.match_candidates set status = 'matched' where id = p_candidate_id;
    update public.transactions t set reconciliation_status = 'matched',
           internal_transfer_pair_id = case when v_c.candidate_type = 'internal_transfer' and t.id = v_left then v_right[1]
                                            when v_c.candidate_type = 'internal_transfer' then v_left else t.internal_transfer_pair_id end
     where t.owner_user_id = v_uid and (t.id = v_left or t.id = any(v_right));
  end if;
  update public.review_queue_items set status = 'resolved', resolved_at = now(), resolution = p_decision
   where owner_user_id = v_uid and entity_type = 'match_candidate' and entity_id = p_candidate_id and status in ('open', 'in_review');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', case when p_decision = 'approve' then 'RECONCILIATION_APPROVED' else 'RECONCILIATION_REJECTED' end,
          'match_candidate', p_candidate_id, jsonb_build_object('reconciliation_id', v_rec, 'type', v_c.candidate_type), p_correlation_id);
  return jsonb_build_object('status', case when p_decision = 'approve' then 'matched' else 'rejected' end, 'reconciliation_id', v_rec);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'processing_enqueue(uuid, text, text, uuid)', 'processing_claim(text, uuid)', 'processing_transition(uuid, uuid, text, text, text, uuid)',
    'processing_finish_job(uuid, text, text, text)', 'processing_begin_document(uuid, text, text, uuid)', 'processing_write_records(uuid, jsonb)',
    'processing_record_checks(uuid, jsonb, text, uuid)', 'processing_flag_document(uuid, text, text, text)',
    'processing_finish_document(uuid, jsonb, date, date, text, uuid)', 'processing_promote(uuid, text, text, jsonb, jsonb, uuid)',
    'processing_save_adapter(text, text, jsonb, uuid)', 'reconciliation_write_candidates(jsonb, text)',
    'reconciliation_decide(uuid, text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
