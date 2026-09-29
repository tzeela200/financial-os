-- dictionaries seeded from the canonical glossary (18A §35, §64, ADR-001)
begin;
select plan(7);
select has_table('public', 'dictionary_values', 'dictionary table exists');
select is((select count(*)::int from public.dictionary_values where dictionary = 'coverage_status'), 5, 'coverage_status has exactly 5 values (ADR-001)');
select is((select count(*)::int from public.dictionary_values where dictionary = 'verification_status'), 5, 'verification_status has exactly 5 values');
select is((select count(*)::int from public.dictionary_values where dictionary = 'reconciliation_status'), 6, 'reconciliation_status has exactly 6 values');
select is_empty($$select 1 from public.dictionary_values where code in ('substantially_complete','missing','likely_verified')$$, 'no forbidden values seeded');
select is_empty($$select 1 from public.dictionary_values where dictionary = 'verification_status' and code = 'reported'$$, 'reported is not a verification value');
-- read-only for the user: writes only via migration/seed
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok($$insert into public.dictionary_values (dictionary, code) values ('coverage_status','almost')$$, '42501', null, 'user cannot add dictionary values');
select * from finish();
rollback;
