-- 012 N:M relationship tables (18A §37). SELECT-only for the user; written server-side.
-- Typed FK link tables for critical financial relations; polymorphic (entity_type + entity_id) only for
-- generic document/source/event links, as 18A §37 allows.
-- finding_evidence_links and entity_field_sources are created with their dependencies (evidence, reconciliation,
-- calculation tables) in later migrations (dependency order, 18A §71).
-- relation_type values are not defined in 18A -> free text.

create table public.document_entity_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  relation_type text not null,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id, relation_type)
);
create index document_entity_links_entity_idx on public.document_entity_links (entity_type, entity_id);

create table public.entity_source_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  source_id uuid not null references public.sources(id) on delete restrict,
  relation_type text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, source_id, relation_type)
);
create index entity_source_links_entity_idx on public.entity_source_links (entity_type, entity_id);
-- at most one primary source per entity
create unique index entity_source_links_one_primary_uq on public.entity_source_links (entity_type, entity_id) where is_primary;

create table public.expense_transaction_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  created_at timestamptz not null default now(),
  primary key (expense_id, transaction_id)
);

create table public.income_transaction_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  income_id uuid not null references public.income(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  created_at timestamptz not null default now(),
  primary key (income_id, transaction_id)
);

create table public.loan_payment_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  allocated_amount_minor bigint check (allocated_amount_minor is null or allocated_amount_minor >= 0),
  allocation_json jsonb,
  created_at timestamptz not null default now(),
  primary key (loan_id, payment_id)
);

create table public.debt_payment_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  debt_id uuid not null references public.debts(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  created_at timestamptz not null default now(),
  primary key (debt_id, payment_id)
);

create table public.debt_agreement_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  debt_id uuid not null references public.debts(id) on delete restrict,
  agreement_id uuid not null references public.agreements(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (debt_id, agreement_id)
);

create table public.legal_case_debt_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  legal_case_id uuid not null references public.legal_cases(id) on delete restrict,
  debt_id uuid not null references public.debts(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (legal_case_id, debt_id)
);

create table public.legal_case_document_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  legal_case_id uuid not null references public.legal_cases(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (legal_case_id, document_id)
);

create table public.event_entity_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  relation_type text not null,
  created_at timestamptz not null default now(),
  unique (event_id, entity_type, entity_id, relation_type)
);
create index event_entity_links_entity_idx on public.event_entity_links (entity_type, entity_id);

-- 18A §49: allocations against a transaction cannot exceed the transaction amount
create or replace function public.enforce_transaction_allocation_cap() returns trigger
language plpgsql set search_path = '' as $$
declare total bigint; cap bigint;
begin
  select amount_minor into cap from public.transactions where id = new.transaction_id;
  select coalesce(sum(allocated_amount_minor), 0) into total from (
    select allocated_amount_minor from public.expense_transaction_links where transaction_id = new.transaction_id
    union all
    select allocated_amount_minor from public.income_transaction_links where transaction_id = new.transaction_id
  ) a;
  if total > cap then
    raise exception 'allocations (%) exceed transaction amount (%) for transaction %', total, cap, new.transaction_id
      using errcode = '23514';
  end if;
  return new;
end $$;
create constraint trigger trg_expense_tx_links_cap after insert or update on public.expense_transaction_links
  for each row execute function public.enforce_transaction_allocation_cap();
create constraint trigger trg_income_tx_links_cap after insert or update on public.income_transaction_links
  for each row execute function public.enforce_transaction_allocation_cap();

do $$
declare t text;
begin
  foreach t in array array['document_entity_links', 'entity_source_links', 'expense_transaction_links', 'income_transaction_links',
                           'loan_payment_links', 'debt_payment_links', 'debt_agreement_links', 'legal_case_debt_links',
                           'legal_case_document_links', 'event_entity_links'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
