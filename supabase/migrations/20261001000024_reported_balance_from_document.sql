-- 024 Reported balance from a bank document (chapter 5 §6 "יתרת פתיחה ויתרת סגירה"; chapter 13: current money is the
-- balance REPORTED by the source, with its date). Used when a bank document states the account balance as of a date
-- (e.g. an annual / summary report) without listing transactions. Evidence + audit; never overrides a newer balance.

create or replace function public.processing_record_balance(
  p_document_id uuid, p_balance_minor bigint, p_currency text, p_as_of date, p_line int, p_quoted jsonb, p_correlation_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc record;
  v_account uuid;
  v_ev uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_as_of is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'VALIDATE_REQUIRED_FIELD' using errcode = '22023'; end if;
  select d.id, d.processing_version, f.source_id, s.source_type into v_doc
    from public.documents d join public.source_files f on f.id = d.source_file_id join public.sources s on s.id = f.source_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_doc.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_doc.source_type <> 'bank_statement' then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
  v_account := md5(v_uid::text || ':account:' || v_doc.source_type)::uuid;
  insert into public.accounts (id, owner_user_id, account_type_code, account_name, currency_code, primary_source_id)
  values (v_account, v_uid, 'checking', 'חשבון בנק', p_currency, v_doc.source_id)
  on conflict (id) do nothing;
  update public.accounts set reported_balance_minor = p_balance_minor, balance_as_of = p_as_of
   where id = v_account and (balance_as_of is null or p_as_of >= balance_as_of);
  insert into public.evidence (owner_user_id, evidence_type, source_id, document_id, row_number, quoted_value, normalized_value, evidence_date, capture_method, extractor_version)
  values (v_uid, 'document_fragment', v_doc.source_id, p_document_id, p_line, coalesce(p_quoted, '{}'::jsonb),
          jsonb_build_object('balance_minor', p_balance_minor, 'currency', p_currency, 'as_of', p_as_of), p_as_of, 'parser', v_doc.processing_version)
  returning id into v_ev;
  insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
  values (v_uid, v_ev, 'account', v_account, 'supports', 'direct', 'system');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'BALANCE_REPORTED', 'account', v_account,
          jsonb_build_object('balance_minor', p_balance_minor, 'currency', p_currency, 'as_of', p_as_of, 'document_id', p_document_id), p_correlation_id);
  return v_account;
end $$;

revoke all on function public.processing_record_balance(uuid, bigint, text, date, int, jsonb, uuid) from public, anon;
grant execute on function public.processing_record_balance(uuid, bigint, text, date, int, jsonb, uuid) to authenticated;
