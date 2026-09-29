-- 018 operations & audit (18C §26-27; 18D §5-10B, §40). SELECT-only for the user.
-- audit_events is append-only: no update/delete, not even by the table owner (trigger).
-- jobs: idempotency_key unique (18D §9); claiming via claim_next_job, server-only (18D §28: mutation server-side).
-- DLQ is a separate logical record (dead_letter_jobs), never a review item (18D §10B). DLQ status: free text (undefined).
-- processing_runs record every pipeline transition from/to/reason (18B §16.1).

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  from_state text check (from_state is null or from_state in ('uploaded', 'accepted', 'rejected', 'duplicate', 'classification_pending', 'classified', 'extraction_pending', 'extracted', 'normalization_pending', 'normalized', 'verification_pending', 'verified', 'reconciliation_pending', 'reconciled', 'qa_pending', 'ready_for_review', 'canonical_ready', 'canonical_promoted', 'projection_pending', 'ready', 'failed', 'needs_review', 'archived')),
  to_state text not null check (to_state in ('uploaded', 'accepted', 'rejected', 'duplicate', 'classification_pending', 'classified', 'extraction_pending', 'extracted', 'normalization_pending', 'normalized', 'verification_pending', 'verified', 'reconciliation_pending', 'reconciled', 'qa_pending', 'ready_for_review', 'canonical_ready', 'canonical_promoted', 'projection_pending', 'ready', 'failed', 'needs_review', 'archived')),
  reason text,
  actor_type text not null check (actor_type in ('user', 'system', 'rule', 'skill', 'ai')),
  processing_version text,
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);
create index processing_runs_entity_idx on public.processing_runs (entity_type, entity_id, created_at);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  job_type text not null check (job_type in ('process_source', 'reconcile_scope', 'quality_gate', 'promote_canonical', 'refresh_projections', 'reprocess_source', 'sync_external_source', 'create_export')),
  scope_type text not null,
  scope_id uuid,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'retry_wait', 'needs_review', 'cancelled')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'critical')),
  idempotency_key text not null unique,
  correlation_id uuid not null,
  attempt_count int not null default 0 check (attempt_count >= 0),
  max_attempts int not null check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_owner text,
  processing_version text,
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check (attempt_count <= max_attempts)
);
create index jobs_claim_idx on public.jobs (status, available_at) where status in ('queued', 'retry_wait');

create table public.dead_letter_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  error_history jsonb not null default '[]'::jsonb,
  attempt_history jsonb not null default '[]'::jsonb,
  provider_context jsonb,
  correlation_id uuid not null,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  event_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'system', 'rule', 'skill', 'ai')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  correlation_id uuid not null
);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, event_at desc);

create or replace function public.forbid_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;
create trigger trg_audit_events_immutable before update or delete on public.audit_events
  for each row execute function public.forbid_audit_mutation();

-- server-only job claiming (18D §7-11): skip locked rows, count the attempt
create or replace function public.claim_next_job(p_lock_owner text)
returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs
   where status in ('queued', 'retry_wait') and available_at <= now()
   order by case priority when 'critical' then 0 when 'high' then 1 else 2 end, created_at
   for update skip locked
   limit 1;
  if not found then
    return null;
  end if;
  update public.jobs
     set status = 'running', locked_at = now(), lock_owner = p_lock_owner,
         attempt_count = attempt_count + 1, started_at = coalesce(started_at, now())
   where id = j.id
  returning * into j;
  return j;
end $$;
revoke execute on function public.claim_next_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_job(text) to service_role;

create trigger trg_dead_letter_jobs_updated before update on public.dead_letter_jobs
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['processing_runs', 'jobs', 'dead_letter_jobs', 'audit_events'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
