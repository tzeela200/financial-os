-- Obligations & receivables (18A §22-23, §62, §72-73 scenario 3; glossary G-3)
begin;
select plan(11);

select has_table('public','obligations','obligations exists');
select has_table('public','obligation_occurrences','obligation_occurrences exists');
select has_table('public','receivables','receivables exists');
select col_is_null('public','obligations','amount_minor','obligation amount may be unknown (NULL, not 0)');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.parties (id, owner_user_id, party_type, name_original) values ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bank','Bank');
insert into public.accounts (id, owner_user_id, account_type_code, account_name, currency_code) values ('ffffffff-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','checking','עו"ש','ILS');
insert into public.obligations (id, owner_user_id, obligation_type_code, amount_minor, currency_code, status, recurrence_rule) values
  ('30000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','rent',450000,'ILS','expected','FREQ=MONTHLY');
insert into public.obligation_occurrences (id, owner_user_id, obligation_id, due_date, expected_amount_minor, currency_code, status) values
  ('31000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','30000000-0000-0000-0000-000000000001','2026-09-01',450000,'ILS','expected');
insert into public.transactions (id, owner_user_id, account_id, transaction_date, direction, amount_minor, currency_code) values
  ('40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-09-01','debit',450000,'ILS');

-- scenario 3: planned occurrence connected to actual transaction, plan kept
select lives_ok($$update public.obligation_occurrences set actual_transaction_id = '40000000-0000-0000-0000-000000000001', status = 'paid' where id = '31000000-0000-0000-0000-000000000001'$$, 'occurrence links to actual transaction');
select is((select expected_amount_minor from public.obligation_occurrences where id = '31000000-0000-0000-0000-000000000001'), 450000::bigint, 'planned amount preserved after linking');
select is((select count(*)::int from public.obligations where id = '30000000-0000-0000-0000-000000000001'), 1, 'obligation not deleted');

select throws_ok($$insert into public.obligation_occurrences (owner_user_id, obligation_id, due_date, status) values ('11111111-1111-1111-1111-111111111111','30000000-0000-0000-0000-000000000001','2026-10-01','partial')$$, '23514', null, 'occurrence has no partial status (G-3: partial via allocations)');
select throws_ok($$insert into public.obligations (owner_user_id, obligation_type_code, amount_minor, status) values ('11111111-1111-1111-1111-111111111111','rent',100,'expected')$$, '23514', null, 'obligation amount requires currency');
select throws_ok($$insert into public.receivables (owner_user_id, amount_minor, currency_code, status) values ('11111111-1111-1111-1111-111111111111',100,'ILS','received')$$, '23514', null, 'receivable status limited to glossary');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.obligations (obligation_type_code, status) values ('rent','planned')$$, '42501', null, 'direct canonical insert by user is blocked');

select * from finish();
rollback;
