-- Migration 025: a movement already stored under the previous key version is not stored again when it arrives with a
-- new key and its legacy key (a re-read after a key change); a genuinely new movement is still stored.
begin;
select plan(3);

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into storage.objects (bucket_id, name, owner_id) values
  ('financial-source-files','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000025/bbbbbbbb-0000-0000-0000-000000000025/original.pdf','11111111-1111-1111-1111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select public.intake_register_file('r25','bank_statement','bank.pdf','unknown','aaaaaaaa-0000-0000-0000-000000000025','bbbbbbbb-0000-0000-0000-000000000025',
  '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000025/bbbbbbbb-0000-0000-0000-000000000025/original.pdf','bank.pdf','application/pdf',10,repeat('c',64),'file',gen_random_uuid());
create temp table t_d as select public.processing_begin_document('bbbbbbbb-0000-0000-0000-000000000025','v1','bank_documents',gen_random_uuid()) as id;

-- first read: stored under the old key
select public.processing_promote((select id from t_d),'checking','חשבון בנק','[{"key":"old-key-1","row_number":1,"sheet":"","date":"2026-05-17","direction":"debit","amount_minor":"6500","currency":"ILS","description":"עמ החזר"}]'::jsonb,'[]'::jsonb,gen_random_uuid());
select is((select count(*)::int from public.transactions where archived_at is null), 1, 'first read stores the movement');

-- re-read with the new key version: same movement (legacy key matches) — not stored again
select public.processing_promote((select id from t_d),'checking','חשבון בנק','[{"key":"new-key-1","legacy_key":"old-key-1","row_number":1,"sheet":"","date":"2026-05-17","direction":"debit","amount_minor":"6500","currency":"ILS","description":"עמ החזר"}]'::jsonb,'[]'::jsonb,gen_random_uuid());
select is((select count(*)::int from public.transactions where archived_at is null), 1, 'a re-read under a new key does not duplicate (legacy key recognised)');

-- a genuinely new movement is stored
select public.processing_promote((select id from t_d),'checking','חשבון בנק','[{"key":"new-key-2","legacy_key":"old-key-2","row_number":2,"sheet":"","date":"2026-05-18","direction":"debit","amount_minor":"1000","currency":"ILS","description":"אחר"}]'::jsonb,'[]'::jsonb,gen_random_uuid());
select is((select count(*)::int from public.transactions where archived_at is null), 2, 'a new movement is still stored');

select * from finish();
rollback;
