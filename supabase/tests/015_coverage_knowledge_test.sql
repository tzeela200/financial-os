-- Coverage & knowledge scaffold (18A §33-34; 18C §8-9, §12, §20-22; ADR-001, DR-2)
begin;
select plan(14);

select has_table('public','coverage_scopes','coverage_scopes exists');
select has_table('public','coverage_periods','coverage_periods exists');
select has_table('public','data_gaps','data_gaps exists');
select has_table('public','investigations','investigations exists');
select has_table('public','findings','findings exists');
select has_table('public','contradictions','contradictions exists');
select has_table('public','knowledge_items','knowledge_items exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

-- coverage requirement: 'missing' is a valid received_status (distinct axis from coverage_status)
insert into public.coverage_scopes (id, owner_user_id, domain, source_ref, expected_frequency, required, received_status, blocking_scope) values
  ('80000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','accounting','ledger 2026','bimonthly',true,'missing','vat');
select throws_ok($$insert into public.coverage_periods (owner_user_id, scope_id, expected_from, expected_to, status) values ('11111111-1111-1111-1111-111111111111','80000000-0000-0000-0000-000000000001','2026-07-01','2026-08-31','substantially_complete')$$, '23514', null, 'coverage period status limited to ADR-001');
select throws_ok($$insert into public.coverage_periods (owner_user_id, scope_id, expected_from, expected_to, covered_from, covered_to, status) values ('11111111-1111-1111-1111-111111111111','80000000-0000-0000-0000-000000000001','2026-07-01','2026-08-31','2026-08-31','2026-07-01','partial')$$, '23514', null, 'covered_to before covered_from rejected');

-- findings: knowledge_type restricted to the six of 18C §22; may stay open
select throws_ok($$insert into public.findings (owner_user_id, finding_type, title, knowledge_type, status) values ('11111111-1111-1111-1111-111111111111','mismatch','x','decision','open')$$, '23514', null, 'a finding cannot be a decision (18C §22)');
select lives_ok($$insert into public.findings (owner_user_id, finding_type, title, knowledge_type, reliability_status, materiality, status, next_question) values ('11111111-1111-1111-1111-111111111111','mismatch','67 vs 349','contradiction','contradicted','medium','open','which amount does the ledger reflect?')$$, 'finding can stay open with a next question');
select throws_ok($$insert into public.findings (owner_user_id, finding_type, title, knowledge_type, status, amount_minor) values ('11111111-1111-1111-1111-111111111111','mismatch','x','fact','open',100)$$, '23514', null, 'finding amount requires currency');

-- contradictions: both sides must exist; accepted_difference keeps both (18C §12)
select throws_ok($$insert into public.contradictions (owner_user_id, contradiction_type, left_evidence_id, severity, status) values ('11111111-1111-1111-1111-111111111111','amount','90000000-0000-0000-0000-000000000001','medium','open')$$, '23502', null, 'a contradiction needs two sides');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$insert into public.knowledge_items (knowledge_type, statement) values ('fact','x')$$, '42501', null, 'user cannot write knowledge directly (AI/engine via server only)');

select * from finish();
rollback;
