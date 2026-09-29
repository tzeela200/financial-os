-- Exceptions, review queue, QA (18B §12, 18C §13-17): one review queue for user decisions; QA independent.
begin;
select plan(10);

select has_table('public','exceptions','exceptions exists');
select has_table('public','review_queue_items','review_queue_items exists');
select has_table('public','qa_runs','qa_runs exists');
select has_table('public','qa_check_results','qa_check_results exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

select lives_ok($$insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, blocking, required_action) values ('11111111-1111-1111-1111-111111111111','reconciliation','match_candidate','60000000-0000-0000-0000-000000000001','amount_gap','medium','canonical','choose which amount the ledger reflects')$$, 'reconciliation decision enters the review queue');
select throws_ok($$insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity) values ('11111111-1111-1111-1111-111111111111','job_failure','job','00000000-0000-0000-0000-000000000001','timeout','low')$$, '23514', null, 'technical job failure is not a review item type (Review Queue != DLQ)');
select throws_ok($$insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, status) values ('11111111-1111-1111-1111-111111111111','finding','finding','00000000-0000-0000-0000-000000000002','x','low','done')$$, '23514', null, 'review status limited to glossary');

insert into public.qa_runs (id, owner_user_id, scope_type, scope_id, qa_profile, status, trigger, checks_total, checks_passed, checks_warned, checks_failed) values
  ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','document','dddddddd-0000-0000-0000-000000000001','ingestion','passed_with_warnings','ingestion',3,2,1,0);
select throws_ok($$insert into public.qa_runs (owner_user_id, scope_type, qa_profile, status, trigger, checks_total, checks_passed, checks_warned, checks_failed) values ('11111111-1111-1111-1111-111111111111','system','x','passed','manual',1,1,1,0)$$, '23514', null, 'QA counters cannot exceed total');
select throws_ok($$insert into public.qa_check_results (owner_user_id, qa_run_id, check_code, severity, result) values ('11111111-1111-1111-1111-111111111111','a1000000-0000-0000-0000-000000000001','checksum','low','ok')$$, '23514', null, 'QA check result limited to passed/warned/failed');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.exceptions (exception_type, severity) values ('amount_mismatch','high')$$, '42501', null, 'user cannot write exceptions directly');

select * from finish();
rollback;
