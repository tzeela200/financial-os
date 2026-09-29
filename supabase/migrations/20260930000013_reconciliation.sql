-- 013 reconciliation scaffold (18A §38). Engine logic is Stage 4 (18B §8); this only stores results.
-- Supports 1:1, 1:N, N:1 and partial without deleting any source. SELECT-only for the user.
-- Candidate != Match: approved_at only with status 'matched'; rejected_at only with 'rejected' (23A §45, 23D §21).
-- reconciliation_type, candidate_type, member_role: named without values -> free text.

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reconciliation_type text not null,
  status text not null default 'candidate' check (status in ('unmatched', 'candidate', 'partial', 'matched', 'rejected', 'needs_review')),
  confidence_score numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  rule_version text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  check (approved_at is null or status = 'matched'),
  check (rejected_at is null or status = 'rejected')
);

create table public.reconciliation_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reconciliation_id uuid not null references public.reconciliations(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  member_role text not null,
  allocated_amount_minor bigint check (allocated_amount_minor is null or allocated_amount_minor >= 0),
  currency_code char(3),
  created_at timestamptz not null default now(),
  unique (reconciliation_id, entity_type, entity_id, member_role),
  check (allocated_amount_minor is null or currency_code is not null)
);
create index reconciliation_members_entity_idx on public.reconciliation_members (entity_type, entity_id);

create table public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  candidate_type text not null,
  left_ref jsonb not null check (left_ref ? 'entity_type' and left_ref ? 'entity_id'),
  right_ref jsonb not null check (right_ref ? 'entity_type' and right_ref ? 'entity_id'),
  score numeric(6,4),
  score_breakdown_json jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('unmatched', 'candidate', 'partial', 'matched', 'rejected', 'needs_review')),
  generated_by_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index match_candidates_status_idx on public.match_candidates (status);

do $$
declare t text;
begin
  foreach t in array array['reconciliations', 'match_candidates'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['reconciliations', 'reconciliation_members', 'match_candidates'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
