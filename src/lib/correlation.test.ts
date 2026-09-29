import { describe, it, expect } from "vitest";
import { getCorrelationId, CORRELATION_HEADER } from "./correlation";

describe("correlation id (18D §40)", () => {
  it("keeps a valid incoming id", () => {
    const h = new Headers({ [CORRELATION_HEADER]: "c0000000-0000-0000-0000-000000000001" });
    expect(getCorrelationId(h)).toBe("c0000000-0000-0000-0000-000000000001");
  });
  it("replaces a missing or malformed id with a new uuid", () => {
    expect(getCorrelationId(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
    expect(getCorrelationId(new Headers({ [CORRELATION_HEADER]: "<script>" }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
