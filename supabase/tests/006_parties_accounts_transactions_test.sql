-- Canonical core I (18A §17-19, §50, §72). Canonical = SELECT only for the user (23D §13).
begin;
select plan(14);

select has_table('public','parties','parties exists');
select has_table('public','party_aliases','party_aliases exists');
select has_table('public','party_roles','party_roles exists');
select has_table('public','party_identifiers','party_identifiers exists');
select has_table('public','accounts','accounts exists');
select has_table('public','transactions','transactions exists');
select fk_ok('public','documents','issuer_party_id','public','parties','id');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','stranger@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.parties (id, owner_user_id, party_type, name_original) values ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bank','Bank Leumi');
insert into public.accounts (id, owner_user_id, institution_party_id, account_type_code, account_name, currency_code, masked_identifier) values
  ('ffffffff-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','eeeeeeee-0000-0000-0000-000000000001','checking','עו"ש','ILS','1234');

select throws_ok($$insert into public.transactions (owner_user_id, account_id, transaction_date, direction, amount_minor) values ('11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-08-01','debit',6700)$$, '23502', null, 'transaction amount requires currency');
select throws_ok($$insert into public.transactions (owner_user_id, account_id, transaction_date, direction, amount_minor, currency_code) values ('11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-08-01','out',6700,'ILS')$$, '23514', null, 'direction limited to debit/credit');
select lives_ok($$insert into public.transactions (owner_user_id, account_id, transaction_date, direction, amount_minor, currency_code, external_transaction_id) values ('11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-08-01','debit',6700,'ILS','BL-1')$$, 'server records a transaction');
select throws_ok($$insert into public.transactions (owner_user_id, account_id, transaction_date, direction, amount_minor, currency_code, external_transaction_id) values ('11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-08-01','debit',6700,'ILS','BL-1')$$, '23505', null, 'same external id in same account is a duplicate (18A §50)');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select is((select count(*)::int from public.transactions), 1, 'owner reads own transactions');
select throws_ok($$insert into public.transactions (account_id, transaction_date, direction, amount_minor, currency_code) values ('ffffffff-0000-0000-0000-000000000001','2026-08-02','credit',100,'ILS')$$, '42501', null, 'direct canonical insert by user is blocked (23D §13)');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.accounts) + (select count(*)::int from public.transactions) + (select count(*)::int from public.parties), 0, 'stranger sees no foreign canonical data');

select * from finish();
rollback;
