# VouchPlay

> A community-powered sports identity and tournament platform where your playing profile is built
> by the people you actually play with.

**By JT Consulting & Analytics Inc.** — Jasper Adjarani, Tane Valdez.

VouchPlay's core loop: create a player profile → receive credible community vouches → build a
trusted skill profile → join clubs and tournaments → give organizers better eligibility
decisions → generate verified playing history → improve the profile. Its differentiator is the
**community-backed skill profile and tournament eligibility decision-support system** (anti-sandbagging).

The single source of truth for product rules, data model, and the phased build is
[`VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md`](./VouchPlay_Master_Product_and_Code_Execution_Handover_v1.1.md).
Do not invent product rules that contradict it; where a value is operationally tunable it is an
Admin setting, not a hardcoded constant.

## Stack

- **Web/PWA:** Next.js (App Router) + React + TypeScript (strict)
- **Styling:** Tailwind CSS v4, dark + light themes
- **Backend/API:** Next.js server runtime, versioned `/api/v1` routes, shared domain services
- **Database/Auth/Storage:** Supabase (PostgreSQL, RLS)
- **Validation:** Zod
- **Hosting:** Vercel · **CI:** GitHub Actions
- **Native later:** Expo React Native consuming the same `/api/v1`

Modular monolith. No microservices in V1.

## Monorepo layout

```
apps/
  web/            Next.js app (PWA), UI, API routes
packages/
  core/           domain services (auth, players, vouches, clubs, tournaments, ...)
  db/             generated DB types, query helpers
  ui/             shared UI primitives
  config/         design tokens, skill bands, default settings, constants
  validation/     shared Zod schemas
  analytics/      product-analytics event definitions
supabase/         migrations + seed
docs/             API.md, DATA_MODEL.md, RUNBOOK.md
```

## Getting started

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in when secrets are available
npm run dev
```

Then open http://localhost:3000. The app shell, dark/light theme toggle, and public/authenticated
placeholders work without any secrets. Supabase-backed features come online once env keys are set
(Phase 1).

## Scripts (root)

- `npm run dev` — run the web app
- `npm run build` — production build
- `npm run lint` / `npm run typecheck` / `npm run test`
- `npm run format` / `npm run format:check`

## Relationship to the v1 app

`../vouchplay/` is a live predecessor. VouchPlay v2 is a ground-up rebuild on new infrastructure
with the corrected trust model from the v1.1 handover (Community Skill, Skill Trust Score, Identity
Verified and Skill Verified are four separate concepts). v1 is a reference, not a base.
