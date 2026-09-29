-- 005 extracted layer (18A §15-16, §46, §57). Written server-side by engines; user has SELECT only.
-- No trigger promotes observations to canonical (18A §46).
-- document_family_code / document_type_code: dictionaries named in 18A §35 but values undefined -> free text until Stage 3.
-- issuer/recipient party FKs are added in the parties migration (dependency order 18A §71).

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_file_id uuid not null references public.source_files(id) on delete restrict,
  document_family_code text,
  document_type_code text,
  issuer_party_id uuid,
  recipient_party_id uuid,
  document_number text,
  issue_date date,
  period_start date,
  period_end date,
  currency_code char(3),
  gross_amount_minor bigint,
  net_amount_minor bigint,
  vat_amount_minor bigint,
  pipeline_state text not null default 'uploaded' check (pipeline_state in ('uploaded', 'accepted', 'rejected', 'duplicate', 'classification_pending', 'classified', 'extraction_pending', 'extracted', 'normalization_pending', 'normalized', 'verification_pending', 'verified', 'reconciliation_pending', 'reconciled', 'qa_pending', 'ready_for_review', 'canonical_ready', 'canonical_promoted', 'projection_pending', 'ready', 'failed', 'needs_review', 'archived')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  duplicate_group_id uuid,
  processing_version text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (period_end is null or period_start is null or period_end >= period_start),
  check ((gross_amount_minor is null and net_amount_minor is null and vat_amount_minor is null) or currency_code is not null)
);
create index documents_source_file_idx on public.documents (source_file_id);
create index documents_owner_idx on public.documents (owner_user_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  source_id uuid references public.sources(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  source_record_id uuid references public.source_records(id) on delete restrict,
  concept_code text not null,
  value_original text,
  value_normalized_json jsonb,
  data_type text not null,
  currency_code char(3),
  unit text,
  locator_json jsonb,
  extraction_method text not null check (extraction_method in ('parser', 'vision', 'skill', 'manual')),
  extraction_version text,
  confidence_score numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'rejected', 'needs_review', 'contradicted')),
  canonical_entity_type text,
  canonical_entity_id uuid,
  canonical_field text,
  unmapped boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_id is not null or document_id is not null or source_record_id is not null),
  check ((canonical_entity_type is null) = (canonical_entity_id is null))
);
create index observations_document_idx on public.observations (document_id, concept_code);
create index observations_source_idx on public.observations (source_id);
create index observations_owner_idx on public.observations (owner_user_id);

create trigger trg_documents_updated before update on public.documents for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
alter table public.documents force row level security;
create policy documents_owner_select on public.documents for select to authenticated using (public.is_owner(owner_user_id));
alter table public.observations enable row level security;
alter table public.observations force row level security;
create policy observations_owner_select on public.observations for select to authenticated using (public.is_owner(owner_user_id));
