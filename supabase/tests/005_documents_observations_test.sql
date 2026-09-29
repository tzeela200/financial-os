-- Extracted layer (18A §15-16, §46, §72-73). Written server-side only; user reads via RLS.
begin;
select plan(13);

select has_table('public','documents','documents exists');
select has_table('public','observations','observations exists');
select fk_ok('public','documents','source_file_id','public','source_files','id');
select col_type_is('public','documents','gross_amount_minor','bigint','document money is bigint minor units');
select col_is_null('public','observations','canonical_entity_id','observation may exist without canonical link (18A §72)');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','stranger@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.sources (id, owner_user_id, source_type, source_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','business_expense_export','green invoice export');
insert into public.source_files (id, owner_user_id, source_id, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha256) values
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','11111111-1111-1111-1111-111111111111/a/1/original.csv','x.csv','text/csv',10,repeat('c',64));

-- engine (server) writes the document and two conflicting observations: 67 vs 349 (18A §58, §73 scenario 1)
select lives_ok($$insert into public.documents (id, owner_user_id, source_file_id, document_number, currency_code, gross_amount_minor) values ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000001','24280','ILS',6700)$$, 'server creates document');
select lives_ok($$insert into public.observations (owner_user_id, document_id, concept_code, value_original, data_type, currency_code, extraction_method, extraction_version) values
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000001','gross_amount','67.00','money','ILS','parser','csv@1.0'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000001','gross_amount','349.00','money','ILS','parser','ledger@1.0')$$, 'two conflicting observations stored side by side');
select is((select count(*)::int from public.observations where document_id='dddddddd-0000-0000-0000-000000000001' and concept_code='gross_amount'), 2, 'no overwrite: both values kept');
select throws_ok($$insert into public.observations (owner_user_id, source_id, concept_code, value_original, data_type, extraction_method, verification_status) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','x','1','text','parser','reported')$$, '23514', null, 'reported is not a verification status');
select throws_ok($$insert into public.documents (owner_user_id, source_file_id, gross_amount_minor) values ('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000001',100)$$, '23514', null, 'amount without currency rejected');

-- owner reads; owner cannot write extracted layer directly
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select is((select count(*)::int from public.observations), 2, 'owner reads own observations');
select throws_ok($$insert into public.observations (source_id, concept_code, value_original, data_type, extraction_method) values ('aaaaaaaa-0000-0000-0000-000000000001','x','1','text','manual')$$, '42501', null, 'user cannot write observations directly (only via server / correct_extraction)');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.documents) + (select count(*)::int from public.observations), 0, 'stranger sees no foreign extracted data');

select * from finish();
rollback;
