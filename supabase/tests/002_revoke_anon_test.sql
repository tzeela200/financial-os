-- future tables must also be closed to anon (default privileges)
begin;
select plan(2);
create table public.zz_probe (id int);
select is(has_table_privilege('anon', 'public.zz_probe', 'select'), false, 'new tables are not readable by anon');
select is(has_table_privilege('anon', 'public.app_profile', 'select'), false, 'existing tables are not readable by anon');
select * from finish();
rollback;
