import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./attention-items";
import { summarizePipeline } from "@/features/sources/pipeline-summary";

const empty = summarizePipeline([]);

describe("buildAttentionItems", () => {
  it("lists every missing Route A source with a link to its own upload", () => {
    const items = buildAttentionItems({
      sources: [
        { kind: "bank", label: "בנק", files: empty },
        { kind: "bit", label: "bit", files: summarizePipeline(["ready"]) },
      ],
      openReviewItems: 0,
      openContradictions: 0,
    });
    expect(items).toEqual([{ id: "missing-bank", tone: "neutral", text: "חסר מקור: בנק", href: "/sources/bank" }]);
  });

  it("failed and needs-review files come first, then review items, then pending, then missing", () => {
    const items = buildAttentionItems({
      sources: [
        { kind: "bank", label: "בנק", files: summarizePipeline(["failed", "needs_review", "uploaded"]) },
        { kind: "bit", label: "bit", files: empty },
      ],
      openReviewItems: 3,
      openContradictions: 1,
    });
    expect(items.map((i) => i.id)).toEqual(["failed-bank", "attention-bank", "contradictions", "review", "processing-bank", "missing-bit"]);
    expect(items.find((i) => i.id === "review")).toMatchObject({ text: "3 פריטים דורשים בדיקה", href: null });
  });

  it("returns nothing artificial when everything is processed", () => {
    expect(
      buildAttentionItems({ sources: [{ kind: "bank", label: "בנק", files: summarizePipeline(["ready"]) }], openReviewItems: 0, openContradictions: 0 }),
    ).toEqual([]);
  });
});
