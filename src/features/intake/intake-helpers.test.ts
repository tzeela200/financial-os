import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";
import { sourceObjectPath, extensionFor, pastedTextFilename } from "./storage-path";

describe("sha256Hex", () => {
  it("hashes bytes to lowercase hex", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("storage path (migration 019 layout)", () => {
  it("uses {uid}/{source}/{file}/original.{ext} and never the original filename", () => {
    expect(sourceObjectPath("u", "s", "f", "דוח מרץ.PDF", "application/pdf")).toBe("u/s/f/original.pdf");
  });
  it("pasted text is stored as .txt", () => {
    expect(extensionFor("", "text/plain")).toBe("txt");
  });
  it("unknown extension falls back to bin, never guessed from content", () => {
    expect(extensionFor("noext", "application/octet-stream")).toBe("bin");
  });
  it("pasted text filename is generated server-side with the date", () => {
    expect(pastedTextFilename(new Date("2026-10-01T10:00:00Z"))).toBe("טקסט-מודבק-2026-10-01.txt");
  });
  it("pasted text filename uses the Israel date, not UTC", () => {
    expect(pastedTextFilename(new Date("2026-09-30T22:30:00Z"))).toBe("טקסט-מודבק-2026-10-01.txt");
  });
});
