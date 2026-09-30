import { INTAKE_METHODS_BY_SOURCE_TYPE } from "@/features/intake/intake-methods";
import { ROUTE_A_SOURCES } from "@/features/sources/route-a-sources";
import { getSourceFiles } from "@/features/sources/source-files";
import { BackLink } from "@/components/workspace/back-link";
import { OtherSourceIntake } from "@/components/interaction/other-source-intake";
import { SourceFileList } from "@/components/business/source-file-list";
import "@/components/ui/ui.css";
import "@/components/business/business.css";
import "@/components/interaction/interaction.css";

export const dynamic = "force-dynamic";

// "מקור נוסף" (DR-D, 22A §16): every canonical source_type outside the five Route A workspaces, with the intake
// methods the canon defines for it — file, pasted text, manual report (docs/implementation/route-a-02-intake-methods-map.md).
const ROUTE_A_TYPES = new Set(ROUTE_A_SOURCES.flatMap((s) => s.sourceTypes));
const OTHER_TYPES = [
  "user_report", "correspondence",
  ...Object.keys(INTAKE_METHODS_BY_SOURCE_TYPE).filter((t) => !ROUTE_A_TYPES.has(t) && t !== "user_report" && t !== "correspondence"),
];

export default async function OtherSourcePage() {
  const files = await getSourceFiles(OTHER_TYPES.filter((t) => t !== "user_report"));
  return (
    <div className="ws">
      <BackLink href="/sources" label="חזרה לחשבונות ומקורות" />
      <header className="ws-header">
        <div>
          <p className="ws-eyebrow">חשבונות ומקורות</p>
          <h1 className="ws-title">מקור נוסף</h1>
          <p className="ws-sub">דיווח ידני, תכתובת, מסמכי מס ורשויות, הלוואות, חובות ומקורות אחרים</p>
        </div>
      </header>

      <section className="card intake-card" aria-labelledby="other-intake">
        <h2 id="other-intake" className="card-title">קליטת מקור</h2>
        <p className="card-sub">בחרי את סוג המקור. לכל סוג מוצגות רק שיטות הקליטה שמתאימות לו.</p>
        <OtherSourceIntake sourceTypes={OTHER_TYPES} />
      </section>

      <section aria-labelledby="other-files">
        <h2 id="other-files" className="section-title">קבצים וטקסטים שנקלטו</h2>
        <SourceFileList files={files} emptyText="עדיין לא נקלטו מקורות נוספים." />
      </section>
    </div>
  );
}
