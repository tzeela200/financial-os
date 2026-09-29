-- 017 exceptions, review queue, QA (18B §12; 18C §13-17, §47). SELECT-only for the user.
-- One review queue for user decisions (18C §15); technical failures are not review items (Review Queue != DLQ, 18D §10B).
-- QA is independent of the engine that produced the result (18C §16).
-- Values not defined in the spec are free text: reason_code, qa_profile, scope_type, check_code, resolution_status.
-- Severity uses the exception severity axis (18B §12.2).

create table public.qa_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  scope_type text not null,
  scope_id uuid,
  qa_profile text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'passed', 'passed_with_warnings', 'failed')),
  trigger text not null check (trigger in ('ingestion', 'reprocess', 'manual', 'pre_publish', 'pre_action')),
  checks_total int not null default 0 check (checks_total >= 0),
  checks_passed int not null default 0 check (checks_passed >= 0),
  checks_warned int not null default 0 check (checks_warned >= 0),
  checks_failed int not null default 0 check (checks_failed >= 0),
  processing_version text,
  summary text,
  correlation_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (checks_passed + checks_warned + checks_failed <= checks_total)
);

create table public.qa_check_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  qa_run_id uuid not null references public.qa_runs(id) on delete restrict,
  check_code text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  result text not null check (result in ('passed', 'warned', 'failed')),
  expected jsonb,
  actual jsonb,
  entity_type text,
  entity_id uuid,
  evidence_refs jsonb not null default '[]'::jsonb,
  resolution_status text,
  created_at timestamptz not null default now(),
  check ((entity_type is null) = (entity_id is null))
);
create index qa_check_results_run_idx on public.qa_check_results (qa_run_id, severity, result);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  exception_type text not null check (exception_type in ('missing_required_field', 'unsupported_format', 'duplicate_source', 'ambiguous_match', 'amount_mismatch', 'currency_mismatch', 'period_gap', 'stale_data', 'rule_not_resolved', 'processing_failure', 'evidence_missing')),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'accepted_difference', 'invalidated')),
  entity_type text,
  entity_id uuid,
  description text,
  qa_check_result_id uuid references public.qa_check_results(id) on delete restrict,
  correlation_id uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((entity_type is null) = (entity_id is null))
);
create index exceptions_status_idx on public.exceptions (status, severity);

create table public.review_queue_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  item_type text not null check (item_type in ('reconciliation', 'contradiction', 'exception', 'finding', 'document', 'calculation', 'rule')),
  entity_type text not null,
  entity_id uuid not null,
  reason_code text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'waiting_for_source', 'waiting_for_professional', 'resolved', 'dismissed')),
  priority int not null default 0,
  blocking text check (blocking is null or blocking in ('canonical', 'prediction', 'action')),
  required_action text,
  assigned_to uuid references auth.users(id) on delete restrict,
  origin_ref jsonb,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_date date,
  resolved_at timestamptz,
  check (status not in ('resolved', 'dismissed') or resolved_at is not null)
);
create index review_queue_items_status_idx on public.review_queue_items (status, severity, created_at);

do $$
declare t text;
begin
  foreach t in array array['exceptions', 'review_queue_items'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['qa_runs', 'qa_check_results', 'exceptions', 'review_queue_items'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
