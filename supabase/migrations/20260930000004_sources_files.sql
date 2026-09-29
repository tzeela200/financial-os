-- 004 raw source layer (18A §6, §13, §40-§44, §50). Raw is immutable for the user (23 §23):
-- owner may SELECT/INSERT; no UPDATE/DELETE policy. State changes happen server-side (Stage 2 RPC).
-- import_batches.status uses the canonical processing_status axis (18A §36);
-- source_records.status uses record_lifecycle (18A §36). No new status invented.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('bank_statement', 'credit_card_statement', 'p2p_payment', 'business_expense_export', 'business_income_export', 'accounting_ledger', 'tax_document', 'government_authority', 'loan_document', 'credit_report', 'debt_collection', 'enforcement', 'legal_document', 'local_authority', 'asset_right', 'payment_proof', 'correspondence', 'user_report', 'official_reference', 'prior_analysis')),
  source_name text not null,
  provider text,
  context text not null default 'unknown' check (context in ('personal', 'business', 'mixed', 'unknown')),
  external_ref text,
  acquired_at timestamptz not null default now(),
  effective_period_start date,
  effective_period_end date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (effective_period_end is null or effective_period_start is null or effective_period_end >= effective_period_start)
);

create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  storage_bucket text not null check (storage_bucket = 'financial-source-files'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count int check (page_count is null or page_count >= 0),
  uploaded_at timestamptz not null default now(),
  pipeline_state text not null default 'uploaded' check (pipeline_state in ('uploaded', 'accepted', 'rejected', 'duplicate', 'classification_pending', 'classified', 'extraction_pending', 'extracted', 'normalization_pending', 'normalized', 'verification_pending', 'verified', 'reconciliation_pending', 'reconciled', 'qa_pending', 'ready_for_review', 'canonical_ready', 'canonical_promoted', 'projection_pending', 'ready', 'failed', 'needs_review', 'archived')),
  processing_version text,
  duplicate_of_file_id uuid references public.source_files(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
-- exact-duplicate lookup; deliberately NOT unique (18A §44, §50)
create index source_files_owner_sha256_idx on public.source_files (owner_user_id, sha256);
create index source_files_source_idx on public.source_files (source_id);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('bank_statement', 'credit_card_statement', 'p2p_payment', 'business_expense_export', 'business_income_export', 'accounting_ledger', 'tax_document', 'government_authority', 'loan_document', 'credit_report', 'debt_collection', 'enforcement', 'legal_document', 'local_authority', 'asset_right', 'payment_proof', 'correspondence', 'user_report', 'official_reference', 'prior_analysis')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  input_count int check (input_count is null or input_count >= 0),
  accepted_count int check (accepted_count is null or accepted_count >= 0),
  rejected_count int check (rejected_count is null or rejected_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'needs_review', 'archived')),
  processing_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  import_batch_id uuid references public.import_batches(id) on delete restrict,
  source_row_key text,
  raw_json jsonb not null,
  row_number int,
  record_hash text not null,
  observed_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'archived', 'void')),
  created_at timestamptz not null default now(),
  unique (source_id, record_hash)
);
create index source_records_batch_idx on public.source_records (import_batch_id);

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  reported_at timestamptz not null default now(),
  subject_type text not null,
  statement text not null,
  structured_payload jsonb,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  created_at timestamptz not null default now()
);

-- updated_at triggers
create trigger trg_sources_updated before update on public.sources for each row execute function public.set_updated_at();
create trigger trg_source_files_updated before update on public.source_files for each row execute function public.set_updated_at();
create trigger trg_import_batches_updated before update on public.import_batches for each row execute function public.set_updated_at();

-- RLS: owner select + insert only (raw immutable for the user)
do $$
declare t text;
begin
  foreach t in array array['sources','source_files','import_batches','source_records','user_reports'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
    execute format('create policy %1$s_owner_insert on public.%1$s for insert to authenticated with check (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
