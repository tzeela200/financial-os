import { describe, it, expect } from "vitest";
import { formatMoney } from "./money-amount";

describe("formatMoney (20D §5)", () => {
  it("puts ₪ after the amount with thousands separator", () => { expect(formatMoney(842050, "ILS")).toBe("8,420.50 ₪"); });
  it("omits decimals for whole amounts", () => { expect(formatMoney(1200000, "ILS")).toBe("12,000 ₪"); });
  it("shows a clear minus", () => { expect(formatMoney(-34900, "ILS")).toBe("-349 ₪"); });
  it("keeps a real zero as zero (known zero)", () => { expect(formatMoney(0, "ILS")).toBe("0 ₪"); });
  it("keeps foreign currency code", () => { expect(formatMoney(47490, "EUR")).toBe("474.90 €"); });
});
