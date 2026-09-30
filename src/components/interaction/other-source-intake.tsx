"use client";

import { useState } from "react";
import { intakeMethodsFor, type IntakeMethod } from "@/features/intake/intake-methods";
import { SOURCE_TYPE_LABELS } from "@/features/intake/source-type-labels";
import { UploadArea } from "./upload-area";
import { TextIntake } from "./text-intake";
import { ManualReportForm } from "./manual-report-form";

// "מקור נוסף" (DR-D): one entry inside Accounts & Sources for every canonical source_type that is not one of the
// five Route A workspaces. The available intake methods come from the canonical registry (intake-methods.ts).
const METHOD_LABEL: Record<IntakeMethod, string> = { file: "קובץ", text: "טקסט מודבק", manual_report: "דיווח ידני" };

export function OtherSourceIntake({ sourceTypes }: { sourceTypes: string[] }) {
  const [type, setType] = useState(sourceTypes[0]);
  const methods = intakeMethodsFor(type);
  const [method, setMethod] = useState<IntakeMethod>(methods[0]);
  const active = methods.includes(method) ? method : methods[0];

  return (
    <div className="intake-block">
      <label className="field">
        <span className="field-label">סוג המקור</span>
        <select className="field-input" value={type} onChange={(e) => setType(e.target.value)} data-testid="other-source-type">
          {sourceTypes.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t] ?? t}</option>)}
        </select>
      </label>

      {methods.length > 1 ? (
        <div className="segmented" role="radiogroup" aria-label="שיטת קליטה">
          {methods.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={active === m}
              className={`segmented-item${active === m ? " is-active" : ""}`} onClick={() => setMethod(m)}>
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      ) : null}

      {active === "file" ? <UploadArea key={type} sourceType={type} sourceLabel={SOURCE_TYPE_LABELS[type] ?? type} /> : null}
      {active === "text" ? <TextIntake key={type} sourceType={type} /> : null}
      {active === "manual_report" ? <ManualReportForm /> : null}
    </div>
  );
}
