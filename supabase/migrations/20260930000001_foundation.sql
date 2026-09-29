-- 001 foundation (18A §12, §71) — extensions, helpers, foundation tables
create extension if not exists pgcrypto with schema extensions;

-- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.is_owner(owner uuid) returns boolean
language sql stable set search_path = '' as $$
  select owner = (select auth.uid()) $$;

-- app_profile: the single user's profile
create table public.app_profile (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text,
  locale text not null default 'he-IL',
  timezone text not null default 'Asia/Jerusalem',
  default_currency char(3) not null default 'ILS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_app_profile_updated before update on public.app_profile
  for each row execute function public.set_updated_at();
alter table public.app_profile enable row level security;
alter table public.app_profile force row level security;
create policy app_profile_owner_select on public.app_profile for select to authenticated using (public.is_owner(user_id));
create policy app_profile_owner_insert on public.app_profile for insert to authenticated with check (public.is_owner(user_id));
create policy app_profile_owner_update on public.app_profile for update to authenticated using (public.is_owner(user_id)) with check (public.is_owner(user_id));

-- system_settings: non-secret product settings
create table public.system_settings (
  key text primary key,
  value_json jsonb not null,
  scope text not null default 'app',
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create trigger trg_system_settings_updated before update on public.system_settings
  for each row execute function public.set_updated_at();
alter table public.system_settings enable row level security;
alter table public.system_settings force row level security;
create policy system_settings_owner_select on public.system_settings for select to authenticated using (public.is_owner(owner_user_id));
create policy system_settings_owner_insert on public.system_settings for insert to authenticated with check (public.is_owner(owner_user_id));
create policy system_settings_owner_update on public.system_settings for update to authenticated using (public.is_owner(owner_user_id)) with check (public.is_owner(owner_user_id));

-- version registries (system-level, read-only for the user; written by migrations/server)
create table public.schema_versions (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  version text not null,
  effective_from timestamptz not null default now(),
  notes text,
  unique (component, version)
);
alter table public.schema_versions enable row level security;
create policy schema_versions_read on public.schema_versions for select to authenticated using (true);

create table public.processing_versions (
  id uuid primary key default gen_random_uuid(),
  component_type text not null check (component_type in ('parser','normalizer','calculator','reconciler','qa','projection')),
  component_name text not null,
  version text not null,
  released_at timestamptz not null default now(),
  active boolean not null default true,
  unique (component_type, component_name, version)
);
alter table public.processing_versions enable row level security;
create policy processing_versions_read on public.processing_versions for select to authenticated using (true);
