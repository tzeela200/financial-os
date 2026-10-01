import { notFound } from "next/navigation";
import { findSource } from "@/features/sources/route-a-sources";
import { getSourcesOverview } from "@/features/sources/sources-overview";
import { getSourceFiles } from "@/features/sources/source-files";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import { BackLink } from "@/components/workspace/back-link";
import { UploadArea } from "@/components/interaction/upload-area";
import { SourceFileList } from "@/components/business/source-file-list";
import { ReprocessSourceButton } from "@/components/interaction/reprocess-source-button";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jerusalem" });

// Source workspace inside "חשבונות ומקורות" (22B B5 §68 Source Detail + §69 upload from the source context; CL-0028).
// 21C §4 order: back → header → trust context → primary action (upload) → content (received files).
export default async function SourceWorkspace({ params }: PageProps<"/sources/[kind]">) {
  const { kind } = await params;
  const source = findSource(kind);
  if (!source) notFound();
  const [overview, files] = await Promise.all([
    getSourcesOverview().then((all) => all.find((o) => o.kind === kind)),
    getSourceFiles(source.sourceTypes),
  ]);

  return (
    <div className="ws">
      <BackLink href="/sources" label="חזרה לחשבונות ומקורות" />
      <header className="ws-header">
        <div>
          <p className="ws-eyebrow">חשבונות ומקורות</p>
          <h1 className="ws-title">{source.label}</h1>
          <p className="ws-sub">{source.description}</p>
        </div>
      </header>

      <section className="trust-bar" aria-label="סרגל אמינות">
        <span className="trust-item"><span className="trust-label">כיסוי</span><CoverageIndicator status={overview?.coverage ?? "unknown"} /></span>
        <span className="trust-item"><span className="trust-label">קבצים</span><span className="num">{overview?.filesCount ?? 0}</span></span>
        <span className="trust-item">
          <span className="trust-label">קליטה אחרונה</span>
          {overview?.lastAcquiredAt ? <span className="num">{dateFmt.format(new Date(overview.lastAcquiredAt))}</span> : "עדיין לא נקלט"}
        </span>
      </section>

      <section className="card intake-card" aria-labelledby="upload-title">
        <h2 id="upload-title" className="card-title">העלאת קבצים</h2>
        <p className="card-sub">הקבצים נשמרים כפי שהם, בלי שינוי, ומסומנים כמקור מסוג {source.label}.</p>
        <UploadArea sourceType={source.sourceTypes[0]} sourceLabel={source.label} />
      </section>

      <section aria-labelledby="files-title">
        <h2 id="files-title" className="section-title">קבצים שנקלטו</h2>
        <SourceFileList files={files} emptyText="עדיין לא נקלטו קבצים למקור הזה. הקבצים שתעלי יופיעו כאן עם מצב העיבוד שלהם." />
        {files.some((f) => f.state === "needs_review" || f.state === "failed") ? <ReprocessSourceButton sourceTypes={source.sourceTypes} /> : null}
      </section>
    </div>
  );
}
