-- 015 coverage & knowledge scaffold (18A §33-34; 18C §8-9, §12, §20-22). SELECT-only for the user.
-- 18C coverage_requirements/coverage_results are mapped onto 18A coverage_scopes/coverage_periods (no duplicate schema, CL-0010).
-- Findings: knowledge_type limited to the six of 18C §22; knowledge_items may use all eight of 18C §8.
-- contradictions.left/right_evidence_id get their FK to evidence in the trust migration (dependency order).
-- data_gaps.severity uses the exception severity axis (18B §12.2). Values not defined in the spec are free text:
-- gap_type, data_gaps.status, investigation_type, investigations.status, created_by / created_by_type.

create table public.coverage_scopes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  domain text not null check (domain in ('bank', 'credit', 'green_invoice', 'accounting', 'tax', 'bit', 'enforcement', 'loan', 'other')),
  source_ref text not null,
  entity_type text,
  entity_id uuid,
  period_start date,
  period_end date,
  expected_frequency text check (expected_frequency is null or expected_frequency in ('monthly', 'bimonthly', 'annual', 'event_based')),
  required boolean not null default true,
  received_status text not null default 'missing' check (received_status in ('received', 'partial', 'missing', 'not_applicable')),
  freshness_limit interval,
  blocking_scope text check (blocking_scope is null or blocking_scope in ('snapshot', 'vat', 'planning', 'investigation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity_type is null) = (entity_id is null)),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table public.coverage_periods (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  scope_id uuid not null references public.coverage_scopes(id) on delete restrict,
  expected_from date not null,
  expected_to date not null,
  covered_from date,
  covered_to date,
  status text not null default 'unknown' check (status in ('unknown', 'none', 'partial', 'complete', 'stale')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_to >= expected_from),
  check (covered_to is null or covered_from is null or covered_to >= covered_from)
);
create index coverage_periods_scope_idx on public.coverage_periods (scope_id, expected_from, expected_to);

create table public.data_gaps (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  gap_type text not null,
  subject text not null,
  scope_id uuid references public.coverage_scopes(id) on delete restrict,
  period_start date,
  period_end date,
  severity text not null default 'medium' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  impact text,
  status text,
  required_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  investigation_type text not null,
  title text not null,
  scope_json jsonb not null default '{}'::jsonb,
  status text,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text,
  next_step text,
  created_by text,
  updated_at timestamptz not null default now()
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  investigation_id uuid references public.investigations(id) on delete restrict,
  finding_type text not null check (finding_type in ('missing', 'partial', 'mismatch', 'duplicate', 'overpayment', 'underpayment', 'tax_issue', 'legal_issue', 'pattern', 'other')),
  title text not null,
  description text,
  knowledge_type text not null check (knowledge_type in ('fact', 'calculation', 'interpretation', 'hypothesis', 'contradiction', 'open_question')),
  reliability_status text not null default 'unknown' check (reliability_status in ('direct_verified', 'calculated', 'supported', 'reported', 'estimated', 'needs_verification', 'unknown', 'contradicted')),
  materiality text check (materiality is null or materiality in ('low', 'medium', 'high', 'critical')),
  subject_entity_type text,
  subject_entity_id uuid,
  amount_minor bigint,
  currency_code char(3),
  period_start date,
  period_end date,
  status text not null default 'open' check (status in ('open', 'verified', 'rejected', 'resolved', 'superseded', 'not_applicable')),
  requires_professional_review boolean not null default false,
  evidence_summary text,
  next_question text,
  created_by_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (amount_minor is null or currency_code is not null),
  check ((subject_entity_type is null) = (subject_entity_id is null)),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index findings_investigation_idx on public.findings (investigation_id);

create table public.contradictions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  contradiction_type text not null check (contradiction_type in ('amount', 'date', 'party', 'document_number', 'status', 'category', 'balance', 'legal_rule', 'other')),
  entity_type text,
  entity_id uuid,
  left_evidence_id uuid not null,
  right_evidence_id uuid not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'accepted_difference', 'invalidated')),
  resolution_type text check (resolution_type is null or resolution_type in ('source_precedence', 'manual_confirmation', 'additional_evidence', 'calculation', 'explained_difference')),
  resolution_note text,
  resolved_by text check (resolved_by is null or resolved_by in ('user', 'system_rule', 'professional')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_evidence_id <> right_evidence_id),
  check ((entity_type is null) = (entity_id is null)),
  check (status not in ('resolved', 'accepted_difference') or (resolution_type is not null and resolved_at is not null))
);
create index contradictions_status_idx on public.contradictions (status, severity, entity_type, entity_id);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  knowledge_type text not null check (knowledge_type in ('fact', 'calculation', 'interpretation', 'hypothesis', 'contradiction', 'open_question', 'decision', 'investigation_status')),
  statement text not null,
  subject_entity_type text,
  subject_entity_id uuid,
  reliability_status text not null default 'unknown' check (reliability_status in ('direct_verified', 'calculated', 'supported', 'reported', 'estimated', 'needs_verification', 'unknown', 'contradicted')),
  created_by_type text,
  created_at timestamptz not null default now(),
  check ((subject_entity_type is null) = (subject_entity_id is null))
);

do $$
declare t text;
begin
  foreach t in array array['coverage_scopes', 'coverage_periods', 'data_gaps', 'investigations', 'findings', 'contradictions'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['coverage_scopes', 'coverage_periods', 'data_gaps', 'investigations', 'findings', 'contradictions', 'knowledge_items'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
