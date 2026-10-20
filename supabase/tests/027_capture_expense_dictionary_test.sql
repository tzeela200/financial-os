-- Migration 027: the expense-type dictionary exists in every environment exactly as in production (21.10.2026),
-- rates come only from the view and only when fixed and approved, and nobody but a migration can write to it.
begin;
select plan(14);

-- the same rows as production: counts and a fingerprint of every stored field (computed read-only on production)
select is((select count(*)::int from public.expense_tax_rules), 21, '21 tax rules');
select is((select count(*)::int from public.green_invoice_expense_types), 65, '65 expense types');
select is((select count(*)::int from public.green_invoice_expense_types where parent_id is null), 59, '59 Green Invoice types');
select is((select count(*)::int from public.green_invoice_expense_types where parent_id is not null), 6, '6 owner sub-types');
select is((select count(*)::int from public.green_invoice_expense_types where needs_review), 12, '12 types need review');
select is((select md5(string_agg(concat_ws('|',rule_code,domain,label_he,method,calculation_scope,fixed_pct,pct_status,requires_basis,legal_basis,
  conditions,parameters::text,rule_status,valid_from,valid_to,source,active),E'\n' order by rule_code)) from public.expense_tax_rules),
  'bc1a2c84bbef3c4720ff3194d2dba2fd', 'tax rules identical to production');
select is((select md5(string_agg(concat_ws('|',id,code,account_key,code_6111,sort_code,name_he,array_to_string(aliases,','),source,parent_id,
  reported_business_pct,reported_income_tax_pct,reported_vat_pct,income_tax_rule_code,vat_rule_code,needs_review,review_reason,
  name_is_ambiguous,active,notes),E'\n' order by id)) from public.green_invoice_expense_types),
  '1af6900885e2334378aae4c3420c6b59', 'expense types identical to production');

-- the view: fixed status 44 / 45; a rate is shown only when fixed, approved and the type is not under review
select is((select count(*)::int from public.green_invoice_expense_types_v where income_tax_pct_status = 'fixed'), 44, 'income tax fixed: 44');
select is((select count(*)::int from public.green_invoice_expense_types_v where vat_pct_status = 'fixed'), 45, 'VAT fixed: 45');
select is_empty($$select name_he from public.green_invoice_expense_types_v
  where (income_tax_pct is not null or vat_pct is not null) and needs_review$$, 'no rate for a type under review');
select is_empty($$select name_he from public.green_invoice_expense_types_v
  where (income_tax_pct is not null and income_tax_pct_status <> 'fixed') or (vat_pct is not null and vat_pct_status <> 'fixed')$$,
  'a rate appears only when its rule is fixed');

-- permissions: the signed-in user reads; nobody but a migration writes; anonymous sees nothing; RLS forced
select ok(has_table_privilege('authenticated', 'public.green_invoice_expense_types_v', 'select')
  and has_table_privilege('authenticated', 'public.expense_tax_rules', 'select'), 'signed-in user can read');
select ok(not has_table_privilege('authenticated', 'public.green_invoice_expense_types', 'insert, update, delete')
  and not has_table_privilege('authenticated', 'public.expense_tax_rules', 'insert, update, delete')
  and not has_table_privilege('anon', 'public.green_invoice_expense_types_v', 'select'), 'no write grant; anonymous has no access');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('public.expense_tax_rules'::regclass, 'public.green_invoice_expense_types'::regclass)), 'RLS enabled and forced');

select * from finish();
rollback;
