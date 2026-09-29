-- N:M relationship tables (18A §37, §49, §61, §72-73 scenario 2)
begin;
select plan(12);

select has_table('public','document_entity_links','document_entity_links exists');
select has_table('public','entity_source_links','entity_source_links exists');
select has_table('public','expense_transaction_links','expense_transaction_links exists');
select has_table('public','income_transaction_links','income_transaction_links exists');
select has_table('public','loan_payment_links','loan_payment_links exists');
select has_table('public','debt_payment_links','debt_payment_links exists');
select has_table('public','debt_agreement_links','debt_agreement_links exists');
select has_table('public','legal_case_debt_links','legal_case_debt_links exists');
select has_table('public','legal_case_document_links','legal_case_document_links exists');
select has_table('public','event_entity_links','event_entity_links exists');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.sources (id, owner_user_id, source_type, source_name) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','business_expense_export','x');
insert into public.source_files (id, owner_user_id, source_id, storage_bucket, storage_path, original_filename, mime_type, size_bytes, sha256) values
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','u/a/1/original.pdf','inv.pdf','application/pdf',1,repeat('1',64)),
  ('bbbbbbbb-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','financial-source-files','u/a/2/original.pdf','rcpt.pdf','application/pdf',1,repeat('2',64));
insert into public.documents (id, owner_user_id, source_file_id) values
  ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.expenses (id, owner_user_id, expense_date, gross_minor, currency_code, actuality_status) values ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-08-01',30000,'ILS','actual');

-- scenario 2: invoice + receipt -> one expense, counted once (18A §61, §73)
insert into public.document_entity_links (owner_user_id, document_id, entity_type, entity_id, relation_type) values
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000001','expense','10000000-0000-0000-0000-000000000001','invoice'),
  ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-000000000002','expense','10000000-0000-0000-0000-000000000001','receipt');
select is((select coalesce(sum(e.gross_minor),0) from public.expenses e where exists (select 1 from public.document_entity_links l where l.entity_type='expense' and l.entity_id=e.id)), 30000::numeric, 'two documents, one expense, counted once');

-- allocation cap on the transaction side (18A §49)
insert into public.accounts (id, owner_user_id, account_type_code, account_name, currency_code) values ('ffffffff-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','checking','x','ILS');
insert into public.transactions (id, owner_user_id, account_id, transaction_date, direction, amount_minor, currency_code) values ('40000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ffffffff-0000-0000-0000-000000000001','2026-08-02','debit',30000,'ILS');
select throws_like($$insert into public.expense_transaction_links (owner_user_id, expense_id, transaction_id, allocated_amount_minor) values ('11111111-1111-1111-1111-111111111111','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',30001)$$, '%exceed%', 'allocations cannot exceed the transaction amount');

select * from finish();
rollback;
