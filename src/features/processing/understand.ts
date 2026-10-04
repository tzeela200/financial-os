import { createHash } from "node:crypto";
import { headerSignature, type Adapter } from "./adapter";
import { extractStructured, type Extraction } from "./extract";
import { familyForSource, sideForSource, FAMILIES, type Family } from "./families";
import { classifyDocument, type Classification } from "./classify-document";
import { normalizeRows, type NormalizedRow } from "./normalize-step";
import { understandTable, headerCandidates, SEMANTIC_ENGINE_VERSION, type ColumnDecision, type Question } from "./semantic";
import { pdfFacts, pdfTables, type PdfFact } from "./pdf-tables";
import { parseCalStatement, type CalStatement } from "./documents/cal-statement";
import { calArtifacts, CAL_PSEUDO_ADAPTER } from "./documents/cal-pipeline";
import type { CheckResult } from "./validate";
import type { ReadSheet, SourceRead } from "./readers-types";
import { routeOf, type ProcessingRoute } from "./route";

// Document understanding (chapter 5 §1–§5, §20–§21; task 01.10 "File → Reader → Classification → Family → Source →
// Layout/Section/Table → Semantic Extraction → Normalization → Validation"). Pure and deterministic, so the same code runs
// in the job runner and in the reference-corpus acceptance run. Order of precedence for each table:
//   1. a recognised document adapter (CAL statement);  2. a mapping Tzeela approved (tolerant match);
//   3. the semantic engine;  4. only what is still ambiguous → a mapping question.

export type TableUnderstanding = { sheet: string; headerRow: number | null; via: "document_adapter" | "approved_mapping" | "semantic" | "unresolved" | "not_understood"; adapter: Adapter | null; /** the semantic proposal, kept also when questions remain (the mapping answers complete it) */ proposed?: Adapter | null; decisions: ColumnDecision[]; questions: Question[]; assumptions: string[]; dataRows: number };
export type Understanding = {
  family: Family | null;
  sheets: ReadSheet[];
  extraction: Extraction;
  tables: TableUnderstanding[];
  normalized: NormalizedRow[];
  adapterFor: Map<number, Adapter>; // normalized row index → the adapter that produced it (sign semantics)
  primaryAdapter: Adapter | null;
  extraChecks: CheckResult[];
  statement: CalStatement | null;
  facts: PdfFact[];
  factsAsOf: string | null;
  bankBalance: { minor: string; currency: string; asOf: string; line: number; label: string; value: string } | null;
  needsMapping: boolean;
  /** subtype, reader, OCR use, skill rule sets applied / not applied (chapter 6; chapter 5 §3) */
  route: ProcessingRoute | null;
  /** the family identified from the content (chapter 5 §2; MASTER_SPEC §6.1; ADR-008 v2) — the upload source is a hint */
  classification: Classification | null;
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export function understandDocument(read: Extract<SourceRead, { ok: true }>, sourceType: string, approved: Adapter[]): Understanding {
  const hintFamily = familyForSource(sourceType);
  let family = hintFamily;
  const side = sideForSource(sourceType);
  const empty: Extraction = { tables: [], records: [], adapterId: null, needsMapping: false };
  if (!family) return { family, sheets: read.sheets, extraction: extractStructured(read.sheets.map((s) => ({ ...s, raw: true })), []), tables: [], normalized: [], adapterFor: new Map(), primaryAdapter: null, extraChecks: [], statement: null, facts: [], factsAsOf: null, bankBalance: null, needsMapping: false, route: null, classification: null };

  // 1. document adapter (precision layer)
  if (read.format === "pdf" && sourceType === "credit_card_statement") {
    const st = parseCalStatement(read.sheets[0]);
    if (st) {
      const cal = calArtifacts(read.sheets[0], st);
      const route = routeOf(family, { format: read.format, rows: cal.normalized.length, tables: 1, facts: 0, factsAsOf: null, documentAdapter: true, side });
      return { route, family, sheets: read.sheets, extraction: cal.extraction, tables: [{ sheet: read.sheets[0].name, headerRow: null, via: "document_adapter", adapter: CAL_PSEUDO_ADAPTER, decisions: [], questions: [], assumptions: [], dataRows: cal.normalized.length }],
        normalized: cal.normalized, adapterFor: new Map(cal.normalized.map((_, i) => [i, CAL_PSEUDO_ADAPTER])), primaryAdapter: CAL_PSEUDO_ADAPTER, extraChecks: cal.checks, statement: st, facts: [], factsAsOf: null, bankBalance: null, needsMapping: false,
        classification: { family: family.code, supported: true, hint: family.code, mismatch: false, basis: ["מבנה דף חיוב של חברת כרטיסים"], statedDirection: null } };
    }
  }

  // 2. layout: PDF → raw lines (kept as evidence) + the tables understood from the layout + document facts
  let sheets: ReadSheet[] = read.sheets;
  let documentCurrency: string | null = null;
  let facts: PdfFact[] = [];
  let factsAsOf: string | null = null;
  let heading = read.sheets.map((s) => `${s.name} ${s.title ?? ""}`).join(" ");
  let cardStatement = false;
  if (read.format === "pdf") {
    const raw = read.sheets[0];
    const layout = pdfTables(raw);
    const tables = layout.map((t) => t.sheet);
    // the heading area: the lines above the first table (or the first lines of the document) and the section titles
    const firstTable = layout.length ? layout[0].startLine - 1 : Math.min(raw.rows.length, 15);
    heading = [...raw.rows.slice(0, Math.max(1, firstTable)).map((r) => r.join(" ")), ...tables.map((t) => t.title ?? "")].join(" ");
    cardStatement = !!parseCalStatement(raw);
    const f = pdfFacts(raw);
    facts = f.facts; factsAsOf = f.asOf;
    sheets = [{ ...raw, name: "מסמך", raw: true }, ...tables];
    // the one currency the document states anywhere (e.g. "₪" on its summary page) — none or several: no default
    const text = raw.rows.map((r) => r.join(" ")).join(" ");
    const found = new Set<string>();
    if (/₪|ש"ח|ש״ח|שקל/.test(text)) found.add("ILS");
    if (/\$|דולר|USD/.test(text)) found.add("USD");
    if (/€|אירו|יורו|EUR/.test(text)) found.add("EUR");
    if (/£|GBP|ליש"ט/.test(text)) found.add("GBP");
    documentCurrency = found.size === 1 ? [...found][0] : null;
  }

  // 3. classification from the content (chapter 5 §2–§4): column concepts, table structure, the document's own heading
  const first = extractStructured(sheets, approved);
  const probe = first.tables.filter((t) => t.headerRow).map((t) => {
    const sheet = sheets.find((x) => x.name === t.sheet)!;
    if (read.format !== "pdf") heading += " " + sheet.rows.slice(0, (t.headerRow ?? 1) - 1).map((r) => r.join(" ")).join(" ");
    const rows = first.records.filter((r) => r.sheet === t.sheet && r.kind === "data").map((r) => r.cells);
    // when a header says nothing (e.g. a web table exported with its markup names), the values speak: dates / amounts
    const byValues = (i: number) => {
      const vs = rows.map((r) => (r[i] ?? "").trim()).filter(Boolean);
      if (vs.length < 2) return null;
      const share = (re: RegExp) => vs.filter((v) => re.test(v)).length / vs.length;
      if (share(/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/) >= 0.9) return "transaction_date";
      if (share(/^-?\s?[₪$€]?\s?-?[\d,]+\.\d{2}\s?[₪$€]?$/) >= 0.9) return "amount";
      return null;
    };
    return { headers: t.headers, concepts: t.headers.map((h, i) => headerCandidates(h)[0]?.concept ?? byValues(i)), rows };
  });
  const classification = classifyDocument({ hint: hintFamily, tables: probe, heading, facts, cardStatement });
  if (classification.family && classification.family !== family.code) family = FAMILIES[classification.family];
  if (!classification.supported) {
    // identified, no reading path yet: kept as evidence (every line), never read as another family, no question
    return { family, sheets, extraction: extractStructured(sheets.map((x) => ({ ...x, raw: true })), []), tables: [], normalized: [], adapterFor: new Map(), primaryAdapter: null, extraChecks: [], statement: null, facts, factsAsOf, bankBalance: null, needsMapping: false,
      route: routeOf(family, { format: read.format, rows: 0, tables: 0, facts: facts.length, factsAsOf, documentAdapter: false, side }), classification };
  }

  // 4. approved mappings first, then the semantic engine for every table that is still not understood
  const semanticAdapters: Adapter[] = [];
  const tables: TableUnderstanding[] = [];
  const extraChecks: CheckResult[] = [];
  for (const t of first.tables) {
    const sheet = sheets.find((s) => s.name === t.sheet)!;
    const dataRows = first.records.filter((r) => r.sheet === t.sheet && r.kind === "data");
    if (t.adapter) { tables.push({ sheet: t.sheet, headerRow: t.headerRow, via: "approved_mapping", adapter: t.adapter, decisions: [], questions: [], assumptions: [], dataRows: dataRows.length }); continue; }
    if (!t.headerRow || !dataRows.length) continue;
    const u = understandTable(t.headers, dataRows.map((r) => r.cells), family, { side, sheetName: sheet.name, headerText: sheet.rows.slice(0, t.headerRow - 1).map((r) => r.join(" ")).join(" "), sectionTitle: sheet.title, documentCurrency, statedDirection: classification.statedDirection });
    // no column carries a known meaning: kept as raw evidence and sent to review — never presented as understood
    if (!u.decisions.some((d) => d.concept)) {
      tables.push({ sheet: t.sheet, headerRow: t.headerRow, via: "not_understood", adapter: null, proposed: null, decisions: u.decisions, questions: [], assumptions: [], dataRows: dataRows.length });
      extraChecks.push({ code: "table_not_understood", status: "failed", detail: `${t.sheet || "table"}: ${t.headers.filter(Boolean).join(", ")}`, rows: [] });
      continue;
    }
    const signature = headerSignature(t.headers);
    const adapter: Adapter = { ...u.adapter, id: `semantic:${hash(`${sourceType}|${signature}`)}`, version: SEMANTIC_ENGINE_VERSION, sourceType, signature, headerRow: t.headerRow };
    tables.push({ sheet: t.sheet, headerRow: t.headerRow, via: u.questions.length ? "unresolved" : "semantic", adapter: u.questions.length ? null : adapter, proposed: adapter, decisions: u.decisions, questions: u.questions, assumptions: [...(sheet.assumptions ?? []), ...u.assumptions], dataRows: dataRows.length });
    if (!u.questions.length) semanticAdapters.push(adapter);
  }

  // 5. extraction with the understood columns; normalization per table with its own adapter
  const extraction = semanticAdapters.length ? extractStructured(sheets, [...approved, ...semanticAdapters]) : first;
  const normalized: NormalizedRow[] = [];
  const adapterFor = new Map<number, Adapter>();
  for (const t of extraction.tables) {
    const adapter = t.adapter ?? null;
    if (!adapter) continue;
    for (const n of normalizeRows(extraction.records.filter((r) => r.sheet === t.sheet), adapter)) { adapterFor.set(normalized.length, adapter); normalized.push(n); }
  }
  const resolved = tables.filter((t) => t.adapter);
  // bank documents that state the current-account balance as of a date (chapter 5 §6; chapter 13 "reported balance")
  let bankBalance: Understanding["bankBalance"] = null;
  if (family.code === "bank_documents") {
    // the current-account balance as stated by the document, with its date: the line's own date, else the document's
    const f = facts.find((x) => /^עו"?ש$|^עו״ש$|^יתרת עו"?ש|^יתרת עו״ש|^יתרה בחשבון|^יתרה נוכחית/.test(x.label.trim()) && x.currency && (x.asOf || factsAsOf));
    if (f) bankBalance = { minor: f.minor, currency: f.currency!, asOf: (f.asOf ?? factsAsOf)!, line: f.line, label: f.label, value: f.value };
  }
  return {
    family, sheets, extraction: extraction ?? empty, tables, normalized, adapterFor,
    primaryAdapter: resolved.sort((a, b) => b.dataRows - a.dataRows)[0]?.adapter ?? null,
    extraChecks, statement: null, facts, factsAsOf, bankBalance,
    needsMapping: tables.some((t) => t.via === "unresolved"),
    route: routeOf(family, { format: read.format, rows: normalized.length, tables: tables.filter((t) => t.via !== "not_understood").length, facts: facts.length, factsAsOf, documentAdapter: false, side }),
    classification,
  };
}
