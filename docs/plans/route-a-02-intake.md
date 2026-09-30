# Route A — Intake (כל שיטות הקליטה הקנוניות) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **סטטוס:** טיוטה ממתינה לאישור צאלה על DR-A–DR-D (סוף המסמך). אין מימוש migration לפני אישור. ענף migration: `verify/intake-rpc` (ADR-009).

**Goal:** לקלוט מקור בכל שלוש השיטות שהקנון מגדיר — קובץ, טקסט מודבק/מוקלד, דיווח ידני — לכל 20 ערכי `source_type`, עם Raw בלתי משתנה, Evidence ו־Audit אטומיים, ולהציג את המצב במרחב המקור ובבית.

**Architecture:** קובץ וטקסט נשמרים כאובייקט בלתי משתנה ב־`financial-source-files` (sha256 מחושב בשרת). דיווח ידני נשמר ב־`user_reports`. הרישום עצמו (sources + source_files/user_reports + evidence + evidence_links + audit_events) מתבצע בפונקציית Postgres אחת `SECURITY DEFINER` לכל שיטה, כי Evidence ו־Audit הם SELECT-only למשתמשת (18C §53, 18D §30). Next.js Server Actions הם שכבת transport דקה (18D §60). סיווג, חילוץ ועיבוד אינם חלק מהתוכנית הזו (18B §4.3 שלב 6: "אין חילוץ בתוך request ההעלאה").

**Tech Stack:** Next.js 16 Server Actions, Supabase (Postgres RPC, Storage, RLS), pgTAP, Vitest, Playwright.

**מקורות:** docs/implementation/route-a-02-intake-methods-map.md (טבלת 43 ההפניות); 18A §6, §13, §40–44, §56; 18B §4; 18C §4–6, §26–27, §48; 18D §9, §15–17, §30–32, §40, §47; 21D §6–9, §53; 22B §69; 22F §10–16.

---

## File Structure

| קובץ | אחריות |
|---|---|
| `supabase/migrations/20260930000021_intake_rpc.sql` (create) | `intake_register_file`, `intake_register_manual_report`, אינדקס idempotency |
| `supabase/tests/021_intake_rpc_test.sql` (create) | pgTAP: הצלחה, idempotency, כפילות sha256, חסימת נתיב זר, user_report=unverified, Audit+Evidence אטומיים |
| `src/features/intake/intake-methods.ts` (קיים, נבנה ב־TDD) | אילו שיטות מותרות לכל source_type |
| `src/features/intake/sha256.ts` (create) + test | חישוב checksum בשרת |
| `src/features/intake/storage-path.ts` (create) + test | `{uid}/{source_id}/{file_id}/original.{ext}` (019 storage) |
| `src/features/intake/actions.ts` (create) | Server Actions: `submitFile`, `submitText`, `submitManualReport` |
| `src/components/interaction/upload-area.tsx` (create) | Upload Area (21D §7): בחירה, גרירה, בחירה בנייד, הדבקת קובץ |
| `src/components/interaction/text-intake.tsx` (create) | Textarea (21A §20) לטקסט מקור |
| `src/components/interaction/manual-report-form.tsx` (create) | Manual Entry Flow (21D §53) |
| `src/components/interaction/upload-result.tsx` (create) | Upload Result (21D §9): נקלט / כפילות אפשרית / לא נתמך / נכשל / ממתין לעיבוד |
| `src/app/(app)/sources/[kind]/page.tsx` (modify) | מחליף את הודעת "מנוע הקליטה מחובר במשימה הבאה" ברכיבים לפי `intakeMethodsFor` |
| `tests/e2e/intake.spec.ts` (create) | E2E לשלוש השיטות |

---

### Task 1: Migration — intake RPC (verify branch)

**Files:** Create `supabase/migrations/20260930000021_intake_rpc.sql`; Test `supabase/tests/021_intake_rpc_test.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
begin;
select plan(9);
-- owner fixture (pattern from 004 test)
select tests.create_supabase_user('owner');
select tests.authenticate_as('owner');

select ok(
  (select public.intake_register_file(
     p_client_request_id => 'req-1', p_source_type => 'bank_statement', p_source_name => 'דוח בנק',
     p_context => 'unknown', p_source_id => '11111111-1111-1111-1111-111111111111',
     p_file_id => '22222222-2222-2222-2222-222222222222',
     p_storage_path => tests.get_supabase_uid('owner')::text || '/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/original.csv',
     p_original_filename => 'bank.csv', p_mime_type => 'text/csv', p_size_bytes => 10,
     p_sha256 => repeat('a', 64), p_correlation_id => gen_random_uuid()) ->> 'status') = 'uploaded',
  'file intake registers source + file');

select is((select count(*) from public.evidence where source_id = '11111111-1111-1111-1111-111111111111')::int, 1, 'evidence written atomically');
select is((select count(*) from public.audit_events where entity_id = '22222222-2222-2222-2222-222222222222')::int, 1, 'audit written atomically');

select is(
  (select public.intake_register_file('req-1', 'bank_statement', 'דוח בנק', 'unknown',
     '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
     tests.get_supabase_uid('owner')::text || '/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/original.csv',
     'bank.csv', 'text/csv', 10, repeat('a', 64), gen_random_uuid()) ->> 'source_id'),
  '11111111-1111-1111-1111-111111111111', 'same client_request_id is idempotent');
select is((select count(*) from public.sources)::int, 1, 'no duplicate source on retry');

select is(
  (select public.intake_register_file('req-2', 'bank_statement', 'דוח בנק', 'unknown',
     '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
     tests.get_supabase_uid('owner')::text || '/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/original.csv',
     'bank-copy.csv', 'text/csv', 10, repeat('a', 64), gen_random_uuid()) ->> 'status'),
  'duplicate', 'same sha256 is marked duplicate, not deleted (18A §44, 18B §4.4)');

select throws_ok(
  $$ select public.intake_register_file('req-3', 'bank_statement', 'x', 'unknown',
     '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
     '00000000-0000-0000-0000-000000000000/55555555-5555-5555-5555-555555555555/66666666-6666-6666-6666-666666666666/original.csv',
     'x.csv', 'text/csv', 1, repeat('b', 64), gen_random_uuid()) $$,
  '42501', null, 'foreign storage path is rejected');

select is(
  (select verification_status from public.user_reports where id = (
     public.intake_register_manual_report('req-4', 'debt', 'יש חוב חדש לספק', 'unknown', gen_random_uuid()) ->> 'user_report_id')::uuid),
  'unverified', 'manual report is stored unverified (18A §56)');

select throws_ok(
  $$ select public.intake_register_file('req-5', 'user_report', 'x', 'unknown',
     gen_random_uuid(), gen_random_uuid(), 'p', 'x.txt', 'text/plain', 1, repeat('c', 64), gen_random_uuid()) $$,
  '22023', null, 'user_report cannot enter as a file');
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails** — `npx supabase test db` → FAIL: function intake_register_file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- 021 intake RPC (18B §4, 18C §48, 18D §9, §17, §30, §47). One atomic, idempotent registration per intake method.
-- SECURITY DEFINER because evidence/audit_events are SELECT-only for the owner; every function checks auth.uid().
create unique index sources_owner_client_request_uidx
  on public.sources (owner_user_id, (metadata_json ->> 'client_request_id'))
  where metadata_json ? 'client_request_id';

create or replace function public.intake_register_file(
  p_client_request_id text, p_source_type text, p_source_name text, p_context text,
  p_source_id uuid, p_file_id uuid, p_storage_path text, p_original_filename text,
  p_mime_type text, p_size_bytes bigint, p_sha256 text, p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_dup uuid;
  v_state text := 'uploaded';
  v_evidence uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_source_type = 'user_report' then raise exception 'VALIDATE_USER_REPORT_NOT_FILE' using errcode = '22023'; end if;
  if split_part(p_storage_path, '/', 1) <> v_uid::text
     or p_storage_path not like v_uid::text || '/' || p_source_id::text || '/' || p_file_id::text || '/original.%' then
    raise exception 'AUTH_FORBIDDEN_PATH' using errcode = '42501';
  end if;

  select id into v_existing from public.sources
   where owner_user_id = v_uid and metadata_json ->> 'client_request_id' = p_client_request_id;
  if v_existing is not null then
    return (select jsonb_build_object('source_id', s.id, 'file_id', f.id, 'status', f.pipeline_state)
              from public.sources s join public.source_files f on f.source_id = s.id where s.id = v_existing limit 1);
  end if;

  select id into v_dup from public.source_files
   where owner_user_id = v_uid and sha256 = p_sha256 and archived_at is null order by uploaded_at limit 1;
  if v_dup is not null then v_state := 'duplicate'; end if;

  insert into public.sources (id, owner_user_id, source_type, source_name, context, metadata_json)
  values (p_source_id, v_uid, p_source_type, p_source_name, p_context,
          jsonb_build_object('client_request_id', p_client_request_id, 'intake_method', 'file_or_text'));
  insert into public.source_files (id, owner_user_id, source_id, storage_bucket, storage_path, original_filename,
                                   mime_type, size_bytes, sha256, pipeline_state, duplicate_of_file_id)
  values (p_file_id, v_uid, p_source_id, 'financial-source-files', p_storage_path, p_original_filename,
          p_mime_type, p_size_bytes, p_sha256, v_state, v_dup);
  insert into public.evidence (owner_user_id, evidence_type, source_id, quoted_value, capture_method, checksum)
  values (v_uid, 'source_document', p_source_id,
          jsonb_build_object('original_filename', p_original_filename, 'mime_type', p_mime_type), 'import', p_sha256)
  returning id into v_evidence;
  insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
  values (v_uid, v_evidence, 'source_file', p_file_id, 'supports', 'direct', 'user');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', 'SOURCE_UPLOADED', 'source_file', p_file_id,
          jsonb_build_object('source_type', p_source_type, 'pipeline_state', v_state, 'sha256', p_sha256), p_correlation_id);
  return jsonb_build_object('source_id', p_source_id, 'file_id', p_file_id, 'status', v_state, 'duplicate_of_file_id', v_dup);
end $$;

create or replace function public.intake_register_manual_report(
  p_client_request_id text, p_subject_type text, p_statement text, p_context text, p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_source uuid;
  v_report uuid;
  v_evidence uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(btrim(p_statement), '') = '' then raise exception 'VALIDATE_REQUIRED_FIELD' using errcode = '22023'; end if;
  select id into v_source from public.sources
   where owner_user_id = v_uid and metadata_json ->> 'client_request_id' = p_client_request_id;
  if v_source is not null then
    return (select jsonb_build_object('source_id', v_source, 'user_report_id', r.id) from public.user_reports r where r.source_id = v_source limit 1);
  end if;
  insert into public.sources (owner_user_id, source_type, source_name, context, metadata_json)
  values (v_uid, 'user_report', 'דיווח ידני', p_context,
          jsonb_build_object('client_request_id', p_client_request_id, 'intake_method', 'manual_report'))
  returning id into v_source;
  insert into public.user_reports (owner_user_id, source_id, subject_type, statement)
  values (v_uid, v_source, p_subject_type, p_statement) returning id into v_report;
  insert into public.evidence (owner_user_id, evidence_type, source_id, quoted_value, capture_method)
  values (v_uid, 'user_report', v_source, to_jsonb(p_statement), 'manual') returning id into v_evidence;
  insert into public.evidence_links (owner_user_id, evidence_id, entity_type, entity_id, relationship_type, weight, created_by_type)
  values (v_uid, v_evidence, 'user_report', v_report, 'supports', 'direct', 'user');
  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'user', 'USER_REPORT_RECORDED', 'user_report', v_report,
          jsonb_build_object('subject_type', p_subject_type), p_correlation_id);
  return jsonb_build_object('source_id', v_source, 'user_report_id', v_report);
end $$;

revoke all on function public.intake_register_file(text, text, text, text, uuid, uuid, text, text, text, bigint, text, uuid) from public, anon;
revoke all on function public.intake_register_manual_report(text, text, text, text, uuid) from public, anon;
grant execute on function public.intake_register_file(text, text, text, text, uuid, uuid, text, text, text, bigint, text, uuid) to authenticated;
grant execute on function public.intake_register_manual_report(text, text, text, text, uuid) to authenticated;
```

`p_subject_type` validation is added once DR-C is approved (check against the approved list).

- [ ] **Step 4: Run** — `npx supabase db reset && npx supabase test db` → 021 PASS, 001–099 still PASS.
- [ ] **Step 5: Commit on `verify/intake-rpc`**, push, wait for green CI, fast-forward `main` (ADR-009).

### Task 2: sha256 + storage path (TDD)

**Files:** `src/features/intake/sha256.ts`, `sha256.test.ts`, `storage-path.ts`, `storage-path.test.ts`

- [ ] **Step 1: failing tests**

```ts
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";
import { sourceObjectPath, extensionFor } from "./storage-path";

describe("sha256Hex", () => {
  it("hashes bytes to lowercase hex", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
describe("sourceObjectPath", () => {
  it("follows 019 storage layout and never uses the original filename", () => {
    expect(sourceObjectPath("u", "s", "f", "דוח מרץ.PDF")).toBe("u/s/f/original.pdf");
  });
  it("text intake is stored as .txt", () => {
    expect(extensionFor("", "text/plain")).toBe("txt");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/features/intake` → FAIL (modules missing).
- [ ] **Step 3: implement**

```ts
// sha256.ts — server-side checksum (18A §40, 18D §17)
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

```ts
// storage-path.ts — {owner_uid}/{source_id}/{file_id}/original.{ext} (migration 019); filename is metadata only (18D §31)
export function extensionFor(filename: string, mime: string): string {
  if (mime === "text/plain" && !filename) return "txt";
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return m ? m[1].toLowerCase() : "bin";
}
export function sourceObjectPath(uid: string, sourceId: string, fileId: string, filename: string, mime = ""): string {
  return `${uid}/${sourceId}/${fileId}/original.${extensionFor(filename, mime)}`;
}
```

- [ ] **Step 4:** tests PASS. **Step 5:** commit `feat(intake): server checksum and storage path`.

### Task 3: Server Actions (thin transport)

**Files:** `src/features/intake/actions.ts`

- [ ] **Step 1:** implement three actions. Each: `getClaims()` (auth), validate `source_type` against `intakeMethodsFor` (method must be allowed), size limit (DR-B), compute sha256 server-side, upload with the **user session** (Storage insert policy, no service role), call the RPC with `client_request_id` from the form and `correlation_id` from `x-correlation-id`, map errors to the Hebrew error contract (`src/lib/errors.ts`), `revalidatePath('/')` and `revalidatePath('/sources')`.
- [ ] **Step 2:** `submitText` builds `new TextEncoder().encode(text)`, mime `text/plain`, `original_filename` = `טקסט-מודבק-{ISO date}.txt`, allowed only where `intakeMethodsFor(type)` includes `text`.
- [ ] **Step 3:** `submitManualReport` → `intake_register_manual_report`; never writes storage.
- [ ] **Step 4:** typecheck + lint. **Step 5:** commit.

### Task 4: Interaction components (21D) and source workspace

- [ ] Upload Area (21D §7–§9): `<input type="file" multiple>` + drop zone + `onPaste` capturing `clipboardData.files`; shows files before submit; per-file result (Upload Queue §8); failure of one file does not cancel others.
- [ ] Text intake: Textarea with label "טקסט המקור" (21A §16, §20), helper text that the text is kept unchanged as a source.
- [ ] Manual report form (21D §53): subject (DR-C list) + statement; result copy "נשמר כדיווח ידני — טרם אומת" (22B §86, 21B §92.10). No "נשמר" before backend confirmation (21A §67).
- [ ] Upload Result (21D §9): "הקובץ נקלט" ≠ "עובד" (22F §13); duplicate → "זוהה עותק זהה לקובץ שכבר נקלט; הוא נשמר ומסומן ככפילות".
- [ ] Source workspace renders only the methods returned by `intakeMethodsFor`. Commit.

### Task 5: E2E + Visual QA

- [ ] `tests/e2e/intake.spec.ts`: upload CSV to bank → appears with "ממתין לעיבוד"; upload same file again → duplicate result; manual report → "טרם אומת"; paste text in correspondence (new "מקורות נוספים" entry, DR-D) → stored; no horizontal scroll at 320.
- [ ] Screenshots desktop + mobile 375/320; design-review + ux-heuristics skills per the Skills map (stage 10).
- [ ] verification-before-completion, CHANGELOG entry, checkpoint.

---

## Decisions Required (ריכוז אחד — 23D §7)

- **DR-A — קול וקישורים:** אינם מוגדרים ב־18–23. המלצה: לא לממש; לרשום כ־Gap פתוח עד החלטה.
- **DR-B — גודל קובץ:** Server Action ב־Vercel מוגבל לכ־4.5MB לבקשה. אפשרויות: (1) להתחיל ב־4MB ולסמן Known limitation; (2) Signed Upload URL ישירות ל־Storage + אימות sha256 בשרת לאחר מכן. המלצה: (2), כי דוחות PDF עשויים לעבור 4MB.
- **DR-C — subject_type של דיווח ידני:** המלצה: שמות הישויות הקנוניות של 18A + `unknown` (ראו מפת השיטות §4).
- **DR-D — היכן נכנסים 15 סוגי המקור שאינם חמשת מרחבי מסלול A:** המלצה: כניסה אחת "מקור נוסף" בתוך "חשבונות ומקורות" (22A §16 כבר מונה מקורות אלה שם) עם בחירת סוג מתוך ה־glossary, במקום 15 מרחבים חדשים (22A §21, §76–77).

## Self-Review

- כיסוי: שלוש השיטות (M1–M3) → Tasks 1–4; כל 20 הסוגים → `intake-methods.ts` (בדיקה מול glossary) + DR-D; Deferred מתועדים בקוד ובמפה; Gaps → DR-A.
- אין placeholders חוץ מתלות מפורשת באישור DR-C (אימות subject_type).
- שמות עקביים: `intake_register_file`, `intake_register_manual_report`, `intakeMethodsFor`, `sourceObjectPath`, `sha256Hex`.
