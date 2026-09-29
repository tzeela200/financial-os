-- 007 canonical core II (18A §11, §20-21, §49). SELECT-only for the user.
-- duplicate_status, payments.status, payment_method_code, allocation_status: named in 18A without values
-- -> free text, open gap G-4 (to be decided before Stage 4). No values invented.
-- Enum CHECK lists below are copied from `node scripts/enum-checks.mjs <enum>` (glossary).

create table public.income (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_id uuid references public.parties(id) on delete restrict,
  event_date date,
  recognition_date date,
  receipt_date date,
  gross_minor bigint, net_minor bigint, vat_minor bigint,
  currency_code char(3),
  category_code text,
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  actuality_status text not null default 'expected' check (actuality_status in ('planned', 'expected', 'actual', 'cancelled')),
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched', 'candidate', 'partial', 'matched', 'rejected', 'needs_review')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((gross_minor is null and net_minor is null and vat_minor is null) or currency_code is not null)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  supplier_party_id uuid references public.parties(id) on delete restrict,
  expense_date date,
  gross_minor bigint, net_minor bigint, vat_minor bigint,
  currency_code char(3),
  category_code text,
  subcategory_code text,
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  actuality_status text not null default 'expected' check (actuality_status in ('planned', 'expected', 'actual', 'cancelled')),
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched', 'candidate', 'partial', 'matched', 'rejected', 'needs_review')),
  duplicate_status text,
  primary_source_id uuid references public.sources(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((gross_minor is null and net_minor is null and vat_minor is null) or currency_code is not null)
);

-- personal/business split with basis and source, not a bare percentage (18A §11)
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  context text not null check (context in ('personal', 'business', 'mixed', 'unknown')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null,
  basis text not null,
  source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  payer_party_id uuid references public.parties(id) on delete restrict,
  payee_party_id uuid references public.parties(id) on delete restrict,
  payment_date date,
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null,
  payment_method_code text,
  account_id uuid references public.accounts(id) on delete restrict,
  reference text,
  status text,
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.payment_transactions (
  payment_id uuid not null references public.payments(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, transaction_id)
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  target_entity_type text not null,
  target_entity_id uuid not null,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  allocation_status text,
  created_at timestamptz not null default now()
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_target_idx on public.payment_allocations (target_entity_type, target_entity_id);

-- 18A §49: allocated amounts cannot exceed the payment amount
create or replace function public.enforce_payment_allocation_cap() returns trigger
language plpgsql set search_path = '' as $$
declare total bigint; cap bigint;
begin
  select amount_minor into cap from public.payments where id = new.payment_id;
  if tg_table_name = 'payment_allocations' then
    select coalesce(sum(allocated_amount_minor), 0) into total from public.payment_allocations where payment_id = new.payment_id;
  else
    select coalesce(sum(allocated_amount_minor), 0) into total from public.payment_transactions where payment_id = new.payment_id;
  end if;
  if total > cap then
    raise exception 'allocations (%) exceed payment amount (%) for payment %', total, cap, new.payment_id
      using errcode = '23514';
  end if;
  return new;
end $$;
create constraint trigger trg_payment_allocations_cap after insert or update on public.payment_allocations
  for each row execute function public.enforce_payment_allocation_cap();
create constraint trigger trg_payment_transactions_cap after insert or update on public.payment_transactions
  for each row execute function public.enforce_payment_allocation_cap();

do $$
declare t text;
begin
  foreach t in array array['income', 'expenses', 'payments'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['income', 'expenses', 'allocations', 'payments', 'payment_transactions', 'payment_allocations'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
