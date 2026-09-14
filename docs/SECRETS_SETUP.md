# Phase 1 Secrets Setup

Follow these once to unblock auth. Project ref: **`itrosesiywpbaxtmucbb`**.
Supabase callback URL (used in steps 1 & 2): **`https://itrosesiywpbaxtmucbb.supabase.co/auth/v1/callback`**

When done, paste the values into `apps/web/.env.local` (copy from `apps/web/.env.example`).

---

## 1) Supabase API keys

1. Open the dashboard: https://supabase.com/dashboard/project/itrosesiywpbaxtmucbb
2. Left sidebar → **Project Settings** (gear) → **API**.
3. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   (it is `https://itrosesiywpbaxtmucbb.supabase.co`).
4. Copy the **public key**:
   - New projects show a **Publishable key** (`sb_publishable_…`). Use it → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Older projects show an **anon / public** JWT instead - that also works.
5. Copy the **secret key** (server-only, bypasses RLS):
   - New projects: **Secret keys** → reveal `sb_secret_…`.
   - Older projects: **service_role** JWT.
   - Use it → `SUPABASE_SERVICE_ROLE_KEY`. **Never** put this in a `NEXT_PUBLIC_…` var or client code.
6. Left sidebar → **Authentication** → **URL Configuration**:
   - **Site URL:** `http://localhost:3000` (change to the Vercel URL at launch).
   - **Redirect URLs** - add both:
     - `http://localhost:3000/auth/callback`
     - `https://<your-vercel-domain>/auth/callback` (add once Vercel is set up)

---

## 2) Google OAuth (login only - no Gmail scopes)

You can reuse the existing **"VouchPlay"** Google Cloud project from v1 or make a new one; either way
the new Supabase callback URL must be added.

1. Open https://console.cloud.google.com → select (or create) the **VouchPlay** project.
2. **APIs & Services** → **OAuth consent screen**:
   - User type **External**, app name **VouchPlay**, support email, developer email.
   - Scopes: only **`openid`**, **`email`**, **`profile`** (do NOT add any Gmail scopes).
   - Publish status: **In production** (basic scopes need no Google verification).
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**. Name: `VouchPlay Web`.
   - **Authorized JavaScript origins:** `http://localhost:3000` (and the Vercel URL later).
   - **Authorized redirect URIs:** `https://itrosesiywpbaxtmucbb.supabase.co/auth/v1/callback`
   - Create → copy **Client ID** and **Client secret**.
4. Back in Supabase → **Authentication** → **Providers** → **Google**:
   - Toggle **Enabled**, paste the **Client ID** and **Client secret**, **Save**.
5. In `apps/web/.env.local` set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
   (The client id/secret live in Supabase, not in the app env.)

---

## 3) Gmail App Password + Supabase Custom SMTP (verification emails)

Gmail SMTP requires an **App Password**, which requires **2-Step Verification** on the account.

1. Sign in as **vouchplay@gmail.com** → https://myaccount.google.com/security
2. Turn **2-Step Verification** **ON** (if it isn't already).
3. Go to **App passwords**: https://myaccount.google.com/apppasswords
   - App name: `VouchPlay SMTP` → **Create** → copy the **16-character** password (no spaces).
4. In Supabase → **Project Settings** → **Authentication** → **SMTP Settings** → enable **Custom SMTP**:
   - **Host:** `smtp.gmail.com`
   - **Port:** `465` (SSL) - or `587` (TLS)
   - **Username:** `vouchplay@gmail.com`
   - **Password:** the 16-char App Password
   - **Sender email:** `vouchplay@gmail.com` · **Sender name:** `VouchPlay`
   - **Save.** (Optional: raise Auth rate limits under Authentication → Rate Limits.)
5. Mirror the app-level values in `apps/web/.env.local` (`SMTP_USER`, `SMTP_PASS`, and optionally
   `SMTP_HOST`/`SMTP_PORT`) for the Phase-11 notification channel. Supabase Auth keeps its own SMTP
   configuration in the Supabase dashboard.

> Pilot only: Gmail caps ~500 sends/day and has no bounce webhooks. Switch to a dedicated provider
> (Resend/Postmark/SendGrid) before public launch - the code is already behind an interface for it.

---

## 4) Web Push (VAPID keys)

Push notifications (master_plan §2AY D) are **inert until these exist** - exactly like the SMTP
channel above. No code change switches them on; the env vars do.

1. Generate the pair once (they are permanent - changing them invalidates every existing device
   subscription, and every installed phone would have to re-subscribe):

   ```bash
   npx web-push generate-vapid-keys
   ```

   It prints a **Public Key** and a **Private Key** (URL-safe base64).

2. In Vercel → **Project** → **Settings** → **Environment Variables**, add them for **both
   Production AND Preview**:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = the public key (this one is public by design - it ships in the
     browser bundle so the service worker can subscribe).
   - `VAPID_PRIVATE_KEY` = the private key. **Server-only** - never prefix it with `NEXT_PUBLIC_`.
   - `VAPID_SUBJECT` (optional) = a `mailto:` or `https://` contact the push services can reach.
     Defaults to `mailto:vouchplay@gmail.com` when unset.

   **Do this BEFORE the next push-to-deploy.** Vercel bakes `NEXT_PUBLIC_*` values into the build, and
   env changes only take effect on a **new deployment** - adding them after a deploy leaves push inert
   until something else triggers a rebuild.

3. Mirror the same three lines in `apps/web/.env.local` for local development.

4. Apply `scripts/apply-0049.sql` (the `push_subscriptions` table) in the Supabase SQL editor.

5. Verify after the deploy: sign in, turn on **Notifications on this device** on the ME page, and use
   **Send me a test push** in Admin → Operations. Admin also shows the live device count.

> The Admin kill switch `push_notifications_enabled` (Settings → App & push) turns delivery off with
> no deploy. Keys present + switch on = push sends; either missing = silently inert.

---

## Final: `apps/web/.env.local`

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://itrosesiywpbaxtmucbb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx        # or the anon JWT
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx                 # or the service_role JWT - server only
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=vouchplay@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BB_xxx                     # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=xxx                                   # server only - never NEXT_PUBLIC_
VAPID_SUBJECT=mailto:vouchplay@gmail.com                # optional; this is the default
```

Never commit `.env.local` (it's gitignored). Tell me when these are in place - I'll then
`supabase link` + `db push` (apply 0001/0002), generate DB types, and wire up auth.
```

