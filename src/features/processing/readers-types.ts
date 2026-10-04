import type { Sheet } from "./tabular";

// Shared reader output types (no runtime code, safe for tests and client-free modules).
export type RowLocator = { page?: number; y?: number };
export type CellMeta = { type: string; formula?: string };
export type PositionedItem = { str: string; x: number; width: number; fontSize: number };
export type ReadSheet = Sheet & { locators?: RowLocator[]; cellMeta?: (CellMeta | null)[][]; positions?: PositionedItem[][]; raw?: boolean; /** the section title printed just above a layout table (PDF) */ title?: string; /** layout rules applied when the table was built (PDF) */ assumptions?: string[] };
export type SourceRead =
  | { ok: true; format: "csv" | "excel" | "pdf"; meta: Record<string, unknown>; sheets: ReadSheet[] }
  | { ok: false; reason: "visual_reading_required" | "unsupported_format" | "empty" | "corrupt"; detail?: string };
