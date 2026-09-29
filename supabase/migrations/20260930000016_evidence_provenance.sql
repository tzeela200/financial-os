-- 016 evidence & provenance (18A §45; 18C §5-7, §25, §30; 18E rule registry). SELECT-only for the user.
-- Evidence points at the finest locator available (page/sheet/row/cell). Links are never deleted:
-- they are marked superseded/invalidated (18C §6). AI/tool confidence is stored raw and never becomes truth (18C §25).
-- tool_runs keep model/prompt versions for reproducibility (23D §132-133).

create table public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  tool_type text not null check (tool_type in ('skill', 'ai', 'parser', 'rule_engine')),
  tool_name text not null,
  version text not null,
  model text,
  prompt_version text,
  input_refs jsonb not null default '[]'::jsonb,
  input_hash text,
  output_ref jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('success', 'failed', 'partial')),
  confidence_raw numeric(6,4),
  accepted boolean,
  accepted_by text check (accepted_by is null or accepted_by in ('rule', 'user', 'system')),
  rejection_reason text,
  correlation_id uuid,
  check (accepted is distinct from true or accepted_by is not null)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('source_document', 'source_record', 'document_fragment', 'table_row', 'api_record', 'user_report', 'calculation_input', 'calculation_output', 'reconciliation_link', 'professional_response', 'official_rule', 'system_event')),
  source_id uuid not null references public.sources(id) on delete restrict,
  document_id uuid references public.documents(id) on delete restrict,
  source_record_id uuid references public.source_records(id) on delete restrict,
  page_number int check (page_number is null or page_number > 0),
  sheet_name text,
  row_number int check (row_number is null or row_number > 0),
  cell_range text,
  quoted_value jsonb not null,
  normalized_value jsonb,
  evidence_date date,
  captured_at timestamptz not null default now(),
  capture_method text not null check (capture_method in ('manual', 'api', 'parser', 'ocr', 'vision', 'import')),
  extractor_version text,
  checksum text,
  status text not null default 'active' check (status in ('active', 'superseded', 'invalidated', 'archived')),
  notes text
);
create index evidence_source_document_idx on public.evidence (source_id, document_id);

create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  relationship_type text not null check (relationship_type in ('supports', 'contradicts', 'derived_from', 'explains', 'verifies', 'replaces')),
  weight text not null check (weight in ('direct', 'supporting', 'contextual')),
  status text not null default 'active' check (status in ('active', 'superseded', 'invalidated', 'archived')),
  created_by_type text not null check (created_by_type in ('user', 'system', 'rule', 'skill', 'ai')),
  created_by_ref text,
  created_at timestamptz not null default now()
);
create index evidence_links_entity_idx on public.evidence_links (entity_type, entity_id);

create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  rule_id text not null,
  version text not null,
  domain text not null,
  valid_from date,
  valid_to date,
  jurisdiction text,
  source_evidence_id uuid references public.evidence(id) on delete restrict,
  logic_json jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'invalidated')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, rule_id, version),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table public.provenance_edges (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  from_entity_type text not null,
  from_entity_id uuid not null,
  to_entity_type text not null,
  to_entity_id uuid not null,
  step text not null,
  processing_version text,
  rule_version_id uuid references public.rule_versions(id) on delete restrict,
  tool_run_id uuid references public.tool_runs(id) on delete restrict,
  calculation_run_id uuid references public.calculation_runs(id) on delete restrict,
  reconciliation_id uuid references public.reconciliations(id) on delete restrict,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index provenance_edges_to_idx on public.provenance_edges (to_entity_type, to_entity_id);
create index provenance_edges_from_idx on public.provenance_edges (from_entity_type, from_entity_id);

-- 18A §45: which source/observation/reconciliation/calculation supplied a given field
create table public.entity_field_sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  source_id uuid references public.sources(id) on delete restrict,
  observation_id uuid references public.observations(id) on delete restrict,
  reconciliation_id uuid references public.reconciliations(id) on delete restrict,
  calculation_run_id uuid references public.calculation_runs(id) on delete restrict,
  is_primary boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  check (source_id is not null or observation_id is not null or reconciliation_id is not null or calculation_run_id is not null),
  check (valid_to is null or valid_to >= valid_from)
);
create index entity_field_sources_entity_idx on public.entity_field_sources (entity_type, entity_id, field_name);

create table public.finding_evidence_links (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  finding_id uuid not null references public.findings(id) on delete restrict,
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (finding_id, evidence_id)
);

-- deferred FKs: contradiction sides are evidence (18C §12)
alter table public.contradictions add constraint contradictions_left_evidence_fk foreign key (left_evidence_id) references public.evidence(id) on delete restrict;
alter table public.contradictions add constraint contradictions_right_evidence_fk foreign key (right_evidence_id) references public.evidence(id) on delete restrict;

do $$
declare t text;
begin
  foreach t in array array['tool_runs', 'evidence', 'evidence_links', 'rule_versions', 'provenance_edges', 'entity_field_sources', 'finding_evidence_links'] loop
    execute format('create index %1$s_owner_idx on public.%1$s (owner_user_id)', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('alter table public.%1$s force row level security', t);
    execute format('create policy %1$s_owner_select on public.%1$s for select to authenticated using (public.is_owner(owner_user_id))', t);
  end loop;
end $$;
