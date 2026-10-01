-- 023 (Stage 3 follow-up after the first real uploads):
-- 1. A new processing run of a file supersedes the previous run: the older document is archived (kept, 18B §5.8) and
--    its open review items are resolved as superseded, so a decision that no longer applies does not stay open.
-- 2. Credit facility from a card statement (chapter 5 §7 "מסגרת"; 18A credit_facilities): stored as its own canonical
--    record linked to the card account — a limit is never money available (chapter 13).

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
  select id into v_doc from public.documents
   where source_file_id = p_file_id and owner_user_id = v_uid and processing_version = p_processing_version and archived_at is null;
  if v_doc is null then
    update public.review_queue_items r set status = 'resolved', resolved_at = now(), resolution = 'superseded_by_new_run'
     where r.owner_user_id = v_uid and r.status in ('open', 'in_review')
       and ((r.entity_type = 'document' and r.entity_id in (select d.id from public.documents d where d.source_file_id = p_file_id and d.owner_user_id = v_uid and d.archived_at is null))
         or (r.origin_ref ->> 'document_id')::uuid in (select d.id from public.documents d where d.source_file_id = p_file_id and d.owner_user_id = v_uid and d.archived_at is null));
    update public.exceptions e set status = 'invalidated', resolved_at = now(), resolution_note = 'superseded_by_new_run'
     where e.owner_user_id = v_uid and e.status in ('open', 'in_review') and e.entity_type = 'document'
       and e.entity_id in (select d.id from public.documents d where d.source_file_id = p_file_id and d.owner_user_id = v_uid and d.archived_at is null);
    update public.documents set archived_at = now() where source_file_id = p_file_id and owner_user_id = v_uid and archived_at is null;
    insert into public.documents (owner_user_id, source_file_id, document_family_code, pipeline_state, processing_version)
    values (v_uid, p_file_id, p_family, 'extraction_pending', p_processing_version) returning id into v_doc;
    insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
    values (v_uid, 'system', 'EXTRACTION_STARTED', 'document', v_doc,
            jsonb_build_object('source_file_id', p_file_id, 'processing_version', p_processing_version), p_correlation_id);
  end if;
  return v_doc;
end $$;

-- p_facility: {limit_minor, currency, as_of_date, effective_to}
create or replace function public.processing_upsert_facility(p_document_id uuid, p_facility jsonb, p_correlation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc record;
  v_account uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select d.id, f.source_id, s.source_type into v_doc
    from public.documents d join public.source_files f on f.id = d.source_file_id join public.sources s on s.id = f.source_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_doc.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_doc.source_type <> 'credit_card_statement' then raise exception 'VALIDATE_ENUM' using errcode = '22023'; end if;
  v_account := md5(v_uid::text || ':account:' || v_doc.source_type)::uuid;
  if not exists (select 1 from public.accounts where id = v_account) then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  v_id := md5(v_uid::text || ':facility:' || v_doc.source_type)::uuid;
  insert into public.credit_facilities (id, owner_user_id, linked_account_id, facility_type_code, limit_minor, currency_code, as_of_date, effective_to, status, primary_source_id)
  values (v_id, v_uid, v_account, 'card', (p_facility ->> 'limit_minor')::bigint, p_facility ->> 'currency',
          nullif(p_facility ->> 'as_of_date', '')::date, nullif(p_facility ->> 'effective_to', '')::date, 'active', v_doc.source_id)
  on conflict (id) do update
     set limit_minor = excluded.limit_minor, currency_code = excluded.currency_code, as_of_date = excluded.as_of_date,
         effective_to = excluded.effective_to, primary_source_id = excluded.primary_source_id
   where public.credit_facilities.as_of_date is null or excluded.as_of_date >= public.credit_facilities.as_of_date;
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'FACILITY_RECORDED', 'credit_facility', v_id, p_facility, p_correlation_id);
  return v_id;
end $$;

revoke all on function public.processing_upsert_facility(uuid, jsonb, uuid) from public, anon;
grant execute on function public.processing_upsert_facility(uuid, jsonb, uuid) to authenticated;
