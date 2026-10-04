import { describe, it, expect } from "vitest";
import { buildLineCells, restoreLtrRuns, fixBidiNeutrals } from "./pdf-lines";

// Synthetic glyph items as Hebrew PDFs store them: one item per glyph, visual positions (right to left reading).
const glyphs = (text: string, startX: number, w = 5) => [...text].map((ch, i) => ({ str: ch, x: startX - (i + 1) * w, width: w, fontSize: 10 }));

describe("PDF line reading order (chapter 5 §21)", () => {
  it("restores reversed left-to-right runs (dates, amounts, Latin names) inside Hebrew text", () => {
    expect(restoreLtrRuns("6202/70/61 ץבקלא")).toBe("16/07/2026 ץבקלא");
    expect(restoreLtrRuns("TOH")).toBe("HOT");
  });
  it("joins glyphs into words without spaces and splits cells on wide gaps", () => {
    // right-to-left glyph order as read: "חשבון" then a wide gap then "16/07/2026" stored reversed per glyph
    const items = [...glyphs("חשבון", 500), ...glyphs("6202/70/61", 300)];
    expect(buildLineCells(items)).toEqual(["חשבון", "16/07/2026"]);
  });
  it("keeps multi-character items as they are (already logical)", () => {
    expect(buildLineCells([{ str: "סה\"כ לתאריך 17/07/26", x: 400, width: 100, fontSize: 10 }, { str: "₪ 31.38", x: 200, width: 40, fontSize: 10 }])).toEqual(["סה\"כ לתאריך 17/07/26", "₪ 31.38"]);
  });
  it("restores bidi neutrals stored in visual order (mirrored parentheses, a leading period)", () => {
    expect(fixBidiNeutrals("שוק העיר )ט.ע.מ.ס( בע\"מ")).toBe("שוק העיר (ט.ע.מ.ס) בע\"מ");
    expect(fixBidiNeutrals(".Canva Pty. Ltd")).toBe("Canva Pty. Ltd.");
    expect(fixBidiNeutrals("סה\"כ (כולל מע\"מ)")).toBe("סה\"כ (כולל מע\"מ)");
    expect(fixBidiNeutrals("Google Commerce Limited")).toBe("Google Commerce Limited");
  });
  it("a fraction whose leading dot moved to the end in RTL rendering is restored (\"24.\" → \"0.24\")", () => {
    expect(fixBidiNeutrals("24.")).toBe("0.24");
    expect(fixBidiNeutrals("07.")).toBe("0.07");
    expect(fixBidiNeutrals("123.")).toBe("123."); // longer numbers are ambiguous — left as they are
    expect(fixBidiNeutrals("590.00")).toBe("590.00");
  });
});
