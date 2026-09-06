# VouchPlay v2 - Agent Guide (AGENTS.md)

For Codex and any coding agent. This mirrors [`CLAUDE.md`](./CLAUDE.md) - read that for full detail.
The global JT conventions in `~/.claude/CLAUDE.md` also apply (Codex imports it as its source of truth).

## Orientation
- Spec (LOCKED): `VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`
- State/decisions: `notes.md` · Secrets: `docs/SECRETS_SETUP.md`
- Stack: Next.js App Router + React 19 + TS strict + Tailwind v4 + Supabase + Vercel; npm-workspaces
  monorepo (`apps/web` + `packages/*`). Commands: `npm run dev|build|typecheck|lint|test`.

---

## ⚠️ DEPLOYMENT GOTCHA - Vercel × Next.js 16 "immutable static file upload" bug (ACTIVE WORKAROUND)

Do NOT upgrade Next.js back to 16 without reading this and testing a preview deploy first.

**Symptom:** Vercel builds succeed, then the `Deploying outputs...` step fails with
`Cannot patch preview comments when immutable static file upload is enabled. Upgrade to
next@v16.3.0-canary.32 or newer.` → `deploy_failed`.

**Verified:** Platform/Next-16 issue, not our code. Happens on Next 16.3.4 stable AND 16.4.0-canary.18,
via CLI and Git, with the Vercel Toolbar disabled. Build always succeeds; only output-deploy fails.

**Workaround in place (all in-repo):**
1. `apps/web` pinned to `next@^15.5.0` (Next 15 output doesn't trigger it).
2. `next.config.ts`: `eslint: { ignoreDuringBuilds: true }` (CI lints separately); removed Next-16-only
   `agentRules`.
3. `apps/web/src/middleware.ts` (Next 15 name), not `proxy.ts`.
4. **Monorepo detection:** root `vercel.json` (`framework: nextjs`, `installCommand`,
   `buildCommand: npm run build --workspace @vouchplay/web`, `outputDirectory: apps/web/.next`) + `next`
   declared in the **root** `package.json` dependencies (Vercel detects Next at the repo root because
   the Root Directory / Framework Preset dashboard settings would not persist). Keep both.

**Exit plan (how this will be dealt with):** when Vercel/Next fix the immutable-upload/preview-comments
deploy step (watch Next.js + Vercel changelogs and the `vercel/vercel` issue tracker for that string):
bump `next`/`eslint-config-next` back to `^16`, rename `middleware.ts` → `proxy.ts` (+ re-add
`agentRules`), verify with a throwaway preview deploy, and - if Root Directory can then be set to
`apps/web` - drop the root-level `next` dep and the `buildCommand`/`outputDirectory` overrides
(keep `framework: nextjs`) and remove `eslint.ignoreDuringBuilds`. Record it in `notes.md` + `CLAUDE.md`.

---

## Non-negotiables
Canonical skill order LOCKED; CSL / STS / Identity Verified / Skill Verified are separate (Skill-Verified
and Facebook never affect vouch weight); operational values live in `system_settings` (never hardcoded);
server-side authz + RLS everywhere; anonymous voucher identity never exposed; `audit_logs` append-only.

## Secrets
Never commit secrets. `apps/web/.env.local` is gitignored; `SUPABASE_SERVICE_ROLE_KEY` is server-only
(bypasses RLS). Live env lives in Vercel project env vars.
