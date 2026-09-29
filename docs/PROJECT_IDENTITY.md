# Project Identity — financial-os

Permanent record (Final Amendment F3). Identifiers only — **no secrets**. Keys live in `.env.local` (never committed) and in the deployment secret store.

| Item | Value | Recorded |
|---|---|---|
| Supabase project name | `financial-os` | 2026-09-29 |
| Supabase Project ID (ref) | `wknnthauyfthoqffctkk` | 2026-09-29 |
| Supabase Project URL | `https://wknnthauyfthoqffctkk.supabase.co` | 2026-09-29 |
| Supabase organization | Separate organization created by Tzeela (free plan). Not visible to the Supabase MCP connector (authorized only for org `hhmqevwurlkjwqjgjycm`). | 2026-09-29 |
| Supabase region / plan limits | *to be verified once access is granted (CLI login or connector authorization)* | — |
| Created by | Tzeela, via Supabase dashboard | 2026-09-29 |
| Role | **production** (T-1). Empty; no real financial data before Stage 11. | 2026-09-29 |
| GitHub repository | `https://github.com/tzeela200/financial-os` — currently **public**; to be switched to **private** before first push | 2026-09-29 |
| Git remote | `https://github.com/tzeela200/financial-os.git` | 2026-09-29 |
| Local working copy | `C:\dev\financial-os` | 2026-09-29 |
| Test environment | Ephemeral Supabase in GitHub Actions (option 1, chosen by Tzeela 2026-09-29). No Docker locally. | 2026-09-29 |

## Rules
- Dedicated project; never reuse another Supabase project for this system (Amendment 9).
- The publishable key is public-safe but is kept only in `.env.local` / deployment env, not in Git.
- The service role key never enters the repository, the browser bundle or `NEXT_PUBLIC_*` variables (18D §29).

## Open checks (free plan)
- Inactivity pausing and backup limits of the free plan vs. Release 1 Backup/Restore requirement (ADR-002). To be presented as a decision to Tzeela before Stage 19 — not decided unilaterally.
