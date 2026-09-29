-- Operations & audit (18C §26; 18D §5-10B): append-only audit, idempotent jobs, server-only claiming, DLQ separate.
begin;
select plan(14);

select has_table('public','processing_runs','processing_runs exists');
select has_table('public','jobs','jobs exists');
select has_table('public','dead_letter_jobs','dead_letter_jobs exists');
select has_table('public','audit_events','audit_events exists');
select has_function('public','claim_next_job',array['text'],'claim_next_job exists');
select is(has_function_privilege('authenticated','public.claim_next_job(text)','execute'), false, 'signed-in user cannot claim jobs (server only)');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

-- idempotency: same key twice -> one job (18D §9)
insert into public.jobs (id, owner_user_id, job_type, scope_type, idempotency_key, correlation_id, max_attempts) values
  ('b1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','process_source','source','process_source:file-1:v1','c0000000-0000-0000-0000-000000000001',3);
select throws_ok($$insert into public.jobs (owner_user_id, job_type, scope_type, idempotency_key, correlation_id, max_attempts) values ('11111111-1111-1111-1111-111111111111','process_source','source','process_source:file-1:v1','c0000000-0000-0000-0000-000000000002',3)$$, '23505', null, 'duplicate idempotency key rejected');

-- claiming (as server): queued -> running, attempt counted; nothing left -> null
select is((select status from public.claim_next_job('runner-1')), 'running', 'claim moves the job to running');
select is((select attempt_count from public.jobs where id = 'b1000000-0000-0000-0000-000000000001'), 1, 'attempt counted');
select ok((select public.claim_next_job('runner-1')) is null, 'no queued job left -> null');

-- audit is append-only (18C §26)
insert into public.audit_events (id, owner_user_id, actor_type, action, entity_type, entity_id, correlation_id) values
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','system','create','source','aaaaaaaa-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001');
select throws_like($$update public.audit_events set reason = 'changed' where id = 'a0000000-0000-0000-0000-000000000001'$$, '%append-only%', 'audit rows cannot be updated');
select throws_like($$delete from public.audit_events where id = 'a0000000-0000-0000-0000-000000000001'$$, '%append-only%', 'audit rows cannot be deleted');

-- the owner reads her audit trail but cannot write it
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select is((select count(*)::int from public.audit_events), 1, 'owner reads own audit trail');
select throws_ok($$insert into public.audit_events (actor_type, action, entity_type, correlation_id) values ('user','create','x',gen_random_uuid())$$, '42501', null, 'user cannot write audit directly (server-side only)');

select * from finish();
rollback;
