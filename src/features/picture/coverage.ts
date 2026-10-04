// Coverage behind a number (readiness ui-ux §2; 22B §1 "קודם תשובה, אחר כך פירוט, אחר כך ראיה"; chapter 13). Pure.
// A number is never presented as the full picture when a relevant source is missing or does not cover the period.

export type CoverageSource = { kind: string; label: string; files: number; periodStart: string | null; periodEnd: string | null };
export type MetricCoverage = { basis: string[]; missing: string[]; notCovering: string[]; knownUntil: string | null; partial: boolean };

const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

export function metricCoverage(sources: CoverageSource[], month: string | null, kinds: string[]): MetricCoverage {
  const relevant = sources.filter((s) => kinds.includes(s.kind));
  const missing = relevant.filter((s) => s.files === 0).map((s) => s.label);
  if (!month) return { basis: [], missing, notCovering: [], knownUntil: null, partial: true };
  const start = `${month}-01`, end = monthEnd(month);
  const uploaded = relevant.filter((s) => s.files > 0);
  const covers = (s: CoverageSource) => !!s.periodStart && !!s.periodEnd && s.periodStart <= end && s.periodEnd >= start;
  const basis = uploaded.filter(covers);
  const notCovering = uploaded.filter((s) => !covers(s)).map((s) => s.label);
  const knownUntil = basis.length ? basis.map((s) => (s.periodEnd! < end ? s.periodEnd! : end)).sort()[0] : null;
  return { basis: basis.map((s) => s.label), missing, notCovering, knownUntil, partial: missing.length > 0 || notCovering.length > 0 || basis.length === 0 };
}
