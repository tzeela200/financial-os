-- Loans, debts, credit facilities (18A §24-25, §30). Reported vs calculated kept apart; as-of required.
begin;
select plan(10);

select has_table('public','loans','loans exists');
select has_table('public','debts','debts exists');
select has_table('public','credit_facilities','credit_facilities exists');
select col_is_null('public','loans','calculated_balance_minor','calculated balance is derived and optional');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

select lives_ok($$insert into public.debts (owner_user_id, debt_type_code, original_amount_minor, currency_code, reported_balance_minor, reported_balance_as_of, status) values ('11111111-1111-1111-1111-111111111111','collection',1000000,'ILS',850000,'2026-08-31','open')$$, 'debt with reported balance and as-of');
select throws_ok($$insert into public.debts (owner_user_id, debt_type_code, original_amount_minor, currency_code, reported_balance_minor, status) values ('11111111-1111-1111-1111-111111111111','collection',1000000,'ILS',850000,'open')$$, '23514', null, 'reported balance requires as-of date');
select throws_ok($$insert into public.loans (owner_user_id, original_principal_minor, currency_code, interest_type_code, status) values ('11111111-1111-1111-1111-111111111111',100,'ILS','floating','active')$$, '23514', null, 'interest type limited to glossary');
select throws_ok($$insert into public.credit_facilities (owner_user_id, facility_type_code, limit_minor, status) values ('11111111-1111-1111-1111-111111111111','card',500000,'active')$$, '23514', null, 'facility limit requires currency');
select throws_ok($$insert into public.debts (owner_user_id, debt_type_code, currency_code, status) values ('11111111-1111-1111-1111-111111111111','x','ILS','paid')$$, '23514', null, 'debt status limited to glossary');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.loans (currency_code, status) values ('ILS','active')$$, '42501', null, 'direct canonical insert by user is blocked');

select * from finish();
rollback;
