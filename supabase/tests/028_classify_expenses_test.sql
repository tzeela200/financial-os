-- Migration 028: a certain dictionary match is stored on the expense; a type under review / unknown is never stored — it
-- becomes one open review item; an existing classification is never overwritten; an unknown expense key is ignored.
begin;
select plan(7);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000028/bbbbbbbb-0000-0000-0000-000000000028/original.xlsx','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r28','business_expense_export','expenses.xlsx','unknown','aaaaaaaa-0000-0000-0000-000000000028','bbbbbbbb-0000-0000-0000-000000000028',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000028/bbbbbbbb-0000-0000-0000-000000000028/original.xlsx','expenses.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',10,repeat('d',64),'file',gen_random_uuid());
create temp table t_d as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000028','v1','green_invoice_morning',gen_random_uuid()) as id;
select public.processing_promote((select id from t_d),'checking','-','[]'::jsonb,
  '[{"key":"e1","side":"expense","row_numbers":[1],"sheet":"","role":"tax_invoice","date":"2026-09-10","document_number":"1","party":"ספק א","gross_minor":"11800","net_minor":"10000","vat_minor":"1800","currency":"ILS"},
    {"key":"e2","side":"expense","row_numbers":[2],"sheet":"","role":"tax_invoice","date":"2026-09-11","document_number":"2","party":"ספק ב","gross_minor":"5900","net_minor":"5000","vat_minor":"900","currency":"ILS"}]'::jsonb,
  gen_random_uuid());
create temp table t_e as select md5('11111111-1111-1111-1111-111111111111:expense:e1')::uuid as e1, md5('11111111-1111-1111-1111-111111111111:expense:e2')::uuid as e2;

-- a certain match is stored
select public.processing_classify_expenses((select id from t_d), '[{"key":"e1","category_code":"3540:שירותים מקצועיים"}]'::jsonb, gen_random_uuid());
select is((select category_code from public.expenses where id = (select e1 from t_e)), '3540:שירותים מקצועיים', 'a certain match is stored on the expense');

-- an existing classification is never overwritten
select public.processing_classify_expenses((select id from t_d), '[{"key":"e1","category_code":"3620:פרסום וקידום מכירות"}]'::jsonb, gen_random_uuid());
select is((select category_code from public.expenses where id = (select e1 from t_e)), '3540:שירותים מקצועיים', 'an existing classification is not overwritten');

-- a general type (under review) is never accepted as a classification
select throws_ok($$select public.processing_classify_expenses((select id from t_d), '[{"key":"e2","category_code":"1390:כללי"}]'::jsonb, gen_random_uuid())$$,
  '22023', 'VALIDATE_EXPENSE_TYPE', 'a type under review is rejected as a final classification');

-- not certain: no category, one open review item with its candidates (repeating the decision does not duplicate it)
select public.processing_classify_expenses((select id from t_d), '[{"key":"e2","category_code":null,"reason":"expense_type_ambiguous","candidates":["1390:תוכנה","3680:תוכנה"],"name":"תוכנה","account_key":null}]'::jsonb, gen_random_uuid());
select public.processing_classify_expenses((select id from t_d), '[{"key":"e2","category_code":null,"reason":"expense_type_ambiguous","candidates":["1390:תוכנה","3680:תוכנה"],"name":"תוכנה","account_key":null}]'::jsonb, gen_random_uuid());
select is((select category_code from public.expenses where id = (select e2 from t_e)), null, 'an uncertain type leaves the category empty');
select is((select count(*)::int from public.review_queue_items where entity_type = 'expense' and entity_id = (select e2 from t_e) and status = 'open'), 1, 'one open review item for the expense');
select is((select origin_ref -> 'candidates' from public.review_queue_items where entity_type = 'expense' and entity_id = (select e2 from t_e)), '["1390:תוכנה", "3680:תוכנה"]'::jsonb, 'the review item keeps the candidates');

-- a key that is not an expense of this source is ignored
select is((public.processing_classify_expenses((select id from t_d), '[{"key":"nope","category_code":"3540:שירותים מקצועיים"}]'::jsonb, gen_random_uuid()) ->> 'classified')::int, 0, 'an unknown expense key changes nothing');

select * from finish();
rollback;
