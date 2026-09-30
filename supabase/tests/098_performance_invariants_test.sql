-- Performance invariants from supabase-postgres-best-practices (loaded per ADR-008 during Stage 1 closure):
-- schema-foreign-key-indexes, security-rls-performance.
begin;
select plan(2);

-- every FK column in public is the leading column of some index
select is_empty($$
  select c.conrelid::regclass || '.' || a.attname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  join pg_namespace n on n.oid = (select relnamespace from pg_class where oid = c.conrelid)
  where c.contype = 'f' and n.nspname = 'public'
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
$$, 'every foreign key column is indexed');

-- owner policies use the cached (select auth.uid()) pattern, not a per-row function call
select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and (coalesce(qual, '') like '%is_owner(%' or coalesce(with_check, '') like '%is_owner(%')
$$, 'no policy calls is_owner() per row');

select * from finish();
rollback;
