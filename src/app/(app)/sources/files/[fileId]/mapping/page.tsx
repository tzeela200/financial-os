import { notFound } from "next/navigation";
import { getMappingContext } from "@/features/processing/file-detail";
import { CONCEPTS } from "@/features/processing/concepts";
import { BackLink } from "@/components/workspace/back-link";
import { MappingForm } from "@/components/interaction/mapping-form";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";

// Import Mapping screen (21D §12; chapter 5 §20; D5). Shows the file's columns with sample values and asks only for the
// decisions the file needs. The approved mapping becomes a Source Adapter used for the next files of the same structure.
export default async function MappingPage({ params }: PageProps<"/sources/files/[fileId]/mapping">) {
  const { fileId } = await params;
  const ctx = await getMappingContext(fileId);
  if (!ctx) notFound();
  return (
    <div className="ws">
      <BackLink href={`/sources/files/${fileId}`} label="חזרה לקובץ" />
      <header className="ws-header">
        <div>
          <p className="ws-eyebrow">מיפוי · {ctx.familyLabel}</p>
          <h1 className="ws-title file-title">{ctx.fileName}</h1>
          <p className="ws-sub">{ctx.rowsTotal} שורות נתונים. האישור שלך נשמר, וקבצים הבאים באותו מבנה ייקראו לפיו בלי לשאול שוב.</p>
        </div>
      </header>
      {ctx.columns.length === 0 ? <p className="card muted-note">לא זוהו עמודות בקובץ.</p> : <MappingForm ctx={ctx} concepts={CONCEPTS.map((c) => ({ code: c.code, label: c.label, dataType: c.dataType }))} />}
    </div>
  );
}
