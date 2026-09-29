-- Storage (18A §40-41; 18D §31-32; T-5): private buckets, owner-prefixed paths, raw immutable.
begin;
select plan(10);

select is((select count(*)::int from storage.buckets where id in ('financial-source-files','financial-derived-files','financial-exports')), 3, 'three canonical buckets exist');
select is_empty($$select id from storage.buckets where id in ('financial-source-files','financial-derived-files','financial-exports') and public$$, 'all financial buckets are private');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222','stranger@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('financial-source-files','11111111-1111-1111-1111-111111111111/src-1/file-1/original.pdf','11111111-1111-1111-1111-111111111111')$$, 'owner uploads under her own prefix');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('financial-source-files','22222222-2222-2222-2222-222222222222/x/y/original.pdf','11111111-1111-1111-1111-111111111111')$$, '42501', null, 'owner cannot write under another user prefix');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('financial-derived-files','11111111-1111-1111-1111-111111111111/src-1/file-1/v1/preview.png','11111111-1111-1111-1111-111111111111')$$, '42501', null, 'derived files are written server-side only');
update storage.objects set name = '11111111-1111-1111-1111-111111111111/src-1/file-1/renamed.pdf' where bucket_id = 'financial-source-files';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'financial-source-files' and name like '%/original.pdf'), 1, 'raw source object cannot be renamed or deleted by the user');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select is((select count(*)::int from storage.objects where bucket_id like 'financial-%'), 0, 'stranger sees no foreign files');

reset role;
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id like 'financial-%'), 0, 'anonymous sees no files');
reset role;
-- deletion goes only through the Storage API, which obeys policies: there must be no UPDATE/DELETE policy on financial objects
select is_empty($$select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE','DELETE','ALL') and (qual like '%financial-%' or with_check like '%financial-%')$$, 'no update/delete policy on financial files (raw immutable)');
select is((select file_size_limit from storage.buckets where id = 'financial-source-files'), 52428800::bigint, 'source bucket has an explicit size limit');

select * from finish();
rollback;
