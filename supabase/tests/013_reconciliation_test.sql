-- Reconciliation scaffold (18A §38, §58; 23A §43-45): 1:1, 1:N, N:1, partial; candidate is not a match.
begin;
select plan(9);

select has_table('public','reconciliations','reconciliations exists');
select has_table('public','reconciliation_members','reconciliation_members exists');
select has_table('public','match_candidates','match_candidates exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

-- 67 vs 349: strong signals but amount gap -> needs_review, never matched (18A §58)
select lives_ok($$insert into public.match_candidates (id, owner_user_id, candidate_type, left_ref, right_ref, score, score_breakdown_json, status, generated_by_version) values
  ('60000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','document_vs_ledger','{"entity_type":"observation","entity_id":"00000000-0000-0000-0000-000000000067"}','{"entity_type":"source_record","entity_id":"00000000-0000-0000-0000-000000000349"}',0.62,'{"supplier":1,"date":1,"doc_number":1,"amount_gap_penalty":-0.9}','needs_review','reconciler@0.1')$$, '67/349 stored as needs_review candidate');
select throws_ok($$insert into public.reconciliations (owner_user_id, reconciliation_type, status, approved_at) values ('11111111-1111-1111-1111-111111111111','document_transaction','candidate',now())$$, '23514', null, 'a candidate cannot carry an approval (Candidate != Match)');

-- 1:N partial reconciliation: one payment covers two expenses partially
insert into public.reconciliations (id, owner_user_id, reconciliation_type, status, rule_version) values ('50000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','payment_expenses','partial','rules@0.1');
select lives_ok($$insert into public.reconciliation_members (owner_user_id, reconciliation_id, entity_type, entity_id, member_role, allocated_amount_minor, currency_code) values
  ('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001','payment','20000000-0000-0000-0000-000000000001','source',50000,'ILS'),
  ('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000001','target',30000,'ILS'),
  ('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000002','target',15000,'ILS')$$, '1:N partial reconciliation represented');
select throws_ok($$insert into public.reconciliation_members (owner_user_id, reconciliation_id, entity_type, entity_id, member_role, allocated_amount_minor) values ('11111111-1111-1111-1111-111111111111','50000000-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000003','target',100)$$, '23514', null, 'member amount requires currency');
select throws_ok($$insert into public.reconciliations (owner_user_id, reconciliation_type, status) values ('11111111-1111-1111-1111-111111111111','x','almost_matched')$$, '23514', null, 'reconciliation status limited to glossary');

-- user cannot promote a candidate directly (23D §13): the update has no effect under RLS
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
update public.match_candidates set status = 'matched' where id = '60000000-0000-0000-0000-000000000001';
reset role;
select is((select status from public.match_candidates where id = '60000000-0000-0000-0000-000000000001'), 'needs_review', 'user update did not promote the candidate');

select * from finish();
rollback;
