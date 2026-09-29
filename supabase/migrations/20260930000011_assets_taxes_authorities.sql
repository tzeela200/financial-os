-- 011 assets, taxes, government records (18A §29, §31-32). SELECT-only for the user.
-- Storage only: tax/authority logic lives in the engines (18A §31, chapters 10-11).
-- No market value is invented: reported_value requires valuation_date (18A §29).
-- asset_type_code, liquidity_code: named without values -> free text. Currency is never hard-coded (18A §32).

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  asset_type_code text not null,
  institution_party_id uuid references public.parties(id) on delete restrict,
  owner_context text not null default 'unknown' check (owner_context in ('personal', 'business', 'mixed', 'unknown')),
  reported_value_minor bigint,
  currency_code char(3),
  valuation_date date,
  liquidity_code text,
  status text not null default 'unknown' check (status in ('active', 'closed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (reported_value_minor is null or (currency_code is not null and valuation_date is not null))
);

create table public.taxes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  authority_party_id uuid references public.parties(id) on delete restrict,
  tax_type_code text not null check (tax_type_code in ('vat', 'income_tax', 'withholding', 'other')),
  tax_year int check (tax_year is null or tax_year between 1990 and 2100),
  period_start date,
  period_end date,
  record_type_code text not null check (record_type_code in ('return', 'assessment', 'payment', 'credit', 'refund', 'demand')),
  reported_base_minor bigint,
  tax_due_minor bigint,
  tax_paid_minor bigint,
  credit_refund_minor bigint,
  balance_minor bigint,
  currency_code char(3),
  due_date date,
  filing_date date,
  payment_date date,
  status text not null default 'unknown' check (status in ('draft', 'filed', 'paid', 'open', 'closed', 'amended', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((reported_base_minor is null and tax_due_minor is null and tax_paid_minor is null
          and credit_refund_minor is null and balance_minor is null) or currency_code is not null),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index taxes_period_idx on public.taxes (tax_type_code, period_start, period_end);

create table public.government_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  authority_party_id uuid references public.parties(id) on delete restrict,
  record_type_code text not null check (record_type_code in ('charge', 'debt', 'right', 'benefit', 'refund', 'decision', 'demand')),
  period_start date,
  period_end date,
  amount_minor bigint,
  balance_minor bigint,
  currency_code char(3),
  due_date date,
  status text not null default 'unknown' check (status in ('open', 'paid', 'approved', 'rejected', 'pending', 'closed', 'unknown')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((amount_minor is null and balance_minor is null) or currency_code is not null),
  check (period_end is null or period_start is null or period_end >= period_start)
);

do $$
declare t text;
begin
  foreach t in array array['assets', 'taxes', 'government_records'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
