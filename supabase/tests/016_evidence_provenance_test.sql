-- Evidence & provenance (18A §45; 18C §5-7, §25, §30; 18E rules): drill-down chain and no silent deletion.
begin;
select plan(13);

select has_table('public','evidence','evidence exists');
select has_table('public','evidence_links','evidence_links exists');
select has_table('public','provenance_edges','provenance_edges exists');
select has_table('public','entity_field_sources','entity_field_sources exists');
select has_table('public','finding_evidence_links','finding_evidence_links exists');
select has_table('public','tool_runs','tool_runs exists');
select has_table('public','rule_versions','rule_versions exists');
select fk_ok('public','contradictions','left_evidence_id','public','evidence','id');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.sources (id, owner_user_id, source_type, source_name) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bank_statement','bank');

-- evidence points at the finest locator the source allows (18C §5)
select lives_ok($$insert into public.evidence (id, owner_user_id, evidence_type, source_id, sheet_name, row_number, quoted_value, capture_method) values ('90000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','table_row','aaaaaaaa-0000-0000-0000-000000000001','Sheet1',42,'"-67.00"','parser')$$, 'row-level evidence recorded');
select throws_ok($$insert into public.evidence (owner_user_id, evidence_type, source_id, quoted_value, capture_method) values ('11111111-1111-1111-1111-111111111111','screenshot','aaaaaaaa-0000-0000-0000-000000000001','"x"','manual')$$, '23514', null, 'evidence type limited to glossary');

-- a time-dependent rule must carry validity (18C §30): valid_to not before valid_from
select throws_ok($$insert into public.rule_versions (owner_user_id, rule_id, version, domain, valid_from, valid_to, status) values ('11111111-1111-1111-1111-111111111111','vat_rate','1','tax','2026-01-01','2025-01-01','active')$$, '23514', null, 'rule validity window must be ordered');

-- AI confidence is not truth: a tool run keeps confidence_raw separately and needs a status (18C §25)
select throws_ok($$insert into public.tool_runs (owner_user_id, tool_type, tool_name, version, status) values ('11111111-1111-1111-1111-111111111111','llm','x','1','success')$$, '23514', null, 'tool type limited to glossary');

-- evidence is never hard-deleted by the user (18C §6)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
delete from public.evidence where id = '90000000-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::int from public.evidence where id = '90000000-0000-0000-0000-000000000001'), 1, 'user cannot delete evidence');

select * from finish();
rollback;
