import { describe, expect, it } from "vitest";
import glossary from "../../../docs/stage-0/glossary.json";
import { INTAKE_METHODS_BY_SOURCE_TYPE, intakeMethodsFor, DEFERRED_INTAKE_CHANNELS } from "./intake-methods";

const canonicalSourceTypes: string[] = (glossary as { enums: { source_type: { values: string[] } } }).enums.source_type.values;

describe("intake methods registry (docs/implementation/route-a-02-intake-methods-map.md)", () => {
  it("covers every canonical source_type from the glossary — no file-only intake", () => {
    expect(Object.keys(INTAKE_METHODS_BY_SOURCE_TYPE).sort()).toEqual([...canonicalSourceTypes].sort());
  });

  it("every source_type has at least one intake method", () => {
    for (const t of canonicalSourceTypes) expect(intakeMethodsFor(t).length, t).toBeGreaterThan(0);
  });

  it("user_report is a manual report (18A §13, §56; 18D §16 manual-report), not a file", () => {
    expect(intakeMethodsFor("user_report")).toEqual(["manual_report"]);
  });

  it("text-native sources accept pasted/typed text stored as an immutable .txt source (18A §43)", () => {
    for (const t of ["correspondence", "prior_analysis", "official_reference"]) {
      expect(intakeMethodsFor(t), t).toEqual(["file", "text"]);
    }
  });

  it("financial statements and documents are file intake (select, drag, mobile pick, clipboard paste)", () => {
    for (const t of ["bank_statement", "credit_card_statement", "p2p_payment", "business_income_export", "business_expense_export"]) {
      expect(intakeMethodsFor(t), t).toEqual(["file"]);
    }
  });

  it("unknown source_type has no method (never guessed)", () => {
    expect(intakeMethodsFor("voice_note")).toEqual([]);
  });

  it("connector channels are recorded as deferred, not silently dropped", () => {
    expect(DEFERRED_INTAKE_CHANNELS.map((c) => c.channel)).toEqual(["connector_api", "google_drive", "email_forward", "whatsapp", "webhook"]);
  });
});
