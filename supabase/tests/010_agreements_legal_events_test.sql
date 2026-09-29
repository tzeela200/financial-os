-- Agreements, legal cases, events (18A §26-28, §50; 23B §51: no invented day)
begin;
select plan(11);

select has_table('public','agreements','agreements exists');
select has_table('public','agreement_installments','agreement_installments exists');
select has_table('public','legal_cases','legal_cases exists');
select has_table('public','events','events exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.parties (id, owner_user_id, party_type, name_original) values ('eeeeeeee-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','authority','Execution Office');

-- 23B §51: a source that only knows 03/2021 must not get an invented day
select lives_ok($$insert into public.events (owner_user_id, event_type_code, period_start, period_end, date_precision, factual_description) values ('11111111-1111-1111-1111-111111111111','garnishment','2021-03-01','2021-03-31','month','garnishment imposed in March 2021')$$, 'month-precision event stored as a period');
select throws_ok($$insert into public.events (owner_user_id, event_type_code, event_date, date_precision, factual_description) values ('11111111-1111-1111-1111-111111111111','garnishment','2021-03-01','month','x')$$, '23514', null, 'month precision cannot carry an exact day');
select throws_ok($$insert into public.events (owner_user_id, event_type_code, date_precision, factual_description) values ('11111111-1111-1111-1111-111111111111','x','day','x')$$, '23514', null, 'day precision requires event_date');

select lives_ok($$insert into public.legal_cases (owner_user_id, case_type_code, authority_party_id, case_number, status) values ('11111111-1111-1111-1111-111111111111','enforcement','eeeeeeee-0000-0000-0000-000000000009','12-34567-89-0','open')$$, 'legal case recorded');
select throws_ok($$insert into public.legal_cases (owner_user_id, case_type_code, authority_party_id, case_number, status) values ('11111111-1111-1111-1111-111111111111','enforcement','eeeeeeee-0000-0000-0000-000000000009','12-34567-89-0','open')$$, '23505', null, 'same authority + case number is one case (18A §50)');
select throws_ok($$insert into public.agreements (owner_user_id, agreement_type_code, status) values ('11111111-1111-1111-1111-111111111111','settlement','signed')$$, '23514', null, 'agreement status limited to glossary');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.events (event_type_code, date_precision, factual_description) values ('x','unknown','x')$$, '42501', null, 'direct canonical insert by user is blocked');

select * from finish();
rollback;
