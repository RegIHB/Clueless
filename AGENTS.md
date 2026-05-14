# Clueless – AI Wardrobe Styling App

Next.js 16 (App Router) + Supabase + OpenAI/Gemini + Replicate virtual try-on.

## Architecture

Three strict layers with unidirectional trust:

1. **Frontend** (untrusted) — React/Next.js UI, presentation logic, optimistic updates only.
2. **Backend** (trusted) — API routes, server actions, webhooks, auth checks, billing logic, permission logic.
3. **Database** (enforcement) — Supabase Postgres with RLS as the primary security layer and final source of truth for authorization.

### Protected fields (NEVER client-writable)

These columns may only be mutated via secure server-side API routes, verified webhooks, or Supabase service-role operations:

- `is_pro`, subscription status, entitlement fields
- Lemon Squeezy IDs/status (`ls_customer_id`, `ls_subscription_id`, `ls_subscription_status`)
- roles, permissions, admin flags

Frontend may **display** subscription state but may **never authorize** it.

### Billing & webhooks

All payment/subscription updates must originate from verified Lemon Squeezy webhook events, be validated server-side, use service-role access, and be idempotent. Never trust frontend payment state.

### RLS policies

RLS is the primary security layer. Prefer least-privilege, restrictive policies. Before modifying policies: explain what changes, risks, possible frontend breakages, and rollback path.

### Change protocol

Before significant changes: (1) explain current flow, (2) explain the problem/risk, (3) explain proposed solution, (4) list files that change, (5) wait for confirmation if architectural. Modify the fewest files possible and preserve existing patterns.

### PR/code review checklist

Always check for: auth vulnerabilities, RLS violations, client/server boundary leaks, privilege escalation, unsafe mutations, service-role misuse, architecture regressions.

## Cursor Cloud specific instructions

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (port 3000, webpack) |
| Dev (turbo) | `pnpm dev:turbo` (port 3000, turbopack) |
| Lint | `pnpm lint` |
| Build | `pnpm build` |
| Tests | `pnpm test` (vitest, 3 test files under `tests/`) |
| Test watch | `pnpm test:watch` |

### Environment variables

Copy `.env.example` to `.env.local` and fill in values. The app starts without real Supabase/AI keys, but auth, AI chat, and data sync features require valid credentials. Free-tier APIs (Open-Meteo weather, BigDataCloud geocoding, Openverse image search) work without keys.

### Caveats

- **Build scripts warning**: pnpm may warn about ignored build scripts for `esbuild`, `sharp`, and `unrs-resolver`. These do not block `pnpm dev`, `pnpm build`, or `pnpm test` — the packages ship pre-built binaries that work without running postinstall scripts.
- **Middleware deprecation**: Next.js 16 emits a warning about the `middleware` file convention being deprecated in favor of `proxy`. This is a framework warning and does not affect app functionality.
- The dev server uses `--webpack` by default (`pnpm dev`). Use `pnpm dev:turbo` for the turbopack variant.
- ESLint config is flat config format (`eslint.config.mjs`), based on `eslint-config-next/core-web-vitals`.
- Supabase migrations in `supabase/migrations/` are SQL files meant to be run against the hosted Supabase instance (via dashboard SQL Editor). There is no local Supabase setup (`supabase/config.toml` does not exist).
