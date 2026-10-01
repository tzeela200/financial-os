-- Migration 023: a new run supersedes the previous one (old document archived, its open review items resolved);
-- card credit facility stored as its own record linked to the card account; ownership enforced.
begin;
select plan(6);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','other@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000005/bbbbbbbb-0000-0000-0000-000000000005/original.pdf','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r5','credit_card_statement','card.pdf','unknown','aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000005',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000005/bbbbbbbb-0000-0000-0000-000000000005/original.pdf','card.pdf','application/pdf',10,repeat('e',64),'file',gen_random_uuid());

create temp table t_d1 as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000005','v1','credit_card_documents',gen_random_uuid()) as id;
select public.processing_flag_document((select id from t_d1),'needs_mapping','approve_column_mapping','medium');
create temp table t_d2 as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000005','v2+builtin:cal-statementv1','credit_card_documents',gen_random_uuid()) as id;

select ok((select archived_at is not null from public.documents where id = (select id from t_d1)), 'previous run document is archived (kept, not deleted)');
select is((select status from public.review_queue_items where entity_id = (select id from t_d1)), 'resolved', 'its open review item is resolved as superseded');
select ok((select archived_at is null from public.documents where id = (select id from t_d2)), 'the new run document is active');

select public.processing_promote((select id from t_d2),'credit_card','כרטיס אשראי','[{"key":"x1","row_number":1,"sheet":"","date":"2026-07-15","charge_date":"2026-08-16","direction":"debit","amount_minor":"10000","currency":"ILS","description":"ספק"}]'::jsonb,'[]'::jsonb,gen_random_uuid());
select public.processing_upsert_facility((select id from t_d2),'{"limit_minor":"300000","currency":"ILS","as_of_date":"2026-08-16","effective_to":"2026-09-30"}'::jsonb,gen_random_uuid());
select is((select limit_minor from public.credit_facilities limit 1), 300000::bigint, 'credit limit stored as a card facility');
select is((select linked_account_id from public.credit_facilities limit 1), (select id from public.accounts where account_type_code = 'credit_card'), 'facility linked to the card account');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select throws_ok($$ select public.processing_upsert_facility((select id from t_d2),'{"limit_minor":"1","currency":"ILS"}'::jsonb,gen_random_uuid()) $$, '22023', null, 'another user cannot write a facility for a foreign document');

select * from finish();
rollback;
