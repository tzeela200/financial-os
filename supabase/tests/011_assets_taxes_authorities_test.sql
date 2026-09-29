-- Assets, taxes, government records (18A §29, §31-32). Storage only; tax logic lives in engines (18A §31).
begin;
select plan(9);

select has_table('public','assets','assets exists');
select has_table('public','taxes','taxes exists');
select has_table('public','government_records','government_records exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

select lives_ok($$insert into public.taxes (owner_user_id, tax_type_code, record_type_code, period_start, period_end, tax_due_minor, currency_code, status) values ('11111111-1111-1111-1111-111111111111','vat','return','2026-07-01','2026-08-31',123400,'ILS','filed')$$, 'VAT return period stored');
select throws_ok($$insert into public.taxes (owner_user_id, tax_type_code, record_type_code, status) values ('11111111-1111-1111-1111-111111111111','vat','report','filed')$$, '23514', null, 'tax record type limited to glossary');
select throws_ok($$insert into public.government_records (owner_user_id, record_type_code, amount_minor, status) values ('11111111-1111-1111-1111-111111111111','charge',5000,'open')$$, '23514', null, 'government amount requires currency (not hard-coded ILS)');
select throws_ok($$insert into public.assets (owner_user_id, asset_type_code, reported_value_minor, currency_code, status) values ('11111111-1111-1111-1111-111111111111','savings',1000,'ILS','active')$$, '23514', null, 'asset value requires valuation date');
select throws_ok($$insert into public.taxes (owner_user_id, tax_type_code, record_type_code, status, period_start, period_end) values ('11111111-1111-1111-1111-111111111111','vat','return','open','2026-08-31','2026-07-01')$$, '23514', null, 'tax period end before start rejected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.taxes (tax_type_code, record_type_code, status) values ('vat','return','draft')$$, '42501', null, 'direct canonical insert by user is blocked');

select * from finish();
rollback;
