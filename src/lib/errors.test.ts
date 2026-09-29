import { describe, it, expect } from "vitest";
import { AppError, ERROR_TYPES } from "./errors";

describe("AppError (23D §66)", () => {
  it("uses only the canonical error types", () => {
    expect(ERROR_TYPES).toEqual(["validation", "business_rule", "conflict", "provider", "processing", "authorization", "system"]);
  });
  it("serializes to a stable contract without a stack trace", () => {
    const e = new AppError("conflict", "stale_record", "הרשומה השתנתה", "c0000000-0000-0000-0000-000000000001");
    expect(e.toJSON()).toEqual({ type: "conflict", code: "stale_record", message: "הרשומה השתנתה", correlation_id: "c0000000-0000-0000-0000-000000000001" });
    expect(JSON.stringify(e)).not.toMatch(/stack|at /);
  });
});
