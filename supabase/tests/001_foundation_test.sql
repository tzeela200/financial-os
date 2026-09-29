begin;
select plan(5);
select has_table('public', 'app_profile', 'app_profile exists');
select has_table('public', 'processing_versions', 'processing_versions exists');
select has_function('public', 'set_updated_at', 'set_updated_at exists');
select has_function('public', 'is_owner', array['uuid'], 'is_owner exists');
select col_type_is('public', 'app_profile', 'timezone', 'text', 'timezone is text');
select * from finish();
rollback;
