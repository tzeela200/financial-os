-- Intake RPC (docs/plans/route-a-02-intake.md Task 1): atomic Source + File/Report + Evidence + Audit,
-- idempotent, duplicate marked not deleted, foreign path / missing object / wrong method rejected.
begin;
select plan(14);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

-- the uploaded objects (the client uploads under her own prefix before registering)
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/original.csv','11111111-1111-1111-1111-111111111111'),
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002/original.csv','11111111-1111-1111-1111-111111111111'),
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000003/original.txt','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);

select is(
  public.intake_register_file('req-1','bank_statement','bank.csv','unknown',
    'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/original.csv',
    'bank.csv','text/csv',10,repeat('a',64),'file',gen_random_uuid()) ->> 'status',
  'uploaded', 'file intake registers source + file in state uploaded');
select is((select count(*)::int from public.evidence where source_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'evidence written in the same transaction');
select is((select count(*)::int from public.evidence_links where entity_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1, 'evidence linked to the file');
select is((select count(*)::int from public.audit_events where entity_id = 'bbbbbbbb-0000-0000-0000-000000000001' and action = 'SOURCE_UPLOADED'), 1, 'audit written in the same transaction');

select is(
  public.intake_register_file('req-1','bank_statement','bank.csv','unknown',
    'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001/original.csv',
    'bank.csv','text/csv',10,repeat('a',64),'file',gen_random_uuid()) ->> 'source_id',
  'aaaaaaaa-0000-0000-0000-000000000001', 'same client_request_id is idempotent');
select is((select count(*)::int from public.sources), 1, 'retry creates no second source');

select is(
  public.intake_register_file('req-2','bank_statement','bank copy.csv','unknown',
    'aaaaaaaa-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002/bbbbbbbb-0000-0000-0000-000000000002/original.csv',
    'bank copy.csv','text/csv',10,repeat('a',64),'file',gen_random_uuid()) ->> 'duplicate_of_file_id',
  'bbbbbbbb-0000-0000-0000-000000000001', 'same sha256 is marked duplicate of the first file, not deleted');

select throws_ok($$ select public.intake_register_file('req-3','bank_statement','x','unknown',
    'aaaaaaaa-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000009',
    '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000009/bbbbbbbb-0000-0000-0000-000000000009/original.csv',
    'x.csv','text/csv',1,repeat('b',64),'file',gen_random_uuid()) $$, '42501', null, 'foreign storage path is rejected');

select throws_ok($$ select public.intake_register_file('req-4','bank_statement','x','unknown',
    'aaaaaaaa-0000-0000-0000-000000000008','bbbbbbbb-0000-0000-0000-000000000008',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000008/bbbbbbbb-0000-0000-0000-000000000008/original.csv',
    'x.csv','text/csv',1,repeat('c',64),'file',gen_random_uuid()) $$, '22023', null, 'object that was never uploaded cannot be registered');

select throws_ok($$ select public.intake_register_file('req-5','bank_statement','x','unknown',
    'aaaaaaaa-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000003/original.txt',
    'x.txt','text/plain',1,repeat('d',64),'text',gen_random_uuid()) $$, '22023', null, 'pasted text is not allowed for a bank statement');

select is(
  public.intake_register_file('req-6','correspondence','מייל מהבנק','unknown',
    'aaaaaaaa-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000003/bbbbbbbb-0000-0000-0000-000000000003/original.txt',
    'טקסט-מודבק.txt','text/plain',30,repeat('e',64),'text',gen_random_uuid()) ->> 'status',
  'uploaded', 'pasted correspondence text is stored as an immutable source file');

select is(
  (select verification_status from public.user_reports where id = (
     public.intake_register_manual_report('req-7','debts','יש חוב חדש לספק','unknown',gen_random_uuid()) ->> 'user_report_id')::uuid),
  'unverified', 'manual report is stored unverified (18A §56)');

select throws_ok($$ select public.intake_register_manual_report('req-8','bananas','x','unknown',gen_random_uuid()) $$,
  '22023', null, 'subject_type outside the canonical entity list is rejected (DR-C)');

select throws_ok($$ select public.intake_register_file('req-9','user_report','x','unknown',
    gen_random_uuid(), gen_random_uuid(), 'p', 'x.txt','text/plain',1,repeat('f',64),'file',gen_random_uuid()) $$,
  '22023', null, 'user_report cannot enter as a file');

select * from finish();
rollback;
