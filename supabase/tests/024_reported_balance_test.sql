-- Migration 024: a bank document's stated balance is stored as the account's REPORTED balance with its date, with
-- evidence + audit; an older document never overrides a newer balance; non-bank documents and other users are refused.
begin;
select plan(7);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','other@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000024/bbbbbbbb-0000-0000-0000-000000000024/original.pdf','11111111-1111-1111-1111-111111111111'),
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000025/bbbbbbbb-0000-0000-0000-000000000025/original.pdf','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r24','bank_statement','bank.pdf','unknown','aaaaaaaa-0000-0000-0000-000000000024','bbbbbbbb-0000-0000-0000-000000000024',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000024/bbbbbbbb-0000-0000-0000-000000000024/original.pdf','bank.pdf','application/pdf',10,repeat('a',64),'file',gen_random_uuid());
select public.intake_register_file('r25','credit_card_statement','card.pdf','unknown','aaaaaaaa-0000-0000-0000-000000000025','bbbbbbbb-0000-0000-0000-000000000025',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000025/bbbbbbbb-0000-0000-0000-000000000025/original.pdf','card.pdf','application/pdf',10,repeat('b',64),'file',gen_random_uuid());

create temp table t_bank as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000024','v1','bank_documents',gen_random_uuid()) as id;
create temp table t_card as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000025','v1','credit_card_documents',gen_random_uuid()) as id;

select public.processing_record_balance((select id from t_bank), -79762, 'ILS', '2025-12-31', 12, '{"label":"יתרת עו\"ש","value":"-797.62 ש\"ח"}'::jsonb, gen_random_uuid());
select is((select reported_balance_minor from public.accounts where account_type_code = 'checking'), -79762::bigint, 'reported balance stored on the bank account (a negative balance stays negative)');
select is((select balance_as_of from public.accounts where account_type_code = 'checking'), '2025-12-31'::date, 'with the date the document states');
select ok(exists(select 1 from public.evidence_links l join public.evidence e on e.id = l.evidence_id
  where l.entity_type = 'account' and e.document_id = (select id from t_bank) and e.row_number = 12), 'evidence links the balance to the document line');
select ok(exists(select 1 from public.audit_events where action = 'BALANCE_REPORTED'), 'audited');

select public.processing_record_balance((select id from t_bank), 100000, 'ILS', '2023-12-31', 3, '{}'::jsonb, gen_random_uuid());
select is((select reported_balance_minor from public.accounts where account_type_code = 'checking'), -79762::bigint, 'an older document does not override a newer balance');

select throws_ok($$ select public.processing_record_balance((select id from t_card), 1, 'ILS', '2026-01-01', 1, '{}'::jsonb, gen_random_uuid()) $$, '22023', null, 'only bank documents report an account balance');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select throws_ok($$ select public.processing_record_balance((select id from t_bank), 1, 'ILS', '2026-01-01', 1, '{}'::jsonb, gen_random_uuid()) $$, '22023', null, 'another user cannot write a balance for a foreign document');

select * from finish();
rollback;
