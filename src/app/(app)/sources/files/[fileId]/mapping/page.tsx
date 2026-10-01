import { notFound } from "next/navigation";
import { getMappingContext } from "@/features/processing/file-detail";
import { CONCEPTS } from "@/features/processing/concepts";
import { BackLink } from "@/components/workspace/back-link";
import { MappingForm } from "@/components/interaction/mapping-form";
import { ProcessButton } from "@/components/interaction/process-button";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";

// Mapping questions screen (21D §12; chapter 5 §21; D5). Shows only what the understanding engine could not decide by
// itself; everything it did decide is shown read-only with its basis. The answers become a Source Adapter used for the
// next files of the same structure.
export default async function MappingPage({ params }: PageProps<"/sources/files/[fileId]/mapping">) {
  const { fileId } = await params;
  const ctx = await getMappingContext(fileId);
  if (!ctx) notFound();
  return (
    <div className="ws">
      <BackLink href={`/sources/files/${fileId}`} label="חזרה לקובץ" />
      <header className="ws-header">
        <div>
          <p className="ws-eyebrow">שאלות פתוחות · {ctx.familyLabel}</p>
          <h1 className="ws-title file-title">{ctx.fileName}</h1>
          {ctx.table ? <p className="ws-sub">טבלה „{ctx.table.sheet}”, {ctx.table.dataRows} שורות. רק {ctx.table.questions.length === 1 ? "שאלה אחת" : `${ctx.table.questions.length} שאלות`} — כל השאר הובן אוטומטית.{ctx.openTables > 1 ? ` אחרי זה יש עוד ${ctx.openTables - 1} טבלאות עם שאלות.` : ""}</p> : null}
        </div>
      </header>
      {ctx.legacy ? (
        <section className="card"><p className="card-sub">הקובץ עובד בגרסה קודמת של המערכת. צריך לקרוא אותו מחדש, ואז יוצגו רק השאלות שבאמת פתוחות (אם יש).</p><ProcessButton fileId={ctx.fileId} label="לקרוא את הקובץ מחדש" /></section>
      ) : !ctx.table ? (
        <section className="card"><p className="card-sub">אין שאלות פתוחות — המערכת הבינה את הקובץ בעצמה.</p></section>
      ) : (
        <MappingForm ctx={ctx} concepts={CONCEPTS.map((c) => ({ code: c.code, label: c.label, dataType: c.dataType }))} />
      )}
    </div>
  );
}
