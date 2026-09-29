-- 009 loans, debts, credit facilities (18A §24-25, §30). SELECT-only for the user.
-- reported_* (from source) and calculated_* (derived) are separate columns; a reported balance requires its as-of date.
-- loan_terms / loan_schedules (18A §24) have no defined columns and are "only if required for calculation":
-- deferred to Stage 6 (calculations) rather than invented here.
-- payment_frequency_code, indexation_basis_code, debt_type_code: named without values -> free text.

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  lender_party_id uuid references public.parties(id) on delete restrict,
  borrower_context text not null default 'unknown' check (borrower_context in ('personal', 'business', 'mixed', 'unknown')),
  original_principal_minor bigint check (original_principal_minor is null or original_principal_minor >= 0),
  currency_code char(3),
  start_date date,
  maturity_date date,
  term_count int check (term_count is null or term_count > 0),
  payment_frequency_code text,
  interest_type_code text not null default 'unknown' check (interest_type_code in ('fixed', 'variable', 'prime', 'indexed', 'other', 'unknown')),
  stated_rate numeric(9,6),
  indexation_basis_code text,
  scheduled_payment_minor bigint,
  reported_balance_minor bigint,
  reported_balance_as_of date,
  calculated_balance_minor bigint,
  status text not null default 'unknown' check (status in ('active', 'closed', 'restructured', 'settled', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((original_principal_minor is null and scheduled_payment_minor is null and reported_balance_minor is null and calculated_balance_minor is null) or currency_code is not null),
  check (reported_balance_minor is null or reported_balance_as_of is not null),
  check (maturity_date is null or start_date is null or maturity_date >= start_date)
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  creditor_party_id uuid references public.parties(id) on delete restrict,
  debt_type_code text not null,
  original_amount_minor bigint check (original_amount_minor is null or original_amount_minor >= 0),
  currency_code char(3),
  start_date date,
  due_date date,
  reported_balance_minor bigint,
  reported_balance_as_of date,
  calculated_balance_minor bigint,
  principal_minor bigint,
  interest_minor bigint,
  indexation_minor bigint,
  fees_minor bigint,
  legal_fees_minor bigint,
  status text not null default 'unknown' check (status in ('open', 'arranged', 'settled', 'closed', 'disputed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((original_amount_minor is null and reported_balance_minor is null and calculated_balance_minor is null
          and principal_minor is null and interest_minor is null and indexation_minor is null
          and fees_minor is null and legal_fees_minor is null) or currency_code is not null),
  check (reported_balance_minor is null or reported_balance_as_of is not null)
);

create table public.credit_facilities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  institution_party_id uuid references public.parties(id) on delete restrict,
  linked_account_id uuid references public.accounts(id) on delete restrict,
  facility_type_code text not null check (facility_type_code in ('account', 'card', 'loan_line', 'other')),
  limit_minor bigint check (limit_minor is null or limit_minor >= 0),
  currency_code char(3),
  effective_from date,
  effective_to date,
  utilized_minor bigint,
  available_minor bigint,
  as_of_date date,
  status text not null default 'unknown' check (status in ('active', 'closed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((limit_minor is null and utilized_minor is null and available_minor is null) or currency_code is not null),
  check ((utilized_minor is null and available_minor is null) or as_of_date is not null),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

do $$
declare t text;
begin
  foreach t in array array['loans', 'debts', 'credit_facilities'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
