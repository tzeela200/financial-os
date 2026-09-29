-- Raw source layer (18A §13, §40, §44, §50, §72; 23 §23 immutable raw)
begin;
select plan(18);

select has_table('public','sources','sources exists');
select has_table('public','source_files','source_files exists');
select has_table('public','import_batches','import_batches exists');
select has_table('public','source_records','source_records exists');
select has_table('public','user_reports','user_reports exists');
select fk_ok('public','source_files','source_id','public','sources','id');
select col_not_null('public','source_files','sha256','source file requires sha256');
select col_default_is('public','user_reports','verification_status','unverified'::text,'user report defaults to unverified (18A §56)');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','stranger@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);

select lives_ok($$insert into public.sources (id, source_type, source_name) values ('aaaaaaaa-0000-0000-0000-000000000001','bank_statement','bank 2026-08')$$, 'owner creates a source');
select throws_ok($$insert into public.sources (source_type, source_name) values ('bank_statment','typo')$$, '23514', null, 'unknown source_type rejected (glossary check)');
select throws_ok($$insert into public.sources (source_type, source_name, effective_period_start, effective_period_end) values ('bank_statement','x','2026-08-31','2026-08-01')$$, '23514', null, 'period_end before period_start rejected');
select throws_ok($$insert into public.source_files (source_id, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','p/1','a.pdf','application/pdf',10,'not-a-hash')$$, '23514', null, 'malformed sha256 rejected');

-- exact duplicate file (same sha256) is allowed and marked, never deleted (18A §44, §50)
select lives_ok($$insert into public.source_files (id, source_id, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha256) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','11111111-1111-1111-1111-111111111111/a/1/original.pdf','a.pdf','application/pdf',10, repeat('a',64)),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','11111111-1111-1111-1111-111111111111/a/2/original.pdf','a (1).pdf','application/pdf',10, repeat('a',64))$$, 'two files with identical sha256 can coexist');

-- raw is immutable for the user: no update, no delete (23 §23, 18A §48)
update public.source_files set original_filename = 'renamed.pdf' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from public.sources where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select original_filename from public.source_files where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'a.pdf', 'user cannot modify a raw source file row');
select is((select count(*)::int from public.sources where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'user cannot hard-delete a source');

select lives_ok($$insert into public.user_reports (source_id, subject_type, statement) values ('aaaaaaaa-0000-0000-0000-000000000001','obligation','rent 4,500 monthly')$$, 'owner files a manual report');

-- stranger sees nothing and cannot attach files to a foreign source
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from public.sources) + (select count(*)::int from public.source_files) + (select count(*)::int from public.user_reports), 0, 'stranger sees no foreign raw data');
select throws_ok($$insert into public.source_files (source_id, owner_user_id, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','financial-source-files','x/y','z.pdf','application/pdf',1,repeat('b',64))$$, '42501', null, 'stranger cannot write rows as the owner');

select * from finish();
rollback;
