-- 019 storage (18A §40-42; 18D §31-32; T-5). Three private buckets; object paths start with the owner's uid:
--   source:  {owner_uid}/{source_id}/{file_id}/original.{ext}
--   derived: {owner_uid}/{source_id}/{file_id}/{processing_version}/...
-- Raw source objects are immutable for the user: no UPDATE/DELETE policy (23 §23, 18A §40).
-- Derived files are written server-side only. Exports: owner may create (a requested export) and read.
-- Access to file content is via short-lived signed URLs / server proxy, never a public URL (18A §40, 18D §31).

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('financial-source-files',  'financial-source-files',  false, 52428800),
  ('financial-derived-files', 'financial-derived-files', false, 52428800),
  ('financial-exports',       'financial-exports',       false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy financial_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('financial-source-files', 'financial-derived-files', 'financial-exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy financial_owner_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('financial-source-files', 'financial-exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
