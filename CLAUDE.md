# VouchPlay v2 - Agent Guide (CLAUDE.md)

Project-specific instructions for Claude Code / coding agents working in this repo. The global
JT conventions in `~/.claude/CLAUDE.md` still apply on top of this.

## Source of truth
- Product/spec: [`VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`](./VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md) (LOCKED).
- Running state + decisions: [`notes.md`](./notes.md).
- Secrets setup: [`docs/SECRETS_SETUP.md`](./docs/SECRETS_SETUP.md).

## Stack & layout
Next.js (App Router) + React 19 + TypeScript strict + Tailwind v4, Supabase (Postgres/Auth/Storage),
Vercel. npm-workspaces monorepo: `apps/web` (the app) + `packages/{config,core,db,ui,validation,analytics}`.
Modular monolith - no microservices in V1.

## Commands
```bash
npm install
npm run dev         # apps/web on :3000
npm run build       # production build (all gates: lint/typecheck/test also run in CI)
npm run typecheck && npm run lint && npm run test && npm run format:check
```

---

## ⚠️ DEPLOYMENT GOTCHA #1 - Vercel × Next.js 16 "immutable static file upload" bug

**Status:** ACTIVE WORKAROUND IN PLACE (2026-09-05). Do not "fix" this by upgrading Next back to 16
without reading this section.

### Symptom
Every Vercel deploy **built successfully** but failed at the final `Deploying outputs...` step with:

```
Cannot patch preview comments when immutable static file upload is enabled.
Upgrade to next@v16.3.0-canary.32 or newer to resolve this.
```
→ `{ "status": "error", "reason": "deploy_failed" }`

### What we verified
- It is a **Vercel platform + Next 16 output** interaction, NOT our code. The build (compile,
  typecheck, static generation) always succeeded; only the output-upload/deploy step failed.
- Reproduced on **Next 16.3.4 (stable)** AND **16.4.0-canary.18** - so the message's "upgrade Next"
  advice is misleading; the newer canary did NOT fix it.
- Reproduced via **both** the Vercel CLI (`vercel --prod`, incl. `--archive=tgz`) and **Git**
  (push-to-deploy), and with git disconnected - so it is not upload-method or git-comment specific.
- Disabling the project's **Vercel Toolbar** (Pre-Production + Production → Off) did **not** fix it,
  and those project settings would not even persist through browser automation.

### The workaround we shipped (all in-repo, no dashboard dependency)
1. **Pinned Next to `^15.5.0`** (currently 15.5.25) in `apps/web/package.json`. Next 15's build
   output does not trigger the immutable-upload path, so the deploy step succeeds.
2. Because Next 15 lints during `next build`, set `eslint: { ignoreDuringBuilds: true }` in
   `apps/web/next.config.ts` (CI still runs ESLint as its own step).
3. Renamed `apps/web/src/proxy.ts` → `apps/web/src/middleware.ts` (Next 15 uses `middleware`, not
   the Next-16 `proxy`).
4. Removed the Next-16-only `agentRules: false` from `next.config.ts`.

### DEPLOYMENT GOTCHA #2 - Vercel monorepo detection (bundled with the fix)
The Vercel project's **Root Directory** and **Framework Preset** settings could not be persisted via
automation (confirmed by screenshot: they stayed `./` and `Other`). Vercel therefore runs framework
detection at the **repo root**. To make deploys deterministic without any dashboard step:
- **Root `vercel.json`** declares: `framework: nextjs`, `installCommand: npm install`,
  `buildCommand: npm run build --workspace @vouchplay/web`, `outputDirectory: apps/web/.next`.
- The **root `package.json`** declares `next` in `dependencies` so Vercel's Next-version detection
  passes at the root (next is hoisted anyway; this is detection-only).

Do not delete the root `vercel.json` or the root-level `next` dependency while Root Directory can't
be set to `apps/web` in the dashboard - deploys will fail with `No Next.js version detected` or
`No Output Directory named "public"`.

### How this WILL be dealt with (exit plan)
Revisit when Vercel/Next ship a fix for the immutable-upload/preview-comments deploy step (watch the
Next.js and Vercel changelogs / the `vercel/vercel` issue tracker for this string). To return to
Next 16 once fixed:
1. Bump `apps/web` `next` (and `eslint-config-next`) back to `^16`.
2. Rename `middleware.ts` → `proxy.ts` (export `proxy`) and re-add `agentRules: false`.
3. Do a throwaway preview deploy FIRST to confirm the deploy step no longer errors.
4. If Root Directory can by then be set to `apps/web` in the dashboard, also remove the root-level
   `next` dependency and the `buildCommand`/`outputDirectory` overrides in the root `vercel.json`
   (keep `framework: nextjs`), and drop `eslint.ignoreDuringBuilds`.
Log the change in `notes.md` and this file.

---

## Non-negotiables (from the handover - never violate)
- Canonical skill order is LOCKED (Newbie→Pro). CSL, STS, Identity Verified and Skill Verified are
  four separate concepts; Skill-Verified and Facebook never affect vouch weight.
- All operational values (vouch limits/weights/thresholds) are Admin settings in `system_settings`,
  never hardcoded.
- Server-side authorization + RLS on everything; anonymous voucher identity is never exposed outside
  authorized Admin/moderation; `audit_logs` is append-only.
- Public reads cache-first; no `select(*)` in list endpoints; STS recomputed on write, not read.

## Secrets
Never commit secrets. `apps/web/.env.local` is gitignored. The `SUPABASE_SERVICE_ROLE_KEY` bypasses
RLS - server-only, never in a `NEXT_PUBLIC_*` var or client bundle. Live env also lives in Vercel →
Project → Settings → Environment Variables.
