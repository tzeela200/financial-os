-- Global schema invariants (Gate 1; 18A §8, §48-49; 18D §28; 23D §13). Catches any future table that forgets a rule.
begin;
select plan(8);

-- every public table has RLS enabled AND forced (except the read-only registries which are enabled)
select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$$, 'RLS enabled on every public table');

-- no float money anywhere (18A §8)
select is_empty($$select table_name || '.' || column_name from information_schema.columns
  where table_schema = 'public' and data_type in ('real', 'double precision')$$, 'no float columns in public schema');

-- every *_minor column is bigint (18A §8-9)
select is_empty($$select table_name || '.' || column_name from information_schema.columns
  where table_schema = 'public' and column_name like '%\_minor' and data_type <> 'bigint'$$, 'every *_minor column is bigint');

-- no DELETE policy anywhere: no hard delete by the user (18A §2, §48)
select is_empty($$select tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and cmd in ('DELETE', 'ALL')$$, 'no delete policies (no hard delete)');

-- canonical / derived / knowledge / trust tables accept no user writes (23D §13): no INSERT/UPDATE policy
select is_empty($$select tablename || '.' || cmd from pg_policies where schemaname = 'public' and cmd in ('INSERT', 'UPDATE')
  and tablename in ('parties','party_aliases','party_roles','party_identifiers','accounts','transactions','income','expenses','allocations',
    'payments','payment_transactions','payment_allocations','obligations','obligation_occurrences','receivables','loans','debts',
    'credit_facilities','agreements','agreement_installments','legal_cases','events','assets','taxes','government_records',
    'documents','observations','reconciliations','reconciliation_members','match_candidates','calculation_runs','calculation_inputs',
    'calculation_results','findings','contradictions','knowledge_items','evidence','evidence_links','provenance_edges',
    'entity_field_sources','exceptions','review_queue_items','qa_runs','qa_check_results','tool_runs','rule_versions',
    'processing_runs','jobs','dead_letter_jobs','audit_events')$$, 'no user write policies on canonical/derived/trust tables');

-- every table with owner_user_id has it NOT NULL (T-4)
select is_empty($$select table_name from information_schema.columns
  where table_schema = 'public' and column_name = 'owner_user_id' and is_nullable = 'YES'$$, 'owner_user_id is never nullable');

-- anon has no table privileges at all (migration 002)
select is_empty($$select table_name from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'$$, 'anon has no privileges on public tables');

-- every sensitive table (all except registries/dictionaries) carries owner_user_id
select is_empty($$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('app_profile','schema_versions','processing_versions','dictionary_values')
    and not exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'owner_user_id')$$,
  'every sensitive table carries owner_user_id');

select * from finish();
rollback;
