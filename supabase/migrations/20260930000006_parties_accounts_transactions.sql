-- 006 canonical core I (18A §17-19, §50). Canonical = SELECT only for the user; writes via server/RPC (Stage 5).
-- party_type, role_code, identifier_type, transaction_type_code: dictionaries named in 18A §35 without defined values -> free text.
-- Full account numbers are not stored (18A §18, §55: masked identifier by default).

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_type text not null,
  name_original text not null,
  name_normalized text,
  official_identifier text,
  country_code char(2),
  status text not null default 'active' check (status in ('active', 'archived', 'void')),
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.party_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  alias text not null,
  normalized_alias text,
  source_id uuid references public.sources(id) on delete restrict,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  created_at timestamptz not null default now()
);

create table public.party_roles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  role_code text not null,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.party_identifiers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete restrict,
  identifier_type text not null,
  identifier_value text not null,
  issuing_country char(2),
  issuing_authority text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  institution_party_id uuid references public.parties(id) on delete restrict,
  account_type_code text not null check (account_type_code in ('checking', 'savings', 'credit_card', 'payment_app', 'other')),
  account_name text not null,
  currency_code char(3) not null,
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  masked_identifier text,
  branch_code text,
  opened_date date,
  closed_date date,
  status text not null default 'unknown' check (status in ('active', 'closed', 'unknown')),
  reported_balance_minor bigint,
  available_balance_minor bigint,
  balance_as_of date,
  primary_source_id uuid references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (closed_date is null or opened_date is null or closed_date >= opened_date),
  check ((reported_balance_minor is null and available_balance_minor is null) or balance_as_of is not null)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  source_id uuid references public.sources(id) on delete restrict,
  source_record_id uuid references public.source_records(id) on delete restrict,
  external_transaction_id text,
  transaction_date date not null,
  value_date date,
  posting_date date,
  charge_date date,
  direction text not null check (direction in ('debit', 'credit')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code char(3) not null,
  original_amount_minor bigint,
  original_currency_code char(3),
  exchange_rate numeric(18,8),
  description_original text,
  description_normalized text,
  counterparty_id uuid references public.parties(id) on delete restrict,
  reference text,
  balance_after_minor bigint,
  transaction_type_code text,
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched', 'candidate', 'partial', 'matched', 'rejected', 'needs_review')),
  internal_transfer_pair_id uuid references public.transactions(id) on delete restrict,
  canonical_event_id uuid,
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((original_amount_minor is null) = (original_currency_code is null))
);
-- reliable external id is unique within an account (18A §50); fingerprint is a signal, not unique
create unique index transactions_account_external_uq on public.transactions (account_id, external_transaction_id) where external_transaction_id is not null;
create index transactions_account_date_idx on public.transactions (account_id, transaction_date);
create index transactions_fingerprint_idx on public.transactions (fingerprint);

-- deferred FKs from the extracted layer (18A §15)
alter table public.documents add constraint documents_issuer_party_fk foreign key (issuer_party_id) references public.parties(id) on delete restrict;
alter table public.documents add constraint documents_recipient_party_fk foreign key (recipient_party_id) references public.parties(id) on delete restrict;

-- triggers + RLS: canonical tables are SELECT-only for the user
do $$
declare t text;
begin
  foreach t in array array['parties','accounts','transactions'] loop
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['parties','party_aliases','party_roles','party_identifiers','accounts','transactions'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
