-- Canonical core II (18A §11, §20-21, §49, §72): payment split, allocation cap, actuality separate from verification.
begin;
select plan(12);

select has_table('public','income','income exists');
select has_table('public','expenses','expenses exists');
select has_table('public','allocations','allocations exists');
select has_table('public','payments','payments exists');
select has_table('public','payment_transactions','payment_transactions exists');
select has_table('public','payment_allocations','payment_allocations exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.expenses (id, owner_user_id, expense_date, gross_minor, currency_code, actuality_status) values
  ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-08-01',30000,'ILS','actual'),
  ('10000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','2026-08-05',20000,'ILS','actual');
insert into public.payments (id, owner_user_id, payment_date, amount_minor, currency_code) values
  ('20000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-08-10',50000,'ILS');

select lives_ok($$insert into public.payment_allocations (owner_user_id, payment_id, target_entity_type, target_entity_id, allocated_amount_minor) values
  ('11111111-1111-1111-1111-111111111111','20000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000001',30000),
  ('11111111-1111-1111-1111-111111111111','20000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000002',20000)$$, 'one payment splits across two targets (18A §72)');
select throws_like($$insert into public.payment_allocations (owner_user_id, payment_id, target_entity_type, target_entity_id, allocated_amount_minor) values
  ('11111111-1111-1111-1111-111111111111','20000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000002',1)$$, '%exceed%', 'allocations cannot exceed the payment amount (18A §49)');
select throws_ok($$insert into public.expenses (owner_user_id, expense_date, gross_minor, actuality_status) values ('11111111-1111-1111-1111-111111111111','2026-08-01',100,'actual')$$, '23514', null, 'expense amount requires currency');
select throws_ok($$insert into public.expenses (owner_user_id, expense_date, currency_code, actuality_status) values ('11111111-1111-1111-1111-111111111111','2026-08-01','ILS','verified')$$, '23514', null, 'actuality_status is not a verification axis');
select is((select gross_minor from public.expenses where id='10000000-0000-0000-0000-000000000001'), 30000::bigint, 'NULL/0 distinction: stored amount unchanged');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.expenses (expense_date, currency_code) values ('2026-08-01','ILS')$$, '42501', null, 'direct canonical insert by user is blocked');

select * from finish();
rollback;
