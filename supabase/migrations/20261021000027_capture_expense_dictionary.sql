-- 027 Capture: the expense-type dictionary and its tax rules (ADR-009; approved by the owner 21.10.2026).
-- The two tables and the view were created by hand in production on 20.10.2026 (green_invoice_expense_types_FINAL_2026-10-20.sql
-- — that script is an archive and must not be re-run). This migration records the exact live state in the repository so that
-- every environment (CI, local, a future project) has it:
--   * production: tables, constraints, rows, view and policies already exist -> every create/insert below is a no-op;
--     the only real change is hardening: write grants revoked from authenticated (RLS already blocked them) + RLS forced.
--   * a fresh database: everything is created and the 21 rules + 65 expense types are inserted as they are in production.
-- Rates are read only from the view: a rate appears only for an approved, active rule with pct_status='fixed' and a type that
-- does not need review. Income tax and VAT stay separate rules. Writes only via migrations (no insert/update/delete policy).

create table if not exists public.expense_tax_rules (
  rule_code text primary key,
  domain text not null,
  label_he text not null,
  method text not null,
  calculation_scope text not null,
  fixed_pct numeric(5,2),
  pct_status text not null default 'depends',
  requires_basis boolean not null default false,
  legal_basis text,
  conditions text,
  parameters jsonb not null default '{}'::jsonb,
  rule_status text not null default 'approved',
  valid_from date,
  valid_to date,
  source text not null default 'סקיל israeli-expense-categorizer (2026). הצעה בלבד, לאמת מול רואה החשבון',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_tax_rules_domain_check check (domain = any (array['income_tax', 'vat'])),
  constraint expense_tax_rules_pct_check check (fixed_pct is null or (fixed_pct >= 0 and fixed_pct <= 100)),
  constraint expense_tax_rules_pct_status_check check (pct_status = any (array['fixed', 'depends', 'not_applicable', 'undetermined'])
    and ((pct_status = 'fixed') = (fixed_pct is not null))),
  constraint expense_tax_rules_prefix_check check ((domain = 'income_tax' and left(rule_code, 3) = 'it_')
    or (domain = 'vat' and left(rule_code, 4) = 'vat_')),
  constraint expense_tax_rules_scope_check check (calculation_scope = any (array['per_document', 'annual', 'allocation_basis', 'manual'])),
  constraint expense_tax_rules_status_check check (rule_status = any (array['proposed', 'approved'])),
  constraint expense_tax_rules_validity_check check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table if not exists public.green_invoice_expense_types (
  id uuid primary key default gen_random_uuid(),
  code text generated always as (account_key::text || ':' || name_he) stored,
  account_key int not null,
  code_6111 int not null,
  sort_code int not null,
  name_he text not null,
  aliases text[] not null default '{}',
  source text not null default 'green_invoice',
  parent_id uuid references public.green_invoice_expense_types (id),
  reported_business_pct numeric(5,2),
  reported_income_tax_pct numeric(5,2),
  reported_vat_pct numeric(5,2),
  income_tax_rule_code text not null references public.expense_tax_rules (rule_code),
  vat_rule_code text not null references public.expense_tax_rules (rule_code),
  needs_review boolean not null default false,
  review_reason text,
  name_is_ambiguous boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gi_expense_types_code_key unique (code),
  constraint gi_expense_types_alias_not_own_name check (not (name_he = any (aliases))),
  constraint gi_expense_types_parent_check check ((source = 'alldent_split') = (parent_id is not null)),
  constraint gi_expense_types_pct_check check (reported_business_pct >= 0 and reported_business_pct <= 100
    and reported_income_tax_pct >= 0 and reported_income_tax_pct <= 100 and reported_vat_pct >= 0 and reported_vat_pct <= 100),
  constraint gi_expense_types_reported_check check (source <> 'green_invoice'
    or (reported_business_pct is not null and reported_income_tax_pct is not null and reported_vat_pct is not null)),
  constraint gi_expense_types_review_flag_check check (needs_review or (income_tax_rule_code <> 'it_review' and vat_rule_code <> 'vat_review')),
  constraint gi_expense_types_review_reason_check check (not needs_review or review_reason is not null),
  constraint gi_expense_types_rule_domain_check check (left(income_tax_rule_code, 3) = 'it_' and left(vat_rule_code, 4) = 'vat_'),
  constraint gi_expense_types_source_check check (source = any (array['green_invoice', 'alldent_split']))
);

create index if not exists gi_expense_types_name_idx on public.green_invoice_expense_types (name_he);
create index if not exists gi_expense_types_key_idx on public.green_invoice_expense_types (account_key);
create index if not exists gi_expense_types_aliases_idx on public.green_invoice_expense_types using gin (aliases);
create index if not exists gi_expense_types_it_rule_idx on public.green_invoice_expense_types (income_tax_rule_code);
create index if not exists gi_expense_types_vat_rule_idx on public.green_invoice_expense_types (vat_rule_code);

-- rows: exactly as in production on 21.10.2026 (ids kept, so sub-types keep their parent). Existing rows are never overwritten.
insert into public.expense_tax_rules (rule_code, domain, label_he, method, calculation_scope, fixed_pct, pct_status, requires_basis,
  legal_basis, conditions, parameters, rule_status, valid_from, valid_to, source, active) values
  ('it_allocation', 'income_tax', 'הוצאה מעורבת: נדרש בסיס חלוקה', 'אין אחוז גורף. החלק העסקי נקבע לפי בסיס מתועד', 'allocation_basis', null, 'depends', true, 'פרק 10 במסמכי המערכת; שטח עסקי מול שטח כולל', 'חלוקה לפי שטח משרד חלקי שטח הבית. יחס מעל 50% מעורר בדיקה. נדרש תיעוד: תוכנית, תמונות, שימוש בלעדי', '{"basis": "business_area_over_total_area", "scrutiny_above_pct": 50}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_capital_depreciation', 'income_tax', 'נכס הוני: פחת', 'אינו הוצאה שוטפת. נפחת לפי סוג הנכס', 'annual', null, 'depends', true, 'תקנות מס הכנסה (פחת), תוספת ב', 'פריט נמוך עד סף מוכר כהוצאה מיידית. רכב: ראה הוצאות רכב', '{"method": "straight_line_on_original_cost", "annual_rates_pct": {"furniture_hotel": 9, "office_furniture": 6, "machinery_general": 7, "personal_computer": 33, "vehicle_default_class": 15, "other_computer_rate_note": "33 לפי הכרעת בעלת העסק ב-20.10.2026. הסקיל קובע 25 לשרתים ולמחשבים אחרים. לאישור רו\"ח", "furniture_cafe_restaurant": 12, "other_computer_incl_servers": 33, "electronic_equipment_not_computers": 15}, "first_month_convention": "to_be_set_by_accountant", "leasehold_improvements": "no_fixed_rate_in_regulations_shorter_of_lease_term_or_useful_life", "low_value_threshold_ils": 1200, "low_value_threshold_verified": false}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_composite_split', 'income_tax', 'מאגד: פיצול לפי מהות', 'הקטגוריה מאגדת הוצאות בטיפול שונה. כל מסמך מסווג לפי מהותו לפני קביעת ניכוי', 'manual', null, 'depends', true, 'תקנות ניכוי הוצאות מסוימות 1972, תקנה 2(1)', 'אירוח בארץ 0%. אירוח אורחי חוץ עד סכום סביר. כיבוד קל במשרד עד 80%. מתנות עד תקרה לנמען. תרומה היא זיכוי ולא הוצאה. קנסות 0%', '{"fines_pct": 0, "indexed_annually": true, "hospitality_israel_pct": 0, "light_refreshments_workplace_pct": 80, "gift_cap_ils_per_recipient_per_year": 240, "gift_cap_usd_per_foreign_recipient_per_year": 15}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_computed_entry', 'income_tax', 'רישום חישובי', 'נוצר בחישוב ולא ממסמך ספק', 'annual', null, 'not_applicable', false, 'פחת מחושב', 'אינו נקלט מחשבונית', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_full', 'income_tax', 'הוצאה מוכרת במלואה', 'ניכוי מלא כשההוצאה עסקית ומתועדת', 'per_document', 100.00, 'fixed', false, 'סעיף 17 לפקודת מס הכנסה', 'הוצאה בייצור הכנסה ושימוש עסקי בלבד. עוסק מורשה רושם הוצאה נטו ממע"מ תשומות מוכר', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_home_office_area', 'income_tax', 'משרד ביתי: 25% לפי שטח', 'החלק היחסי לפי שטח המשרד מתוך שטח הבית. 25% לפי הצהרת בעלת העסק', 'allocation_basis', 25.00, 'fixed', true, 'חלוקה לפי שטח (פרק 10 במסמכי המערכת)', 'נדרש תיעוד: חשבונות על שם העסק או הדירה, תשריט או חישוב יחס שטח. יחס מעל 50% מעורר בדיקה', '{"basis": "business_area_over_total_area", "source": "stated_by_owner", "stated_on": "2026-10-20", "business_area_pct": 25}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_inventory_cogs', 'income_tax', 'מלאי: עלות המכר', 'אינו הוצאת תקופה. מגיע לרווח והפסד דרך עלות המכר', 'annual', null, 'depends', true, 'הוראות ניהול פנקסים: ספירת מלאי בסוף שנה', 'עלות המכר = מלאי פתיחה + קניות פחות מלאי סגירה', '{"formula": "opening_stock + purchases - closing_stock"}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_mobile_50pct', 'income_tax', 'נייד: 50% מהחשבונית', '50% מהחשבונית החודשית של הנייד (שימוש מעורב, רצפת אי-הכרה לשימוש פרטי)', 'per_document', 50.00, 'fixed', true, 'תקנות מס הכנסה (ניכוי הוצאות טלפון נייד). נקבע לפי הנחיית בעלת העסק ב-20.10.2026', 'הרצפה השנתית הקבועה בתקנות עשויה להשפיע בחישוב השנתי. באחריות בעלת העסק', '{"pct": 50, "stated_by_owner_on": "2026-10-20"}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_per_diem_cap', 'income_tax', 'אש"ל חו"ל: תקרות', 'הוצאות שהייה בחו"ל בתוך תקרה יומית. אין אחוז נפרד לארוחות', 'manual', null, 'depends', true, 'כללי אש"ל חו"ל 2026 (לפי הסקיל)', 'נדרשת תכלית עסקית מתועדת וקבלות לינה', '{"year": 2026, "usd_per_day_with_lodging": 102, "usd_per_day_without_lodging": 171}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_review', 'income_tax', 'דורש הכרעה מקצועית', 'אין מספיק מידע לקבוע מהות. לא מנחשים', 'manual', null, 'undetermined', true, 'כלל איסור הניחוש במסמכי המערכת', 'להכריע לפי מסמך המקור ופירוט', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_vehicle_annual', 'income_tax', 'הוצאות רכב: חישוב שנתי', 'הגבוה מבין הוצאות שוטפות פחות שווי שימוש לבין אחוז מההוצאות. חישוב אחד לכל הרכב בסוף שנה, לא לכל שורה', 'annual', null, 'depends', true, 'תקנות מס הכנסה (ניכוי הוצאות רכב) התשנ"ה-1995, תקנה 2', 'נדרש קילומטראז'' תחילת וסוף שנה לכל רכב. שווי שימוש נקבע לפי טבלת רשות המסים. סיווג הרכב ברישיון קובע את האחוז', '{"formula": "max(running_costs - use_value, pct * running_costs)", "pct_l3_motorcycle": 25, "owner_vehicle_class": "ordinary", "pct_ordinary_vehicle": 45, "pct_m1_tour_or_desert": 80, "pct_driving_instruction": 77.5, "pct_m1_public_bus_or_taxi": 90, "odometer_start_end_required": true, "pct_driving_instruction_two_cars_one_automatic": 68}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_work_clothing', 'income_tax', 'ביגוד עבודה: 80%', '80%. 100% רק כשלא ניתן להשתמש אחרת', 'per_document', 80.00, 'fixed', false, 'תקנות ניכוי הוצאות מסוימות 1972, תקנה 2(6)', 'מוכר כביגוד עבודה רק אם מזהה את העסק בבירור או חובה בחוק. לבוש עסקי רגיל אינו מוכר', '{"pct": 80, "pct_if_work_only": 100}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('it_zero', 'income_tax', 'לא מוכרת', 'אין ניכוי', 'per_document', 0.00, 'fixed', false, 'לפי סוג ההוצאה: קנסות, בגדים אישיים, נסיעה למקום עבודה קבוע, בידור אישי', null, '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_allocation', 'vat', 'חלוקה לפי שימוש עסקי', 'קיזוז רק בחלק העסקי', 'allocation_basis', null, 'depends', true, 'פרק 10 במסמכי המערכת', 'נדרש בסיס חלוקה מתועד', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_composite_split', 'vat', 'מאגד: לפי מהות', 'קיזוז נקבע לכל מסמך לפי מהותו', 'manual', null, 'depends', true, 'לפי סוג ההוצאה', 'אירוח בארץ 0%. כיבוד קל במקום העסק 100%. טובת הנאה לעובד (ארוחות, אירועי עובדים, מתנות) 0% לפי תקנה 15א. במס הכנסה כיבוד קל 80% מהבסיס לפני מע"מ', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_full_if_tax_invoice', 'vat', 'מע"מ תשומות מלא, בחשבונית מס תקפה', 'קיזוז מלא של מע"מ התשומות בחשבונית מס תקפה על הוצאה עסקית', 'per_document', 100.00, 'fixed', false, 'חוק מע"מ, סעיף 38(א1) (מספר הקצאה)', 'כשהסכום לפני מע"מ עולה על הסף, החשבונית כוללת מע"מ (לא עסקה בשיעור אפס) והנמען עוסק מורשה, נדרש מספר הקצאה בחשבונית, אחרת אין קיזוז. אין תנאי של דרישת הקונה לעניין אובדן הניכוי. הסף נקבע לפי תאריך החשבונית. קבלה בלבד אינה חשבונית מס', '{"allocation_number_net_over_ils": [{"from": "2024-05-01", "over": 25000}, {"from": "2025-01-01", "over": 20000}, {"from": "2026-01-01", "over": 10000}, {"from": "2026-06-01", "over": 5000}], "threshold_is_exceeds_not_equal": true}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_not_applicable', 'vat', 'לא רלוונטי', 'אין מע"מ תשומות', 'per_document', null, 'not_applicable', false, null, null, '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_not_deductible', 'vat', 'מע"מ אינו מוכר', 'אין קיזוז', 'per_document', 0.00, 'fixed', false, 'תקנות מע"מ, תקנה 14 ואירוח לפי הסקיל', 'רכישת רכב פרטי; אירוח ומזון', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_review', 'vat', 'דורש הכרעה מקצועית', 'אין מספיק מידע לקבוע זכאות. לא מנחשים', 'manual', null, 'undetermined', true, 'כלל איסור הניחוש במסמכי המערכת', 'להכריע לפי מסמך המקור על דעת בעלת העסק', '{}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_two_thirds_business_use', 'vat', 'שני שלישים: שימוש עיקרי עסקי', 'קיזוז שני שלישים ממע"מ התשומות. חל רק כשהשימוש בעיקרו עסקי', 'per_document', 66.67, 'fixed', true, 'נקבע לפי הנחיית בעלת העסק ב-20.10.2026. מקור התקנה לא אומת', 'שימוש בעיקרו פרטי מקבל רבע ולא מכוסה בכלל הזה: יש לסווג מחדש. בכפוף לחשבונית מס תקפה', '{"fraction": "2/3", "applies_when": "primary_business_use", "stated_by_owner_on": "2026-10-20", "private_use_fraction_not_covered": "1/4"}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true),
  ('vat_vehicle_2_3_or_1_4', 'vat', 'הוצאות רכב: שני שלישים או רבע', 'מע"מ על הוצאות שוטפות של רכב. שני שלישים כשהשימוש העיקרי עסקי, אחרת רבע', 'allocation_basis', null, 'depends', true, 'תקנות מע"מ: 2/3 או 1/4 על הוצאות החזקת רכב. מספר התקנה לא אומת (תקנה 14 חוסמת רק את רכישת הרכב)', 'מע"מ על רכישת רכב פרטי אינו מוכר כלל (תקנה 14), למעט חריגים לעוסק שהרכבים הם עיסוקו', '{"otherwise": "1/4", "primary_business_use": "2/3", "private_vehicle_purchase": "not_deductible"}'::jsonb, 'approved', null, null, 'סקיל israeli-expense-categorizer (2026). החלטות בעלת העסק, באחריותה', true)
on conflict do nothing;

-- parents first (59 Green Invoice types), then the 6 owner sub-types (source alldent_split) that point at them
insert into public.green_invoice_expense_types (id, account_key, code_6111, sort_code, name_he, aliases, source, parent_id,
  reported_business_pct, reported_income_tax_pct, reported_vat_pct, income_tax_rule_code, vat_rule_code, needs_review, review_reason,
  name_is_ambiguous, active, notes) values
  ('4686e250-0e1a-42da-9d71-ed255bb43502', 1310, 1310, 1300, 'עבודות חוץ וקבלני משנה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'לבדוק ניכוי מס במקור לקבלן או לעצמאי, ומספר הקצאה בחשבונית מעל הסף'),
  ('096274b3-7388-406e-93f8-3191156f8bb4', 1310, 1310, 1300, 'ערוץ שיווק, השכרת קליניקה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('8b9b9054-58e3-42b1-882b-a2f2b7bd48e2', 1320, 1320, 1300, 'קניות סחורה בארץ', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_inventory_cogs', 'vat_full_if_tax_invoice', false, null, false, true, 'סחורה למכירה (לפי הנחיית בעלת העסק). לא הוצאה שוטפת: עלות המכר מחושבת בסוף השנה'),
  ('6a4ab6d5-812f-4755-bc01-42c3caca3761', 1390, 1390, 1300, 'ארנונה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_home_office_area', 'vat_not_applicable', false, null, true, true, 'מס עירוני ללא מע"מ. 25% לפי הצהרת בעלת העסק (משרד בבית). נדרש תיעוד: חשבונות על שם העסק או הדירה, תשריט או חישוב יחס שטח'),
  ('1e96bac5-13ab-4782-8ec4-bacf598b91a3', 1390, 1390, 1300, 'כללי', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_review', 'vat_review', true, 'חייב סיווג: אין קטגוריה סופית כזאת. כל מסמך נכנס לבדיקה ומיפוי לקטגוריה ספציפית לפני שמחושב לו אחוז הכרה', false, true, null),
  ('4f8f968b-71df-47fa-a633-bd19a91ddebe', 1390, 1390, 1300, 'מערכת לידים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'מוכר רק בשימוש עסקי בלבד'),
  ('261a82e6-e045-46df-9ddd-b5ee8ea821a6', 1390, 1390, 1300, 'נייד', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_mobile_50pct', 'vat_two_thirds_business_use', false, null, false, true, '50% במס הכנסה, שני שלישים במע"מ (לפי הנחיית בעלת העסק)'),
  ('c16cbc91-6adb-47c4-90bf-74d1ea90aab4', 1390, 1390, 1300, 'עלויות אחרות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_review', 'vat_review', true, 'חייב סיווג: אין קטגוריה סופית כזאת. כל מסמך נכנס לבדיקה ומיפוי לקטגוריה ספציפית לפני שמחושב לו אחוז הכרה', false, true, null),
  ('4fc364bf-9057-4130-b493-e1d3f614e116', 1390, 1390, 1300, 'ציוד משרדי', '{"ציוד מנשרדי"}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'פריט מעל כ-1,200 ש"ח נחשב נכס הוני ונפחת'),
  ('59d6f1d1-edb7-4e39-81cc-6d263affabf9', 1390, 1390, 1300, 'קניות סחורה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_inventory_cogs', 'vat_full_if_tax_invoice', false, null, false, true, 'סחורה למכירה (לפי הנחיית בעלת העסק). לא הוצאה שוטפת: עלות המכר מחושבת בסוף השנה'),
  ('f126eaa2-2ca1-4316-90a3-6c599f0d8e62', 1390, 1390, 1300, 'תוכנה', '{תוסף}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'תוסף = תוכנה לפי הנחיית בעלת העסק (כינוי). מוכר רק בשימוש עסקי בלבד'),
  ('5027ae4a-4546-4432-a633-92dcf6db7e8a', 1390, 1390, 1300, 'תוכנת לידים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'מוכר רק בשימוש עסקי בלבד'),
  ('15283d14-cc59-4b1b-bfad-213bace07517', 1390, 1390, 1300, 'תוכנת עיצוב', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'מוכר רק בשימוש עסקי בלבד'),
  ('a21e3819-3ada-4ca8-9269-7b5417a80865', 1390, 1390, 1300, 'תוכנת עסק', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'מוכר רק בשימוש עסקי בלבד'),
  ('43b9cfef-e718-4c9c-8c4b-1256bf7eacbe', 3015, 3015, 3000, 'הוצאות הובלה ואחסנה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('a7b8e6aa-84b5-428c-92a6-c3ffbc7991dd', 3055, 3055, 3000, 'הוצאות מחקר ופיתוח', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, null),
  ('ed620d3c-ed31-4920-98ac-16a7fa267cf6', 3060, 3060, 3000, 'חניה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_vehicle_annual', 'vat_vehicle_2_3_or_1_4', true, 'חניה היא חלק מהוצאות הרכב ומחושבת בחישוב השנתי. חניה שאינה קשורה לרכב בבעלות כפופה לכלל אחר', true, true, null),
  ('41f51a30-1782-40d1-996f-c25715f29f87', 3060, 3060, 3000, 'מונית', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'מוכר ב-100% לפי הנחיית בעלת העסק. מע"מ בכפוף לחשבונית מס תקפה'),
  ('43a3547d-fcb9-4ec9-8472-7a8d14315777', 3060, 3060, 3000, 'נסיעות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, '100% לפי הנחיית בעלת העסק. מע"מ בכפוף לחשבונית מס תקפה. נסיעה למקום עבודה קבוע אינה מוכרת'),
  ('2b0a748e-1deb-4fa9-bec9-d39787c904ff', 3060, 3060, 3000, 'נסיעות כביש 6', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'אגרת נסיעה בכביש אגרה: 100% במס הכנסה לפי הנחיית בעלת העסק, מחוץ לחישוב הרכב. אינה אגרת רכב (רישוי וביטוח). מע"מ: 100% בחשבונית מס תקפה, לפי הנחיית בעלת העסק. באחריות בעלת העסק'),
  ('a4c920ed-692d-4bbc-93ec-250568f572fc', 3066, 3066, 3000, 'אחזקת רכב והובלות (ללא דלק)', '{}', 'green_invoice', null, 100.00, 0.00, 0.00, 'it_composite_split', 'vat_review', true, 'מאגד: ליסינג, ביטוח ותיקונים הם כלל רכב. הובלה אינה הוצאת רכב. רכישת רכב היא נכס הוני ומע"מ עליה אינו מוכר', true, true, null),
  ('52d1af81-61ed-4df8-9231-15c1d32f5bb8', 3066, 3066, 3000, 'רישיון רכב', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_vehicle_annual', 'vat_not_applicable', false, null, false, true, 'אגרת רישוי רכב: כלולה בחישוב הרכב השנתי, לא נחשבת אגרת כביש. ללא מע"מ תשומות (החלטת בעלת העסק, לא אומת מקצועית)'),
  ('74539beb-b1e2-4a14-b76c-cec8baec3fa6', 3067, 3067, 3000, 'הוצאות דלק', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_vehicle_annual', 'vat_vehicle_2_3_or_1_4', false, null, false, true, null),
  ('eaa4099a-707f-4add-b9e3-7884436831f8', 3070, 3070, 3000, 'דמי שכירות וניהול נכסים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_home_office_area', 'vat_not_deductible', false, null, false, true, '25% לפי הצהרת בעלת העסק (משרד בבית). מע"מ 0%: חשבונית על שם דירת מגורים פרטית (לפי הנחיית בעלת העסק). שכירות למגורים פטורה ממע"מ'),
  ('9a06fa10-0a17-4d10-9b68-dc474c9981aa', 3075, 3075, 3000, 'מכרזים, ירידים ותערוכות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('3bc792c9-2573-4ad0-97d8-14aa2955b736', 3080, 3080, 3000, 'פחת', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_computed_entry', 'vat_not_applicable', false, null, true, true, 'רישום חישובי, אינו נקלט ממסמך ספק'),
  ('3653c9ce-0c5e-4c9e-8f72-b2b1e491e9c9', 3085, 3085, 3000, 'בגדי עבודה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_work_clothing', 'vat_full_if_tax_invoice', false, null, true, true, '80% לפי הנחיית בעלת העסק'),
  ('067c6a38-d074-4212-83f7-235ede0e7bde', 3085, 3085, 3000, 'נעלי עבודה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_work_clothing', 'vat_full_if_tax_invoice', false, null, false, true, '80% לפי הנחיית בעלת העסק'),
  ('36c4a029-5c98-4d10-bb8a-75af5dfdfd45', 3085, 3085, 3000, 'נעלי עבודה למרפאה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_work_clothing', 'vat_full_if_tax_invoice', false, null, false, true, '80% לפי הנחיית בעלת העסק'),
  ('fed8f5e4-4c97-4462-acd5-f82b3e717458', 3090, 3090, 3000, 'שונות נטו', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_review', 'vat_review', true, 'חייב סיווג: אין קטגוריה סופית כזאת. כל מסמך נכנס לבדיקה ומיפוי לקטגוריה ספציפית לפני שמחושב לו אחוז הכרה', false, true, null),
  ('e55a83ff-b740-47e3-943a-f49e0ec34455', 3515, 3515, 3500, 'ביטוח מקיף', '{}', 'green_invoice', null, 100.00, 66.67, 0.00, 'it_vehicle_annual', 'vat_not_applicable', false, null, false, true, 'ביטוח רכב: חלק מחישוב הרכב. ללא מע"מ תשומות (החלטת בעלת העסק, לא אומת מקצועית)'),
  ('df8119b6-22c3-449b-8d34-52cd178072e6', 3515, 3515, 3500, 'ביטוחים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_composite_split', 'vat_composite_split', true, 'מפוצל לשלושה תתי-סוגים: רכב, בריאות, מקצועי. לבחור תת-סוג לפי מהות הפוליסה', false, true, null),
  ('c8f6c3f1-9de9-4dc0-a165-050eff023696', 3520, 3520, 3500, 'מכירות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'מסווג כשיווק לפי הנחיית בעלת העסק'),
  ('d67942cf-0af6-434b-92fb-96a5f42ca34b', 3520, 3520, 3500, 'עבודות חוץ וקבלני משנה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'לבדוק ניכוי מס במקור לקבלן או לעצמאי, ומספר הקצאה בחשבונית מעל הסף'),
  ('390f5747-f289-44f2-ad6c-3811874a216a', 3535, 3535, 3500, 'הוצאות ציוד מתכלה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('15640b0b-22ec-4334-9e73-634481f61f65', 3540, 3540, 3500, 'שירותים מקצועיים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('631dd8fb-6d98-4904-9e7a-592c98e9167c', 3550, 3550, 3500, 'הוצאות אחזקה ותיקונים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'תיקון מוכר (סעיף 17(3)). שיפור הוא נכס הוני'),
  ('fa6e71b2-5106-429d-a293-ecaa49337394', 3555, 3555, 3500, 'הוצאות מחקר ופיתוח', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, null),
  ('44c438b0-674f-42e7-8270-0eb647829aea', 3560, 3560, 3500, 'חניה', '{חנייה}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_vehicle_annual', 'vat_vehicle_2_3_or_1_4', true, 'חניה היא חלק מהוצאות הרכב ומחושבת בחישוב השנתי. חניה שאינה קשורה לרכב בבעלות כפופה לכלל אחר', true, true, null),
  ('edc5e2d1-62c4-493d-8019-8186e95dcc98', 3560, 3560, 3500, 'מונית', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'מוכר ב-100% לפי הנחיית בעלת העסק. מע"מ בכפוף לחשבונית מס תקפה'),
  ('237b11ca-674a-42d0-9983-153a7e4fe9c9', 3560, 3560, 3500, 'נסיעות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, '100% לפי הנחיית בעלת העסק. מע"מ בכפוף לחשבונית מס תקפה. נסיעה למקום עבודה קבוע אינה מוכרת'),
  ('d745ee88-a9e0-46fa-bb16-1fa4b2763c20', 3560, 3560, 3500, 'נסיעות חוצה צפון', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'אגרת נסיעה בכביש אגרה: 100% במס הכנסה לפי הנחיית בעלת העסק, מחוץ לחישוב הרכב. אינה אגרת רכב (רישוי וביטוח). מע"מ: 100% בחשבונית מס תקפה, לפי הנחיית בעלת העסק. באחריות בעלת העסק'),
  ('e6bc698e-d860-42c0-aa2d-34214f11a1d8', 3566, 3566, 3500, 'אחזקת רכב והובלות (ללא דלק)', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_composite_split', 'vat_review', true, 'מאגד: ליסינג, ביטוח ותיקונים הם כלל רכב. הובלה אינה הוצאת רכב. רכישת רכב היא נכס הוני ומע"מ עליה אינו מוכר', true, true, null),
  ('7f336537-428e-4a62-8f87-faa6761ebde9', 3575, 3575, 3500, 'ארנונה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_home_office_area', 'vat_not_applicable', false, null, true, true, 'מס עירוני ללא מע"מ. 25% לפי הצהרת בעלת העסק (משרד בבית). נדרש תיעוד: חשבונות על שם העסק או הדירה, תשריט או חישוב יחס שטח'),
  ('2efcdd69-9600-46d5-8dee-59060bd67de2', 3580, 3580, 3500, 'פחת', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_computed_entry', 'vat_not_applicable', false, null, true, true, 'רישום חישובי, אינו נקלט ממסמך ספק'),
  ('05acf298-91b2-4f74-b8c6-c94b9fb9f480', 3590, 3590, 3500, 'חשמל ומים', '{}', 'green_invoice', null, 100.00, 0.00, 0.00, 'it_home_office_area', 'vat_not_deductible', false, null, false, true, '25% לפי הצהרת בעלת העסק (משרד בבית). מע"מ 0%: חשבונית על שם דירת מגורים פרטית (לפי הנחיית בעלת העסק)'),
  ('2cfe1f92-87ae-4d10-b25a-0050bf82f9f8', 3600, 3600, 3500, 'השתלמות וספרות מקצועית', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('3fe708aa-c123-474f-89a3-d65860cc6259', 3620, 3620, 3500, 'פרסום וקידום מכירות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('94ad1f71-3922-4810-a9f4-8556787a5068', 3625, 3625, 3500, 'כיבודים, מתנות, תרומות, קנסות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_composite_split', 'vat_composite_split', true, 'מאגד הוצאות בעלות טיפול מס שונה: אירוח בארץ 0%, כיבוד קל עד 80%, מתנות עד תקרה, תרומות (זיכוי ולא הוצאה), קנסות 0%. מע"מ על אירוח אינו מוכר', false, true, null),
  ('80754fd3-7248-49c4-99d3-1941455493ec', 3625, 3625, 3500, 'מגש ירקות', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_zero', 'vat_not_deductible', false, null, false, true, 'שייך לכיבודים, מתנות, תרומות, קנסות: לא מוכר, 0% במס הכנסה ובמע"מ, לפי הנחיית בעלת העסק (20.10.2026)'),
  ('6540ad52-0a0f-4a6e-843e-b66d2e4f44d7', 3650, 3650, 3500, 'הוצאות דואר ותקשורת', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_composite_split', 'vat_composite_split', true, 'מפוצל לנייד, קו ביתי ואינטרנט (שורות משנה). דואר ושאר ההוצאות לפי מהות', false, true, null),
  ('fc5bb40d-bfda-4fad-be1c-cd328f551030', 3660, 3660, 3500, 'נסיעות לחו"ל', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_per_diem_cap', 'vat_full_if_tax_invoice', false, null, false, true, 'נדרשת תכלית עסקית מתועדת'),
  ('a4cd36b6-21e1-420f-a1dc-c90aaf93a8c7', 3680, 3680, 3500, 'הוצאות משרדיות', '{משרדיות}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'פריט מעל כ-1,200 ש"ח נחשב נכס הוני ונפחת'),
  ('791294a3-9ddc-4043-9fc2-01e054482aad', 3680, 3680, 3500, 'תוכנה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, true, true, 'מוכר רק בשימוש עסקי בלבד'),
  ('28384303-34b8-4e58-968f-af89f7cdbab8', 3685, 3685, 3500, 'בגדי עבודה', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_work_clothing', 'vat_full_if_tax_invoice', false, null, true, true, '80% לפי הנחיית בעלת העסק'),
  ('19cdd23e-0dea-4b5e-8a96-d216799b0ae7', 5010, 5010, 5000, 'לתאגידים בנקאיים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_full', 'vat_full_if_tax_invoice', false, null, false, true, 'ריבית מוכרת כשהכסף מימן פעילות מניבה (סעיף 17(1))'),
  ('0e25e571-9024-460a-ba4c-3158a101a80a', 8040, 8040, 8000, 'רכב בלינינג', '{}', 'green_invoice', null, 100.00, 80.00, 0.00, 'it_zero', 'vat_not_deductible', false, null, false, true, 'ליסינג: לא מוכר, 0% במס הכנסה ובמע"מ, לפי הנחיית בעלת העסק. באחריות בעלת העסק (כלל הרכב הרגיל כולל דמי ליסינג בחישוב השנתי)'),
  ('6040bd66-e9d8-49ad-bfee-873ef159beea', 8060, 8060, 8000, 'רהיטים ואביזרים', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_capital_depreciation', 'vat_full_if_tax_invoice', false, null, false, true, null),
  ('3df46102-bc3a-46aa-9ed4-1595d02b847c', 8090, 8090, 8000, 'רכוש קבוע אחר', '{}', 'green_invoice', null, 100.00, 100.00, 100.00, 'it_capital_depreciation', 'vat_full_if_tax_invoice', false, null, false, true, null)
on conflict do nothing;

insert into public.green_invoice_expense_types (id, account_key, code_6111, sort_code, name_he, aliases, source, parent_id,
  reported_business_pct, reported_income_tax_pct, reported_vat_pct, income_tax_rule_code, vat_rule_code, needs_review, review_reason,
  name_is_ambiguous, active, notes) values
  ('5144b38d-beea-4be7-8891-1ed8553c4cd8', 3515, 3515, 3500, 'ביטוחים - בריאות', '{}', 'alldent_split', 'df8119b6-22c3-449b-8d34-52cd178072e6', null, null, null, 'it_zero', 'vat_not_applicable', true, 'ביטוח בריאות פרטי אינו הוצאה עסקית לפי הבנת המערכת. בעלת העסק בודקת אם יש ניכוי או זיכוי אישי בדוח השנתי', false, true, null),
  ('bcc61243-cc32-469f-8e5b-243d42532efe', 3515, 3515, 3500, 'ביטוחים - מקצועי', '{}', 'alldent_split', 'df8119b6-22c3-449b-8d34-52cd178072e6', null, null, null, 'it_full', 'vat_not_applicable', false, null, false, true, 'אחריות מקצועית, תכולה, חבות מעבידים. ללא מע"מ תשומות (החלטת בעלת העסק, לא אומת מקצועית)'),
  ('08cffa78-bc04-4950-a7e2-3f77bf30d549', 3515, 3515, 3500, 'ביטוחים - רכב', '{}', 'alldent_split', 'df8119b6-22c3-449b-8d34-52cd178072e6', null, null, null, 'it_vehicle_annual', 'vat_not_applicable', false, null, false, true, 'ביטוח חובה, צד ג'' ומקיף. חלק מחישוב הרכב השנתי. ללא מע"מ תשומות (החלטת בעלת העסק, לא אומת מקצועית)'),
  ('e292aabf-9cea-45b6-9495-84213ecec220', 3650, 3650, 3500, 'תקשורת - אינטרנט', '{}', 'alldent_split', '6540ad52-0a0f-4a6e-843e-b66d2e4f44d7', null, null, null, 'it_home_office_area', 'vat_not_deductible', false, null, false, true, 'משרד ביתי: 25% לפי שטח במס הכנסה. מע"מ 0% כי החשבונית על שם דירת מגורים פרטית. במשרד עסקי נפרד: 100% בשניהם'),
  ('614f09d7-a795-46c9-95a5-9ae819c20ff8', 3650, 3650, 3500, 'תקשורת - נייד', '{}', 'alldent_split', '6540ad52-0a0f-4a6e-843e-b66d2e4f44d7', null, null, null, 'it_mobile_50pct', 'vat_two_thirds_business_use', false, null, false, true, '50% מהחשבונית החודשית במס הכנסה. מע"מ: שני שלישים כשהשימוש בעיקרו עסקי, רבע כשהוא בעיקרו פרטי (לפי הנחיית בעלת העסק)'),
  ('1f05bf05-633a-49a6-a4c3-1ed7b1431569', 3650, 3650, 3500, 'תקשורת - קו ביתי', '{}', 'alldent_split', '6540ad52-0a0f-4a6e-843e-b66d2e4f44d7', null, null, null, 'it_zero', 'vat_not_deductible', true, 'קו ביתי אינו מוכר אלא אם הבית הוא עיקר מקום העסק. המשרד של בעלת העסק בבית, באחריות בעלת העסק', false, true, null)
on conflict do nothing;

-- the view: the only place rates are read from (created only if missing — production keeps its own)
do $$
begin
  if to_regclass('public.green_invoice_expense_types_v') is null then
    execute $v$
      create view public.green_invoice_expense_types_v with (security_invoker = true) as
      select d.id, d.code, d.account_key, d.code_6111, d.sort_code, d.name_he, d.aliases, d.source, d.parent_id,
        d.reported_business_pct, d.reported_income_tax_pct, d.reported_vat_pct, d.income_tax_rule_code, d.vat_rule_code,
        d.needs_review, d.review_reason, d.name_is_ambiguous, d.active, d.notes, d.created_at, d.updated_at,
        case when not d.needs_review and ri.rule_status = 'approved' and ri.active and ri.pct_status = 'fixed' then ri.fixed_pct
             else null::numeric end as income_tax_pct,
        ri.pct_status as income_tax_pct_status,
        case when not d.needs_review and rv.rule_status = 'approved' and rv.active and rv.pct_status = 'fixed' then rv.fixed_pct
             else null::numeric end as vat_pct,
        rv.pct_status as vat_pct_status,
        ri.rule_status = 'approved' and rv.rule_status = 'approved' and ri.active and rv.active and not d.needs_review as rules_approved
      from public.green_invoice_expense_types d
      join public.expense_tax_rules ri on ri.rule_code = d.income_tax_rule_code
      join public.expense_tax_rules rv on rv.rule_code = d.vat_rule_code
    $v$;
  end if;
end $$;

-- RLS: read for the signed-in user only; no write policy (writes only via migrations)
alter table public.expense_tax_rules enable row level security;
alter table public.green_invoice_expense_types enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expense_tax_rules' and policyname = 'expense_tax_rules_read') then
    create policy expense_tax_rules_read on public.expense_tax_rules for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'green_invoice_expense_types' and policyname = 'green_invoice_expense_types_read') then
    create policy green_invoice_expense_types_read on public.green_invoice_expense_types for select to authenticated using (true);
  end if;
end $$;

-- hardening (the only change in production): no write privilege beyond RLS, RLS forced like every other table
revoke all on public.expense_tax_rules, public.green_invoice_expense_types, public.green_invoice_expense_types_v from anon, authenticated;
grant select on public.expense_tax_rules, public.green_invoice_expense_types, public.green_invoice_expense_types_v to authenticated;
alter table public.expense_tax_rules force row level security;
alter table public.green_invoice_expense_types force row level security;
