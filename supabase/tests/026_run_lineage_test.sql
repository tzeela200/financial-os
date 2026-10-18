-- Migration 026: run lineage and field-level provenance (DI-4 §4, DI-5; 18C §5–§7; 18A §45; 23D §132–133).
-- Code-rule runs are recorded in tool_runs (parser / rule_engine only, never 'skill'); a promoted transaction is traced
-- to the run and to the source record that produced it (provenance_edges); its fields are traced to the observations
-- they came from (observations.canonical_* + entity_field_sources). Nothing here is written by the user directly.
begin;
select plan(14);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','other@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000026/bbbbbbbb-0000-0000-0000-000000000026/original.csv','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r26','bank_statement','bank.csv','unknown','aaaaaaaa-0000-0000-0000-000000000026','bbbbbbbb-0000-0000-0000-000000000026',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000026/bbbbbbbb-0000-0000-0000-000000000026/original.csv','bank.csv','text/csv',10,repeat('d',64),'file',gen_random_uuid());
create temp table t_d as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000026','v1','bank_documents',gen_random_uuid()) as id;
select public.processing_write_records((select id from t_d), '[{"row_key":"k1","row_number":1,"record_hash":"h26-1","raw":{"sheet":"","kind":"data","cells":["17/05/2026","עמ החזר","65.00","1,000.00"]},
  "observations":[{"concept_code":"transaction_date","value_original":"17/05/2026","value_normalized":"2026-05-17","data_type":"date","locator":{"col":0}},
                  {"concept_code":"description","value_original":"עמ החזר","value_normalized":"עמ החזר","data_type":"text","locator":{"col":1}},
                  {"concept_code":"debit_amount","value_original":"65.00","value_normalized":6500,"data_type":"money","currency_code":"ILS","locator":{"col":2}},
                  {"concept_code":"balance","value_original":"1,000.00","value_normalized":100000,"data_type":"money","currency_code":"ILS","locator":{"col":3}},
                  {"concept_code":"needs_mapping","value_original":"x","data_type":"text","locator":{"col":4},"unmapped":true}]}]'::jsonb);

-- ---- tool runs: recorded server-side with the file's hash; 'skill' is refused
create temp table t_runs as select public.processing_record_tool_runs((select id from t_d),
  '[{"tool_type":"parser","tool_name":"reader","version":"structured-extract-v4","status":"success","output":{"format":"csv","rows":1}},
    {"tool_type":"rule_engine","tool_name":"promotion-planner","version":"promote-v1","status":"success","output":{"planned":1}}]'::jsonb, gen_random_uuid()) as ids;
select is((select count(*)::int from public.tool_runs), 2, 'each code-rule run is recorded');
select is((select input_hash from public.tool_runs where tool_name = 'reader'), repeat('d',64), 'the run carries the hash of the file it read');
select ok((select completed_at is not null and input_refs @> jsonb_build_array(jsonb_build_object('document_id', (select id from t_d))) from public.tool_runs where tool_name = 'reader'),
  'the run names the document and is completed');
select is((select count(*)::int from public.provenance_edges where step = 'read' and to_entity_id = (select id from t_d)), 1, 'file → document edge points at the reader run');
select throws_ok($$select public.processing_record_tool_runs((select id from t_d), '[{"tool_type":"skill","tool_name":"israeli-bank-connector","version":"1","status":"success","output":{}}]'::jsonb, gen_random_uuid())$$,
  '22023', 'VALIDATE_ENUM', 'a Skill is never recorded as a product run (MASTER_SPEC §22)');
select throws_ok($$insert into public.tool_runs (tool_type, tool_name, version, status) values ('parser','x','1','success')$$, '42501', null, 'the user cannot write tool_runs directly');

-- ---- promotion traced to the run and to the source record; fields traced to their observations
select public.processing_promote((select id from t_d),'checking','חשבון בנק',
  '[{"key":"k26-1","row_number":1,"sheet":"","date":"2026-05-17","direction":"debit","amount_minor":"6500","currency":"ILS","description":"עמ החזר","balance_after_minor":"100000"}]'::jsonb,
  '[]'::jsonb, gen_random_uuid(), ((select ids from t_runs) ->> 'promotion-planner')::uuid);
create temp table t_tx as select id from public.transactions where external_transaction_id = 'k26-1';
select is((select tool_run_id from public.provenance_edges where step = 'promote' and to_entity_type = 'transaction' and to_entity_id = (select id from t_tx)),
  ((select ids from t_runs) ->> 'promotion-planner')::uuid, 'the transaction is traced to the promotion run');
select is((select from_entity_type from public.provenance_edges where step = 'promote' and to_entity_id = (select id from t_tx)), 'source_record', 'and to the source record it came from');
select is((select canonical_field from public.observations where concept_code = 'debit_amount'), 'amount_minor', 'the amount observation is linked to the amount field');
select is((select canonical_entity_id from public.observations where concept_code = 'transaction_date'), (select id from t_tx), 'the date observation is linked to the transaction');
select is((select count(*)::int from public.entity_field_sources where entity_type = 'transaction' and entity_id = (select id from t_tx)), 4,
  'date, description, amount and balance each name their observation');
select is((select canonical_entity_id from public.observations where concept_code = 'needs_mapping'), null, 'an unmapped observation is not linked to canonical truth');

-- ---- promotion without a run id still works (callers before 026)
select lives_ok($$select public.processing_promote((select id from t_d),'checking','חשבון בנק','[]'::jsonb,'[]'::jsonb,gen_random_uuid())$$, 'promotion without a run id still works');

-- ---- another user sees none of it
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.tool_runs) + (select count(*)::int from public.entity_field_sources), 0, 'another user sees no runs and no field sources');

select * from finish();
rollback;
