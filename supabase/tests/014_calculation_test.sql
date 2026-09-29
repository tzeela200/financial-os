-- Calculation scaffold (18A §39; 23 §35 NULL != 0, §36 reproducibility; ADR-001)
begin;
select plan(9);

select has_table('public','calculation_runs','calculation_runs exists');
select has_table('public','calculation_inputs','calculation_inputs exists');
select has_table('public','calculation_results','calculation_results exists');
select col_not_null('public','calculation_runs','formula_version','every run records its formula version (reproducible)');
select col_not_null('public','calculation_runs','input_hash','every run records its input hash (reproducible)');

insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111111','owner@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
insert into public.calculation_runs (id, owner_user_id, calculation_type, formula_version, as_of_date, period_start, period_end, input_hash) values
  ('70000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','monthly_totals','monthly@1.0','2026-08-31','2026-08-01','2026-08-31',repeat('f',64));

-- 23 §35: no coverage -> no amount (never a fake 0)
select throws_ok($$insert into public.calculation_results (owner_user_id, calculation_run_id, metric_code, amount_minor, currency_code, coverage_status) values ('11111111-1111-1111-1111-111111111111','70000000-0000-0000-0000-000000000001','monthly_actual_expense',0,'ILS','none')$$, '23514', null, 'no coverage cannot produce 0 (NULL != 0)');
select lives_ok($$insert into public.calculation_results (owner_user_id, calculation_run_id, metric_code, amount_minor, coverage_status) values ('11111111-1111-1111-1111-111111111111','70000000-0000-0000-0000-000000000001','monthly_actual_income',null,'unknown')$$, 'unknown coverage stores NULL amount');
select lives_ok($$insert into public.calculation_results (owner_user_id, calculation_run_id, metric_code, amount_minor, currency_code, coverage_status) values ('11111111-1111-1111-1111-111111111111','70000000-0000-0000-0000-000000000001','known_obligations_total',0,'ILS','complete')$$, 'known zero allowed with complete coverage');
select throws_ok($$insert into public.calculation_results (owner_user_id, calculation_run_id, metric_code, coverage_status) values ('11111111-1111-1111-1111-111111111111','70000000-0000-0000-0000-000000000001','x','substantially_complete')$$, '23514', null, 'coverage limited to ADR-001 values');

select * from finish();
rollback;
