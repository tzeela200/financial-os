-- 021 intake RPC (docs/plans/route-a-02-intake.md; 18B §4, 18C §48, 18D §9, §17, §30, §47; DR-B, DR-C).
-- One atomic, idempotent registration per intake method. SECURITY DEFINER because evidence and audit_events are
-- SELECT-only for the owner (18C §53); every function authorises with auth.uid() and never takes an owner id.
-- File and pasted text are stored as immutable objects in financial-source-files (uploaded by the user under her
-- own prefix); the function refuses to register an object that does not exist. user_report never enters as a file.

create unique index sources_owner_client_request_uidx
  on public.sources (owner_user_id, (metadata_json ->> 'client_request_id'))
  where metadata_json ? 'client_request_id';

create or replace function public.intake_register_file(
  p_client_request_id text, p_source_type text, p_source_name text, p_context text,
  p_source_id uuid, p_file_id uuid, p_storage_path text, p_original_filename text,
  p_mime_type text, p_size_bytes bigint, p_sha256 text, p_intake_method text, p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing uuid;
  v_dup uuid;
  v_state text := 'uploaded';
  v_evidence uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source_type = 'user_report' then raise exception 'VALIDATE_USER_REPORT_NOT_FILE' using errcode = '22023'; end if;
  if p_intake_method not in ('file', 'text') then raise exception 'VALIDATE_INTAKE_METHOD' using errcode = '22023'; end if;
  if p_intake_method = 'text' and p_source_type not in ('correspondence', 'prior_analysis', 'official_reference') then
    raise exception 'VALIDATE_TEXT_NOT_ALLOWED' using errcode = '22023';
  end if;
  if p_storage_path <> v_uid::text || '/' || p_source_id::text || '/' || p_file_id::text || '/' || split_part(p_storage_path, '/', 4)
     or split_part(p_storage_path, '/', 4) not like 'original.%' then
    raise exception 'AUTH_FORBIDDEN_PATH' using errcode = '42501';
  end if;

  -- idempotency (18D §9): the same request returns the first result
  select id into v_existing from public.sources
   where owner_user_id = v_uid and metadata_json ->> 'client_request_id' = p_client_request_id;
  if v_existing is not null then
    return (select jsonb_build_object('source_id', s.id, 'file_id', f.id, 'status', f.pipeline_state,
                                      'duplicate_of_file_id', f.duplicate_of_file_id)
              from public.sources s join public.source_files f on f.source_id = s.id where s.id = v_existing limit 1);
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'financial-source-files' and name = p_storage_path) then
    raise exception 'FILE_NOT_UPLOADED' using errcode = '22023';
  end if;

  -- exact duplicate (18A §44, 18B §4.4): linked and marked, never deleted
  select id into v_dup from public.source_files
   where owner_user_id = v_uid and sha256 = p_sha256 and archived_at is null order by uploaded_at limit 1;
  if v_dup is not null then v_state := 'duplicate'; end if;

  insert into public.sources (id, owner_user_id, source_type, source_name, context, metadata_json)
  values (p_source_id, v_uid, p_source_type, p_source_name, p_context,
          jsonb_build_object('client_request_id', p_client_request_id, 'intake_method', p_intake_method));
  insert into public.source_files (id, owner_user_id, source_id, storage_bucket, storage_path, original_filename,
                                   mime_type, size_bytes, sha256, pipeline_state, duplicate_of_file_id)
  values (p_file_id, v_uid, p_source_id, 'financial-source-files', p_storage_path, p_original_filename,
          p_mime_type, p_size_bytes, p_sha256, v_state, v_dup);
  insert into public.evidence (owner_user_id, evidence_type, source_id, quoted_value, capture_method, checksum)
  values (v_uid, 'source_document', p_source_id,
          jsonb_build_object('original_filename', p_original_filename, 'mime_type', p_mime_type), 'import', p_sha256)
  returning id into v_evidence;
  insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
  values (v_uid, v_evidence, 'source_file', p_file_id, 'supports', 'direct', 'user');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', 'SOURCE_UPLOADED', 'source_file', p_file_id,
          jsonb_build_object('source_type', p_source_type, 'intake_method', p_intake_method,
                             'pipeline_state', v_state, 'sha256', p_sha256), p_correlation_id);
  return jsonb_build_object('source_id', p_source_id, 'file_id', p_file_id, 'status', v_state, 'duplicate_of_file_id', v_dup);
end $$;

create or replace function public.intake_register_manual_report(
  p_client_request_id text, p_subject_type text, p_statement text, p_context text, p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_source uuid;
  v_report uuid;
  v_evidence uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(btrim(p_statement), '') = '' then raise exception 'VALIDATE_REQUIRED_FIELD' using errcode = '22023'; end if;
  -- DR-C: canonical 18A entity names only, plus unknown
  if p_subject_type not in ('accounts', 'transactions', 'income', 'expenses', 'payments', 'obligations', 'receivables',
                            'loans', 'debts', 'agreements', 'legal_cases', 'events', 'assets', 'credit_facilities',
                            'taxes', 'government_records', 'unknown') then
    raise exception 'VALIDATE_ENUM' using errcode = '22023';
  end if;

  select id into v_source from public.sources
   where owner_user_id = v_uid and metadata_json ->> 'client_request_id' = p_client_request_id;
  if v_source is not null then
    return (select jsonb_build_object('source_id', v_source, 'user_report_id', r.id) from public.user_reports r where r.source_id = v_source limit 1);
  end if;

  insert into public.sources (owner_user_id, source_type, source_name, context, metadata_json)
  values (v_uid, 'user_report', 'דיווח ידני', p_context,
          jsonb_build_object('client_request_id', p_client_request_id, 'intake_method', 'manual_report'))
  returning id into v_source;
  insert into public.user_reports (owner_user_id, source_id, subject_type, statement)
  values (v_uid, v_source, p_subject_type, p_statement) returning id into v_report;
  insert into public.evidence (owner_user_id, evidence_type, source_id, quoted_value, capture_method)
  values (v_uid, 'user_report', v_source, to_jsonb(p_statement), 'manual') returning id into v_evidence;
  insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
  values (v_uid, v_evidence, 'user_report', v_report, 'supports', 'direct', 'user');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', 'USER_REPORT_RECORDED', 'user_report', v_report,
          jsonb_build_object('subject_type', p_subject_type), p_correlation_id);
  return jsonb_build_object('source_id', v_source, 'user_report_id', v_report);
end $$;

revoke all on function public.intake_register_file(text, text, text, text, uuid, uuid, text, text, text, bigint, text, text, uuid) from public, anon;
revoke all on function public.intake_register_manual_report(text, text, text, text, uuid) from public, anon;
grant execute on function public.intake_register_file(text, text, text, text, uuid, uuid, text, text, text, bigint, text, text, uuid) to authenticated;
grant execute on function public.intake_register_manual_report(text, text, text, text, uuid) to authenticated;
