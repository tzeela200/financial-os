-- 008 obligations & receivables (18A §22-23, §62). SELECT-only for the user.
-- Planned is never overwritten by Actual: occurrences keep expected_* and link to actual payment/transaction (18A §22, §62).
-- occurrence_status per glossary (G-3): no 'partial' value; partial payment is represented via payment_allocations.
-- obligation_type_code, payment_method_code, origin_type: named without values in 18A -> free text.

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_id uuid references public.parties(id) on delete restrict,
  obligation_type_code text not null,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  variable_amount_rule_json jsonb,
  currency_code char(3),
  start_date date,
  end_date date,
  next_due_date date,
  recurrence_rule text,
  payment_method_code text,
  account_id uuid references public.accounts(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'expected', 'due', 'paid', 'cancelled', 'paused', 'needs_verification')),
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (amount_minor is null or currency_code is not null),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.obligation_occurrences (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  obligation_id uuid not null references public.obligations(id) on delete restrict,
  due_date date not null,
  expected_amount_minor bigint check (expected_amount_minor is null or expected_amount_minor >= 0),
  currency_code char(3),
  status text not null default 'expected' check (status in ('expected', 'due', 'paid', 'overdue', 'cancelled')),
  actual_payment_id uuid references public.payments(id) on delete restrict,
  actual_transaction_id uuid references public.transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_amount_minor is null or currency_code is not null)
);
create index obligation_occurrences_obligation_idx on public.obligation_occurrences (obligation_id, due_date);

create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  debtor_party_id uuid references public.parties(id) on delete restrict,
  origin_type text,
  origin_id uuid,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency_code char(3),
  created_date date,
  due_date date,
  expected_date date,
  status text not null default 'expected' check (status in ('expected', 'partial', 'paid', 'overdue', 'cancelled', 'disputed')),
  outstanding_amount_minor bigint check (outstanding_amount_minor is null or outstanding_amount_minor >= 0),
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((amount_minor is null and outstanding_amount_minor is null) or currency_code is not null),
  check ((origin_type is null) = (origin_id is null))
);

do $$
declare t text;
begin
  foreach t in array array['obligations', 'obligation_occurrences', 'receivables'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
