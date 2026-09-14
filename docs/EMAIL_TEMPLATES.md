# Supabase email templates (Reset Password)

Why: `requestPasswordReset` uses `@supabase/ssr`'s PKCE flow, which writes the code **verifier** as a
cookie on the browser that submitted the form (the installed app). The emailed reset **link** carries
only the one-time `code`; opening it in Chrome, a mail app's in-app browser, or on a second device is a
different cookie jar with no verifier, so it fails with "That sign-in link was invalid or expired" -
every time, not just on expiry. Master_plan §2BD-A.

The app now resets by a 6-digit **code**, verified in-app with `verifyOtp({ type: 'recovery' })`, which
needs no verifier cookie and so works identically anywhere the code is typed in. This requires the
**Reset Password** template below, which is not the current default.

## Set in Supabase → Authentication → Email Templates → Reset Password

**Subject:** `Your VouchPlay password reset code`

**Body (HTML):**

```html
<p>Hi,</p>
<p>Here's your VouchPlay password reset code:</p>
<h1 style="font-size: 32px; letter-spacing: 8px;">{{ .Token }}</h1>
<p>Enter this code in the app to set a new password. It expires soon.</p>
<p style="font-size: 13px; color: #666;">
  Prefer a link? Open this on the same device you're using:<br />
  {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/me/settings/password
</p>
<p>If you didn't ask for this, ignore this email.</p>
```

Keep VouchPlay's plain, warm tone - no urgency, no jargon. The fallback link is cross-browser-safe
(`token_hash` + `type`, no verifier needed) for anyone who taps it instead of typing the code, but it
is secondary; the code is the primary path.

Until this template is saved, the emailed message has **no code** in it - update it before or with
this deploy.

Note: Magic Link and Confirm signup templates already print `{{ .Token }}`, which is why email
code sign-in works today; only Reset Password lacked it.
