# Project Identity — financial-os

Permanent record (Final Amendment F3). Identifiers only — **no secrets**. Keys live in `.env.local` (never committed) and in the deployment secret store.

| Item | Value | Recorded |
|---|---|---|
| Supabase project name | `financial-os` | 2026-09-29 |
| Supabase Project ID (ref) | `wknnthauyfthoqffctkk` | 2026-09-29 |
| Supabase Project URL | `https://wknnthauyfthoqffctkk.supabase.co` | 2026-09-29 |
| Supabase organization | `tzeelapersonal` (FREE plan). Supabase MCP connector currently authorized only for ALLDENT; reconnect pending. | 2026-09-30 |
| Supabase region | Oceania (Sydney) `ap-southeast-2`, compute NANO — kept deliberately (ADR-009) | 2026-09-30 |
| Deploy integration | Supabase GitHub integration: Deploy to production from `main`, working dir `.` (ADR-009) | 2026-09-30 |
| Created by | Tzeela, via Supabase dashboard | 2026-09-29 |
| Role | **production** (T-1). Empty; no real financial data before Stage 11. | 2026-09-29 |
| GitHub repository | `https://github.com/tzeela200/financial-os` — temporarily public (Tzeela); to return to private | 2026-09-30 |
| Git remote | `https://github.com/tzeela200/financial-os.git` | 2026-09-29 |
| Local working copy | `C:\dev\financial-os` | 2026-09-29 |
| Test environment | Ephemeral Supabase in GitHub Actions (option 1, chosen by Tzeela 2026-09-29). No Docker locally. | 2026-09-29 |

## Rules
- Dedicated project; never reuse another Supabase project for this system (Amendment 9).
- The publishable key is public-safe but is kept only in `.env.local` / deployment env, not in Git.
- The service role key never enters the repository, the browser bundle or `NEXT_PUBLIC_*` variables (18D §29).

## Open checks (free plan)
- Inactivity pausing and backup limits of the free plan vs. Release 1 Backup/Restore requirement (ADR-002). To be presented as a decision to Tzeela before Stage 19 — not decided unilaterally.
