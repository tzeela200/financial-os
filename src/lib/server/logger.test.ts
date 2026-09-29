import { describe, it, expect, vi } from "vitest";
import { redact, log } from "./logger";

describe("logger (18D §39, 23B §75)", () => {
  it("redacts sensitive keys and keeps identifiers", () => {
    const out = redact({ iban: "IL620108000000099999999", token: "a.b.c", account_number: "123456789", amount_minor: 6700, password: "x", entity_id: "e1", correlation_id: "c1" });
    expect(out).toEqual({ iban: "[REDACTED]", token: "[REDACTED]", account_number: "[REDACTED]", amount_minor: "[REDACTED]", password: "[REDACTED]", entity_id: "e1", correlation_id: "c1" });
  });
  it("redacts nested objects", () => {
    expect(redact({ payload: { card_number: "4580", note: "ok" } })).toEqual({ payload: { card_number: "[REDACTED]", note: "ok" } });
  });
  it("writes one JSON line with kind and correlation id", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("request_log", "c1", { status: 200, token: "secret" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ kind: "request_log", correlation_id: "c1", status: 200, token: "[REDACTED]" });
    spy.mockRestore();
  });
});
