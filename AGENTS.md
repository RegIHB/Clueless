# Clueless – AI Wardrobe Styling App

A Next.js 16 (App Router) full-stack TypeScript app with Supabase auth/database, OpenAI/Gemini AI chat, and Replicate virtual try-on.

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

Copy `.env.example` to `.env.local` and fill in values. The app starts without real Supabase/AI keys, but auth and AI chat features require valid credentials. Free-tier APIs (Open-Meteo weather, BigDataCloud geocoding, Openverse image search) work without keys.

### Caveats

- **Build scripts warning**: pnpm may warn about ignored build scripts for `esbuild`, `sharp`, and `unrs-resolver`. These do not block `pnpm dev`, `pnpm build`, or `pnpm test` — the packages ship pre-built binaries that work without running postinstall scripts.
- **Middleware deprecation**: Next.js 16 emits a warning about the `middleware` file convention being deprecated in favor of `proxy`. This is a framework warning and does not affect app functionality.
- The dev server uses `--webpack` by default (`pnpm dev`). Use `pnpm dev:turbo` for the turbopack variant.
- ESLint config is flat config format (`eslint.config.mjs`), based on `eslint-config-next/core-web-vitals`.
