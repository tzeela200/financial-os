-- 020 performance hardening from supabase-postgres-best-practices (Stage 1 closure review, ADR-008):
--  (1) schema-foreign-key-indexes: index every FK column that is not already the leading column of an index.
--  (2) security-rls-performance: owner policies use ((select auth.uid()) = owner) - evaluated once per statement -
--      instead of calling public.is_owner(owner) per row. Semantics are unchanged (same predicate).
-- Deterministic: the same catalog state always yields the same indexes/policies (fresh DB or upgrade).

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, cl.relname as tname, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
    order by 2, 3
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.tname || '_' || r.col || '_fkidx', 63), r.tbl, r.col);
  end loop;
end $$;

do $$
declare p record; new_qual text; new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public' and (coalesce(qual, '') like '%is_owner(%' or coalesce(with_check, '') like '%is_owner(%')
  loop
    new_qual  := regexp_replace(p.qual,       'is_owner\(([a-z_]+)\)', '((select auth.uid()) = \1)', 'g');
    new_check := regexp_replace(p.with_check, 'is_owner\(([a-z_]+)\)', '((select auth.uid()) = \1)', 'g');
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, new_qual, new_check);
    elsif p.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, new_qual);
    else
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, new_check);
    end if;
  end loop;
end $$;
