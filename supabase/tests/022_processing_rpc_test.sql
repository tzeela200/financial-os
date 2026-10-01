-- Processing pipeline write path (migration 022; Stage 3 plan v2 D3/D5; ADR-007; chapter 7):
-- enqueue + lease + retry/DLQ, ownership on every function, idempotent records and promotion, adapter versioning,
-- reconciliation candidates never auto-approved, decision audited.
begin;
select plan(26);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','other@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/original.csv','11111111-1111-1111-1111-111111111111'),
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002/original.csv','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r1','bank_statement','bank.csv','unknown','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/original.csv','bank.csv','text/csv',10,repeat('a',64),'file',gen_random_uuid());
select public.intake_register_file('r2','credit_card_statement','card.csv','unknown','aaaaaaaa-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002/original.csv','card.csv','text/csv',10,repeat('b',64),'file',gen_random_uuid());

-- ---- enqueue: register + enqueue only; transitions recorded
create temp table t_job as select public.processing_enqueue('bbbbbbbb-0000-0000-0000-000000000001','process_source','v1',gen_random_uuid()) as id;
select is((select status from public.jobs where id = (select id from t_job)), 'queued', 'upload creates a queued process_source job');
select is((select pipeline_state from public.source_files where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'classification_pending', 'file moves to classification_pending');
select is((select count(*)::int from public.processing_runs where entity_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 2, 'uploaded→accepted→classification_pending recorded');
select is(public.processing_enqueue('bbbbbbbb-0000-0000-0000-000000000001','process_source','v1',gen_random_uuid()), (select id from t_job), 'enqueue while active returns the existing job');

-- ---- claim with lease; a second runner gets nothing
select is((public.processing_claim('runner-a', null) ->> 'job_id')::uuid, (select id from t_job), 'runner claims the due job');
select is(public.processing_claim('runner-b', null), null, 'a second runner cannot take a locked job');

-- ---- technical failure → retry_wait with backoff; business outcome never goes to DLQ
select is(public.processing_finish_job((select id from t_job),'failed_technical','STORAGE_READ_FAILED','x') ->> 'status', 'retry_wait', 'technical failure is retried with backoff');
select ok((select available_at > now() from public.jobs where id = (select id from t_job)), 'retry is scheduled in the future');
update public.jobs set available_at = now() - interval '1 second' where id = (select id from t_job);

-- ---- document, records (idempotent by hash), observations with provenance
select public.processing_claim('runner-a', (select id from t_job));
create temp table t_doc as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000001','v1+adapter:x','bank_documents',gen_random_uuid()) as id;
select is(public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000001','v1+adapter:x','bank_documents',gen_random_uuid()), (select id from t_doc), 'same run version continues the same document');
select is(public.processing_write_records((select id from t_doc), '[{"row_key":"#2","row_number":2,"record_hash":"h2","raw":{"sheet":"","kind":"data","cells":["01/09/2026","-50"],"run":"v1+adapter:x"},"observations":[{"concept_code":"transaction_date","value_original":"01/09/2026","value_normalized":{"iso":"2026-09-01"},"data_type":"date","locator":{"row":2,"col":1},"unmapped":false,"confidence":1},{"concept_code":"needs_mapping","value_original":"X","data_type":"text","locator":{"row":2,"col":3},"unmapped":true}]}]'::jsonb), 1, 'record written');
select is(public.processing_write_records((select id from t_doc), '[{"row_key":"#2","row_number":2,"record_hash":"h2","raw":{"cells":[]},"observations":[]}]'::jsonb), 0, 'same record hash is not written twice');
select is((select count(*)::int from public.observations where document_id = (select id from t_doc) and unmapped), 1, 'unmapped value is kept, not dropped');

-- ---- promotion: account + transactions + evidence + audit; idempotent by key
select is(public.processing_promote((select id from t_doc),'checking','חשבון בנק','[{"key":"k1","row_number":2,"sheet":"","date":"2026-09-11","direction":"debit","amount_minor":"34000","currency":"ILS","description":"כרטיס","balance_after_minor":"100000"}]'::jsonb,'[]'::jsonb,gen_random_uuid()) ->> 'transactions', '1', 'complete row promoted to a canonical transaction');
select is(public.processing_promote((select id from t_doc),'checking','חשבון בנק','[{"key":"k1","row_number":2,"sheet":"","date":"2026-09-11","direction":"debit","amount_minor":"34000","currency":"ILS"}]'::jsonb,'[]'::jsonb,gen_random_uuid()) ->> 'transactions', '0', 're-processing does not duplicate canonical records');
select is((select count(*)::int from public.evidence_links where entity_type = 'transaction'), 1, 'promoted transaction has evidence');
select is((select reported_balance_minor from public.accounts where account_type_code = 'checking'), 100000::bigint, 'reported balance is the balance printed on the latest row');
select is((select reconciliation_status from public.transactions limit 1), 'unmatched', 'import never matches across sources');

-- card source and its cycle
select public.processing_enqueue('bbbbbbbb-0000-0000-0000-000000000002','process_source','v1',gen_random_uuid());
create temp table t_doc2 as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000002','v1+adapter:y','credit_card_documents',gen_random_uuid()) as id;
select public.processing_promote((select id from t_doc2),'credit_card','כרטיס אשראי','[{"key":"c1","row_number":2,"sheet":"","date":"2026-08-20","charge_date":"2026-09-10","direction":"debit","amount_minor":"34000","currency":"ILS"}]'::jsonb,'[]'::jsonb,gen_random_uuid());

-- ---- reconciliation: candidate only, review item, decision audited
create temp table t_ids as select (select id from public.transactions where external_transaction_id = 'k1') as bank, (select id from public.transactions where external_transaction_id = 'c1') as card;
select is(public.reconciliation_write_candidates(jsonb_build_array(jsonb_build_object('key','m1','type','card_settlement','left',(select bank from t_ids),'right',jsonb_build_array((select card from t_ids)),'amount_minor','34000','currency','ILS','basis','{}'::jsonb)),'recon-v1'), 1, 'candidate stored');
select is(public.reconciliation_write_candidates(jsonb_build_array(jsonb_build_object('key','m1','type','card_settlement','left',(select bank from t_ids),'right',jsonb_build_array((select card from t_ids)),'amount_minor','34000','currency','ILS','basis','{}'::jsonb)),'recon-v1'), 0, 'same candidate key is not stored twice');
select is((select reconciliation_status from public.transactions where id = (select bank from t_ids)), 'candidate', 'members marked candidate, not matched');
select is((select count(*)::int from public.review_queue_items where item_type = 'reconciliation' and status = 'open'), 1, 'candidate creates a review item');
select is(public.reconciliation_decide((select id from public.match_candidates limit 1),'approve',gen_random_uuid()) ->> 'status', 'matched', 'explicit approval matches');
select is((select count(*)::int from public.reconciliation_members), 2, 'reconciliation keeps both records as members');

-- ---- ownership: another user can touch none of it
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select throws_ok($$ select public.processing_enqueue('bbbbbbbb-0000-0000-0000-000000000001','process_source','v2',gen_random_uuid()) $$, '22023', null, 'another user cannot enqueue a foreign file');
select throws_ok($$ select public.processing_write_records((select id from t_doc), '[]'::jsonb) $$, '22023', null, 'another user cannot write records into a foreign document');

-- ---- anon has no access
reset role;
set local role anon;
select throws_ok($$ select public.processing_claim('x', null) $$, '42501', null, 'anon cannot run the processing functions');

select * from finish();
rollback;
