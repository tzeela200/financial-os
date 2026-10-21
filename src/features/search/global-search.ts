import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Money } from "@/features/picture/classify";

// Global search (19B §22; 19D §16; owner decision D-028): one query over everything the system holds — movements,
// business expenses and income (supplier / customer and document number read from their evidence, the expense type
// from the dictionary), files and sources. Read through the user's session and RLS only; results grouped by subject,
// each opening its record. Nothing is computed or changed here.
export type SearchHit = { id: string; href: string; title: string; meta: string | null; date: string | null; amount: Money | null; direction?: "debit" | "credit" };
export type SearchGroup = { key: "transactions" | "expenses" | "income" | "files" | "sources"; label: string; hits: SearchHit[]; more: string | null };

const LIMIT = 8;
/** PostgREST filter values: drop characters that would break an or() list or act as wildcards */
const clean = (q: string) => q.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();

export async function searchAll(raw: string): Promise<SearchGroup[]> {
  const q = clean(raw);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const like = `%${q}%`;
  const amount = /^\d+(\.\d{1,2})?$/.test(q) ? Math.round(Number(q) * 100) : null;
  const back = encodeURIComponent(`/search?q=${encodeURIComponent(raw)}`);

  const [tx, ev, types, files, sources] = await Promise.all([
    supabase.from("transactions").select("id, transaction_date, description_original, reference, direction, amount_minor, currency_code, accounts!inner(account_name)")
      .is("archived_at", null)
      .or([`description_original.ilike.${like}`, `reference.ilike.${like}`, ...(amount !== null ? [`amount_minor.eq.${amount}`] : [])].join(","))
      .order("transaction_date", { ascending: false }).limit(LIMIT + 1),
    supabase.from("evidence").select("id, quoted_value").eq("evidence_type", "source_record")
      .or(`quoted_value->>party.ilike.${like},quoted_value->>document_number.ilike.${like}`).limit(200),
    supabase.from("green_invoice_expense_types").select("code, name_he").ilike("name_he", like),
    supabase.from("source_files").select("id, original_filename, uploaded_at, pipeline_state").is("archived_at", null).ilike("original_filename", like).order("uploaded_at", { ascending: false }).limit(LIMIT + 1),
    supabase.from("sources").select("id, source_name, source_type").ilike("source_name", like).limit(LIMIT + 1),
  ]);

  // business documents: by supplier / customer / document number (evidence), by expense type, or by exact amount
  const partyOf = new Map<string, string>();
  const evIds = ((ev.data ?? []) as { id: string; quoted_value: { party?: string; document_number?: string } | null }[]).map((e) => { partyOf.set(e.id, e.quoted_value?.party ?? ""); return e.id; });
  const links = evIds.length
    ? ((await supabase.from("evidence_links").select("evidence_id, entity_type, entity_id").in("entity_type", ["expense", "income"]).in("evidence_id", evIds)).data ?? []) as { evidence_id: string; entity_type: string; entity_id: string }[]
    : [];
  const typeCodes = ((types.data ?? []) as { code: string }[]).map((t) => t.code);
  const ids = (k: string) => [...new Set(links.filter((l) => l.entity_type === k).map((l) => l.entity_id))];
  const docFilter = (k: "expense" | "income", byType: boolean) => [
    ids(k).length ? `id.in.(${ids(k).join(",")})` : null,
    byType && typeCodes.length ? `category_code.in.(${typeCodes.map((c) => `"${c}"`).join(",")})` : null,
    amount !== null ? `gross_minor.eq.${amount}` : null,
  ].filter(Boolean).join(",");
  const expFilter = docFilter("expense", true), incFilter = docFilter("income", false);
  const [exp, inc, dict] = await Promise.all([
    expFilter ? supabase.from("expenses").select("id, expense_date, gross_minor, currency_code, category_code").is("archived_at", null).or(expFilter).order("expense_date", { ascending: false }).limit(LIMIT + 1) : Promise.resolve({ data: [] }),
    incFilter ? supabase.from("income").select("id, event_date, gross_minor, currency_code").is("archived_at", null).or(incFilter).order("event_date", { ascending: false }).limit(LIMIT + 1) : Promise.resolve({ data: [] }),
    supabase.from("green_invoice_expense_types").select("code, name_he"),
  ]);
  const typeName = new Map(((dict.data ?? []) as { code: string; name_he: string }[]).map((d) => [d.code, d.name_he]));
  // the party of a document: from any evidence of it that this search read (otherwise shown without a name)
  const partyFor = (id: string) => { const l = links.find((x) => x.entity_id === id); return l ? partyOf.get(l.evidence_id) || null : null; };

  const cut = <T,>(rows: T[]) => ({ rows: rows.slice(0, LIMIT), more: rows.length > LIMIT });
  const t = cut((tx.data ?? []) as unknown as { id: string; transaction_date: string; description_original: string | null; reference: string | null; direction: "debit" | "credit"; amount_minor: number; currency_code: string; accounts: { account_name: string } }[]);
  const e = cut((exp.data ?? []) as { id: string; expense_date: string | null; gross_minor: number | null; currency_code: string | null; category_code: string | null }[]);
  const i = cut((inc.data ?? []) as { id: string; event_date: string | null; gross_minor: number | null; currency_code: string | null }[]);
  const f = cut((files.data ?? []) as { id: string; original_filename: string; uploaded_at: string; pipeline_state: string }[]);
  const s = cut((sources.data ?? []) as { id: string; source_name: string; source_type: string }[]);
  const money = (minor: number | null, cur: string | null): Money | null => (minor === null || !cur ? null : { minor: String(minor), currency: cur });

  return [
    { key: "transactions" as const, label: "תנועות", more: t.more ? `/transactions?q=${encodeURIComponent(q)}` : null,
      hits: t.rows.map((r) => ({ id: r.id, href: `/records/transaction/${r.id}?back=${back}`, title: r.description_original ?? "ללא תיאור", meta: [r.accounts.account_name, r.reference].filter(Boolean).join(" · "), date: r.transaction_date, amount: money(r.amount_minor, r.currency_code), direction: r.direction })) },
    { key: "expenses" as const, label: "הוצאות העסק", more: null,
      hits: e.rows.map((r) => ({ id: r.id, href: `/records/expense/${r.id}?back=${back}`, title: partyFor(r.id) ?? "הוצאה לפי מסמך", meta: r.category_code ? typeName.get(r.category_code) ?? null : "לא מסווג", date: r.expense_date, amount: money(r.gross_minor, r.currency_code) })) },
    { key: "income" as const, label: "הכנסות העסק", more: null,
      hits: i.rows.map((r) => ({ id: r.id, href: `/records/income/${r.id}?back=${back}`, title: partyFor(r.id) ?? "הכנסה לפי מסמך", meta: null, date: r.event_date, amount: money(r.gross_minor, r.currency_code) })) },
    { key: "files" as const, label: "קבצים", more: null,
      hits: f.rows.map((r) => ({ id: r.id, href: `/sources/files/${r.id}`, title: r.original_filename, meta: null, date: r.uploaded_at.slice(0, 10), amount: null })) },
    { key: "sources" as const, label: "מקורות", more: null,
      hits: s.rows.map((r) => ({ id: r.id, href: "/sources", title: r.source_name, meta: null, date: null, amount: null })) },
  ].filter((g) => g.hits.length);
}
