// Home Attention Area (22A §72, 21C §57): a small number of real items from backend state — never AI-invented tasks.
// Order follows 23A §123 priorities: failures and decisions first, then processing, then missing sources.
import { routeAStep, type PipelineSummary } from "@/features/sources/pipeline-summary";

export type AttentionTone = "error" | "warning" | "info" | "neutral";
export type AttentionItem = { id: string; tone: AttentionTone; text: string; href: string | null };
export type AttentionInput = {
  sources: { kind: string; label: string; files: PipelineSummary }[];
  openReviewItems: number;
  openContradictions: number;
};

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const failed: AttentionItem[] = [];
  const review: AttentionItem[] = [];
  const processing: AttentionItem[] = [];
  const missing: AttentionItem[] = [];

  for (const s of input.sources) {
    const href = `/sources/${s.kind}`;
    if (s.files.failed > 0) failed.push({ id: `failed-${s.kind}`, tone: "error", text: `${s.label}: ${s.files.failed} קבצים נכשלו בעיבוד`, href });
    if (s.files.attention > 0) failed.push({ id: `attention-${s.kind}`, tone: "warning", text: `${s.label}: ${s.files.attention} קבצים דורשים בדיקה`, href });
    if (s.files.processing > 0) processing.push({ id: `processing-${s.kind}`, tone: "info", text: `${s.label}: ${s.files.processing} קבצים ממתינים לעיבוד`, href });
    if (routeAStep(s.files) === "not_uploaded") missing.push({ id: `missing-${s.kind}`, tone: "neutral", text: `חסר מקור: ${s.label}`, href });
  }
  // Review Queue workspace (22C C4) is not built yet, so these items carry no link.
  if (input.openContradictions > 0) review.push({ id: "contradictions", tone: "warning", text: `${input.openContradictions} סתירות פתוחות בין מקורות`, href: null });
  if (input.openReviewItems > 0) review.push({ id: "review", tone: "warning", text: `${input.openReviewItems} פריטים דורשים בדיקה`, href: null });

  // Nothing received yet: one item instead of repeating every source (the source cards already show each one).
  const missingItems = missing.length > 1 && missing.length === input.sources.length
    ? [{ id: "missing-all", tone: "neutral" as const, text: "עדיין לא נקלט אף מקור של מסלול A", href: "/sources" }]
    : missing;
  return [...failed, ...review, ...processing, ...missingItems];
}
