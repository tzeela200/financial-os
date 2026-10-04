-- 025 Dedupe across key versions (chapter 18 V2 §9 "re-uploads dedupe"; 18A §50 duplicates; DI-2 2026-10-04).
-- The import key became punctuation/spacing-insensitive (v2) so that the same movement printed by two documents
-- (a yearly movements report and a monthly statement) is one transaction. Rows already stored under the previous key
-- (v1) must not be stored again on a re-read: processing_promote now also skips a transaction whose legacy_key matches an
-- active transaction of the same account. Function change only — no data is changed.

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
