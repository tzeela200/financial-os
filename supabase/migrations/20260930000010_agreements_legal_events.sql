-- 010 agreements, legal cases, events (18A §26-28, §50). SELECT-only for the user.
-- Events: date_precision governs which date fields may be set; no day is invented for month/year/range (18A §10, 23B §51).
-- events.status uses record_lifecycle (18A §36); agreement_installments.status is named without values -> free text.
-- An Event is a fact, not a Finding (18A §28): factual_description only.

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  agreement_type_code text not null check (agreement_type_code in ('settlement', 'payment_plan', 'restructure', 'other')),
  signed_date date,
  effective_date date,
  agreed_amount_minor bigint check (agreed_amount_minor is null or agreed_amount_minor >= 0),
  currency_code char(3),
  status text not null default 'unknown' check (status in ('draft', 'active', 'completed', 'breached', 'cancelled', 'unknown')),
  terms_json jsonb,
  primary_document_id uuid references public.documents(id) on delete restrict,
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (agreed_amount_minor is null or currency_code is not null)
);

create table public.agreement_installments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  agreement_id uuid not null references public.agreements(id) on delete restrict,
  installment_no int not null check (installment_no > 0),
  due_date date,
  principal_minor bigint,
  interest_minor bigint,
  fee_minor bigint,
  total_minor bigint,
  currency_code char(3),
  status text,
  payment_id uuid references public.payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agreement_id, installment_no),
  check ((principal_minor is null and interest_minor is null and fee_minor is null and total_minor is null) or currency_code is not null)
);

create table public.legal_cases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  case_type_code text not null check (case_type_code in ('enforcement', 'court', 'collection', 'authority', 'other')),
  authority_party_id uuid references public.parties(id) on delete restrict,
  case_number text,
  open_date date,
  close_date date,
  claimant_party_id uuid references public.parties(id) on delete restrict,
  respondent_party_id uuid references public.parties(id) on delete restrict,
  original_claim_minor bigint,
  reported_balance_minor bigint,
  currency_code char(3),
  status text not null default 'unknown' check (status in ('open', 'closed', 'stayed', 'settled', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((original_claim_minor is null and reported_balance_minor is null) or currency_code is not null),
  check (close_date is null or open_date is null or close_date >= open_date)
);
-- 18A §50: authority + case_number identifies a case when both exist
create unique index legal_cases_authority_number_uq on public.legal_cases (owner_user_id, authority_party_id, case_number)
  where authority_party_id is not null and case_number is not null;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  event_type_code text not null,
  event_date date,
  event_at timestamptz,
  period_start date,
  period_end date,
  date_precision text not null default 'unknown' check (date_precision in ('day', 'month', 'year', 'range', 'unknown')),
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  amount_minor bigint,
  currency_code char(3),
  factual_description text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'void')),
  parent_event_id uuid references public.events(id) on delete restrict,
  lifecycle_type text,
  lifecycle_id uuid,
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (amount_minor is null or currency_code is not null),
  check (period_end is null or period_start is null or period_end >= period_start),
  check ((lifecycle_type is null) = (lifecycle_id is null)),
  -- precision rules: an exact day only when the source knows the day
  check (case date_precision
           when 'day' then event_date is not null
           when 'unknown' then event_date is null and event_at is null
           else event_date is null and event_at is null and period_start is not null and period_end is not null
         end)
);
create index events_lifecycle_idx on public.events (lifecycle_type, lifecycle_id);
create index events_dates_idx on public.events (event_date, period_start);

do $$
declare t text;
begin
  foreach t in array array['agreements', 'agreement_installments', 'legal_cases', 'events'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
