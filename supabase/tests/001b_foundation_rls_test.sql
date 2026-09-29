-- Rule 4: RLS on foundation tables is exercised, not only declared.
begin;
select plan(8);

-- test users (rolled back at the end)
insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222', 'stranger@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- act as owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$insert into public.app_profile (user_id, display_name) values ('11111111-1111-1111-1111-111111111111', 'owner')$$, 'owner creates own profile');
select lives_ok($$insert into public.system_settings (key, value_json) values ('ui.density', '"comfortable"')$$, 'owner creates own setting');
select is((select count(*)::int from public.app_profile), 1, 'owner sees own profile');
select throws_ok($$insert into public.app_profile (user_id) values ('22222222-2222-2222-2222-222222222222')$$, '42501', null, 'owner cannot create profile for another user');

-- act as stranger
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.app_profile), 0, 'stranger sees no foreign profile');
select is((select count(*)::int from public.system_settings), 0, 'stranger sees no foreign settings');
update public.app_profile set display_name = 'hacked' where user_id = '11111111-1111-1111-1111-111111111111';
reset role;
select is((select display_name from public.app_profile where user_id = '11111111-1111-1111-1111-111111111111'), 'owner', 'stranger update had no effect');

-- anonymous: no access at all
set local role anon;
select throws_ok($$select count(*) from public.app_profile$$, '42501', null, 'anon has no access to profiles');

select * from finish();
rollback;
