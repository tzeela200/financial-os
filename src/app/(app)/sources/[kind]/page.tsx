import Link from "next/link";
import { notFound } from "next/navigation";
import { findSource } from "@/features/sources/route-a-sources";
import { getSourcesOverview } from "@/features/sources/sources-overview";
import { CoverageIndicator } from "@/components/ui/coverage-indicator";
import "@/components/ui/ui.css";

export const dynamic = "force-dynamic";

// Source workspace inside "חשבונות ומקורות" (B5 §68 Source Detail + §69 upload from the source context; CL-0028).
export default async function SourceWorkspace({ params }: PageProps<"/sources/[kind]">) {
  const { kind } = await params;
  const source = findSource(kind);
  if (!source) notFound();
  const overview = (await getSourcesOverview()).find((o) => o.kind === kind);

  return (
    <div className="ws">
      <div className="ws-header">
        <div>
          <p className="ws-sub"><Link href="/sources">חשבונות ומקורות</Link></p>
          <h1 className="ws-title">{source.label}</h1>
          <p className="ws-sub">{source.description}</p>
        </div>
      </div>

      <div className="trust-bar" aria-label="סרגל אמינות">
        <span className="trust-item"><CoverageIndicator status="unknown" /></span>
        <span className="trust-item">מקורות: <span className="num">{overview?.sourcesCount ?? 0}</span></span>
        <span className="trust-item">קבצים: <span className="num">{overview?.filesCount ?? 0}</span></span>
      </div>

      <section className="card empty" aria-labelledby="upload-title">
        <h2 id="upload-title">העלאת קובץ ל{source.label}</h2>
        <p>
          הקובץ ייקלט כמקור מסוג {source.label}, יישמר כפי שהוא ויעובד בידי קורא ייעודי למקור הזה.
          מנוע הקליטה מחובר במשימה הבאה, ועד אז אין כאן כפתור העלאה פעיל.
        </p>
      </section>
    </div>
  );
}
