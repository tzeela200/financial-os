import { describe, it, expect, beforeEach, vi } from "vitest";

describe("environment (18A §54, 18D §29, §33)", () => {
  beforeEach(() => { vi.resetModules(); });
  it("public env never contains the service role key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_xxxxxxxxxxxxxxxxxxxx";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_should_never_leak_xxxxxxxx";
    const { publicEnv } = await import("./env");
    expect(JSON.stringify(publicEnv)).not.toMatch(/sb_secret|service/i);
  });
  it("server env fails fast when the service key is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(import("./server/env.server")).rejects.toThrow();
  });
});
