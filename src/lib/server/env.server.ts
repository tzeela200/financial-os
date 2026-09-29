import "server-only";
import { z } from "zod";

// Server-only secrets (18D §29, §33). Importing this from client code fails the build via `server-only`.
export const serverEnv = z
  .object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) })
  .parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
