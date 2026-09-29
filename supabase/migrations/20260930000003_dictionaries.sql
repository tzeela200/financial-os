-- 003 dictionaries (18A §35): one table for all canonical enum dictionaries.
-- Values are seeded from docs/stage-0/glossary.json via scripts/generate-seed.mjs (single source of names).
create table public.dictionary_values (
  dictionary text not null,
  code text not null,
  label_he text,
  label_en text,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dictionary, code)
);
create trigger trg_dictionary_values_updated before update on public.dictionary_values
  for each row execute function public.set_updated_at();
alter table public.dictionary_values enable row level security;
alter table public.dictionary_values force row level security;
create policy dictionary_values_read on public.dictionary_values for select to authenticated using (true);
-- no insert/update/delete policy: writes only via migrations/seed
