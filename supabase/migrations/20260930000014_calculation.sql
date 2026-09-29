-- 014 calculation scaffold (18A §39; 18C §24; 23 §35-36). Deterministic engines arrive in Stage 6.
-- Reproducibility: every run stores formula_version and input_hash; inputs are listed with their version/hash.
-- NULL != 0: a result with coverage 'none' or 'unknown' cannot hold an amount (23 §35, 23B §8, §37).
-- calculation_runs.status uses the processing_status axis (18A §36). calculation_type, metric_code: free text
-- (18A §39 gives examples, not a closed list).

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  calculation_type text not null,
  formula_version text not null,
  as_of_date date,
  period_start date,
  period_end date,
  input_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'needs_review', 'archived')),
  correlation_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index calculation_runs_type_idx on public.calculation_runs (calculation_type, formula_version, as_of_date);

create table public.calculation_inputs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete restrict,
  input_entity_type text not null,
  input_entity_id uuid not null,
  input_version text,
  input_hash text,
  unique (calculation_run_id, input_entity_type, input_entity_id)
);

create table public.calculation_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete restrict,
  metric_code text not null,
  amount_minor bigint,
  value_json jsonb,
  currency_code char(3),
  coverage_status text not null default 'unknown' check (coverage_status in ('unknown', 'none', 'partial', 'complete', 'stale')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  confidence_level text not null default 'unknown' check (confidence_level in ('high', 'medium', 'low', 'unknown')),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, metric_code),
  check (amount_minor is null or currency_code is not null),
  check (coverage_status not in ('none', 'unknown') or amount_minor is null)
);

do $$
declare t text;
begin
  foreach t in array array['calculation_runs', 'calculation_inputs', 'calculation_results'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
