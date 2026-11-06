# Job Tracker

A personal, mobile-first job-application tracker. Installable on iPhone
(Safari → Add to Home Screen) and usable on a Mac. Free stack:
Vite + React + TypeScript + supabase-js, hosted on GitHub Pages, with
Supabase (free tier) for auth, database and functions.

> **Status:** all four phases done: sign-in, jobs with one-tap statuses,
> jobs grouped by stage, "Today" (needs attention) home screen, activity
> timeline with notes, confidence stars, stats, Add to Calendar (.ics), CSV
> backup, daily job-search suggestions, the installable home-screen app, and
> an 8am push-notification summary.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> → **New project**. Pick a European
   region (London `eu-west-2`, Ireland `eu-west-1` or Zurich `eu-central-2`),
   choose a strong database password (store it in your password manager; the
   app never needs it).
2. When it's ready, open **Project Settings → API Keys** and note:
   - **Project URL**: `https://<ref>.supabase.co` (shown on the project home page)
   - **Publishable key** (`sb_publishable_…`): public, safe in the browser
     (RLS protects the data). Use this rather than the legacy `anon` key,
     which Supabase retires in early 2027.
   - **Secret key** (`sb_secret_…`): *never* put this in the app or the repo.
     You won't need to copy it anywhere: Supabase gives it to the Edge
     Function automatically.

## 2. Run the database migration

Either:

- **Dashboard:** SQL Editor → New query → paste each file in
  [`supabase/migrations/`](supabase/migrations/) **in order** → Run:
  1. `20261104000001_init.sql`: jobs, timeline, settings
  2. `20261104000002_suggestions.sql`: search brief, suggestions, job scout
  3. `20261104000003_confidence.sql`: confidence stars
  4. `20261104000004_push.sql`: push-notification devices, digest bookkeeping

or

- **CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>`,
  then `npx supabase db push`.

This creates `jobs`, `application_events` and `user_settings`, the enums,
indexes, Row Level Security (every operation limited to
`user_id = auth.uid()`), and the triggers that:

- log every status change (and job creation) to `application_events`;
- set `applied_on` to today (UK date) the first time a job reaches Applied
  (or jumps straight past it to an interview/offer stage), if it's empty;
- bump `last_activity_at` on status changes and manual notes.

Check it worked: **Table Editor** shows the three tables, each with a
"RLS enabled" badge.

Under **Integrations → Data API → Settings** the three tables show as
"custom grants" rather than "exposed". That's expected: the migration grants
access to signed-in users only (nothing to `anon`), which is what the app
needs. Don't click them to "fix" it, as that would add the default `anon` grants.

## 3. Configure email sign-in (6-digit code)

The app signs in with a **6-digit email code**, not a magic link. A link
would open in Safari instead of the home-screen app, so the session would
land in the wrong place.

1. **Email delivery (custom SMTP, required).** Supabase's built-in sender
   only emails members of your Supabase organisation, and without custom SMTP
   the email templates can't be edited. This project uses
   [Resend](https://resend.com) (free: 3,000 emails/month):
   1. In Resend: **Domains → Add domain**, enter your domain, region
      Ireland (`eu-west-1`), leave click/open tracking off.
   2. Add the DNS records it shows (a `resend._domainkey` TXT for DKIM plus
      `send` / `rsend` CNAMEs, "DNS only" if you use Cloudflare). They don't
      affect existing mail (e.g. Microsoft 365). Wait for **Verified**.
   3. **API Keys → Create API key**, permission **Sending access**. Copy it
      (shown once).
   4. In Supabase: **Authentication → Emails → SMTP Settings** → enable
      custom SMTP:

      | Field | Value |
      |---|---|
      | Sender email | an address on the verified domain, e.g. `jobtracker@yourdomain` |
      | Sender name | `Job Tracker` |
      | Host | `smtp.resend.com` |
      | Port | `465` |
      | Username | `resend` |
      | Password | the Resend API key |

   5. **Authentication → Rate Limits**: emails per hour `30` is plenty.

   Don't use Microsoft 365 / Exchange Online SMTP: Supabase only supports
   username/password SMTP, which Microsoft is switching off by default from
   December 2026.

2. **Authentication → Sign In / Providers → Email**: make sure Email is
   enabled, **Email OTP length** is `6` and expiry is `3600` s or lower.
3. **Authentication → Emails → Templates**. Edit **both** of these
   templates (new users get *Confirm sign up*; returning users get
   *Magic link or OTP*) so they show the code instead of the link.

   **Subject:** `Your Job Tracker code: {{ .Token }}`

   **Body:**

   ```html
   <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c2230">
     <h2 style="margin:0 0 16px;font-size:20px;color:#3d5a80">Your Job Tracker sign-in code</h2>
     <p style="margin:0 0 8px">Type this code into the Job Tracker app:</p>
     <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace">{{ .Token }}</p>
     <p style="margin:0 0 8px;color:#6b7280;font-size:14px">The code expires in 1 hour and can only be used once.</p>
     <p style="margin:0;color:#6b7280;font-size:14px">If you didn't ask for this, you can ignore this email.</p>
   </div>
   ```

   Putting the code in the subject lets iOS offer it above the keyboard
   ("From Mail") so she doesn't need to switch apps.

4. **After she has signed in for the first time, turn off new sign-ups:**
   **Authentication → Sign In / Providers → "Allow new users to sign up" → off.**
   Existing users can still sign in with a code; nobody else can create an
   account.

## 4. Daily job search ("job scout")

She writes a paragraph describing the jobs she wants in **Settings → Daily
job search**. Every morning a Claude cloud routine searches UK job boards for
matching adverts and drops them into her **Ideas** tab, where
she can **Save** one (it becomes a job in her list, status Interested) or
**Dismiss** it. Already-saved or dismissed jobs aren't suggested again.

How it's wired (so it never needs the Supabase secret key):

- The scout uses the public publishable key plus its own random **scout
  key**. The database stores only a SHA-256 hash of that key, and the key
  only unlocks two functions: `scout_get_work` (read briefs) and
  `scout_submit` (add suggestions). It can't read or change jobs, settings or
  anything else, so a hostile web page it reads can't make it do damage.
- Helper script: [`scripts/job-scout.mjs`](scripts/job-scout.mjs).
  Config is kept **outside the repo** at `%USERPROFILE%\.job-tracker\scout.json`.
- **Cloud routine** (runs on Anthropic's servers, so no PC needs to be on):
  daily at 07:07 UTC in the cloud environment "Job Tracker scout", which holds
  `JOB_SCOUT_URL`, `JOB_SCOUT_PUBLISHABLE_KEY` and `JOB_SCOUT_KEY` as
  environment variables and has full network access. Its instructions are in
  [`scripts/job-scout-prompt.md`](scripts/job-scout-prompt.md). Manage it at
  <https://claude.ai/code/routines> (Run now, pause, edit).
- A local fallback (Claude desktop app → Scheduled → **Job Tracker: daily job
  search**) exists on Luke's PC but is paused.

Set-up for a local copy (already done on Luke's PC):

```bash
node scripts/job-scout.mjs init https://<ref>.supabase.co sb_publishable_…
```

Run the SQL it prints once in the Supabase SQL Editor, then check with:

```bash
node scripts/job-scout.mjs check
```

To revoke a scout key: `delete from public.scout_keys;` in the SQL Editor.

## 5. Push notifications (8am summary)

Each morning she gets one notification, for example:

> **Good morning! 3 things to look at**
> 🗓️ Interview tomorrow at 10:00 · Cardiff Uni
> 🔔 Follow up with Welsh Arts Trust (1 overdue)
> ✨ 2 new job ideas to look at

It covers interviews today/tomorrow, follow-ups due, saved jobs closing within
3 days, applications with no reply for the "stale" number of days, and new job
ideas. Nothing is sent on quiet days, and the Home Screen icon shows a red
count until the app is opened.

How it's wired:

- The browser subscribes with the **VAPID public key** and stores the
  subscription in `push_subscriptions` (one row per device, RLS-protected).
- [`supabase/functions/daily-digest`](supabase/functions/daily-digest/index.ts)
  builds each user's summary and sends it with standard Web Push (encryption
  and VAPID signing done with Web Crypto, no dependencies). Devices that have
  unsubscribed are removed automatically.
- [`.github/workflows/daily-digest.yml`](.github/workflows/daily-digest.yml)
  calls the function at 07:03, 08:03 and 09:03 UTC. The function only sends
  between 08:00 and 12:00 UK time and once per UK day, so it lands just after
  8am in both GMT and BST.
- The app's **Settings → Notifications → Send today's summary now** calls the
  same function with her own sign-in token, sending to that device only.

Set-up (one-off):

1. **Keys.** Generate a VAPID key pair and a random digest secret (any
   web-push key generator works, e.g. `npx web-push generate-vapid-keys`; for
   the secret, `openssl rand -hex 32`). Luke's are in
   `%USERPROFILE%\.job-tracker\push-secrets.txt`, outside the repo.
2. **Edge Function.** Supabase → **Edge Functions → Deploy a new function →
   Via Editor**, name it `daily-digest`, paste
   [`index.ts`](supabase/functions/daily-digest/index.ts), **Deploy**. Then in
   the function's **Details**, turn **Verify JWT** (Enforce JWT verification)
   **off** and save: the function checks the digest secret or the user's
   token itself. (CLI alternative:
   `npx supabase functions deploy daily-digest --no-verify-jwt`.)
3. **Function secrets.** **Edge Functions → Secrets** → add `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a contact URL or `mailto:`, e.g. the
   app's URL) and `DIGEST_SECRET`. You can paste the whole `.env`-style block.
4. **GitHub.** Settings → Secrets and variables → Actions:
   - Variable `VITE_VAPID_PUBLIC_KEY` = the VAPID public key (public by design).
   - Secret `DIGEST_SECRET` = the same digest secret as in step 3.

   Then push to `main` (or re-run *Deploy to GitHub Pages*) so the app is
   built with the public key.
5. **Test.** In the app: **Settings → Notifications → Turn on notifications**,
   then **Send today's summary now**. Or run the *Daily digest* workflow by
   hand with **force** ticked (sends to every device).

Notes:

- On iPhone, notifications only work in the **installed** Home Screen app
  (iOS 16.4 or later); the Settings card explains this when opened in Safari.
- GitHub pauses scheduled workflows in a repository with no commits for 60
  days. It emails a warning first; re-enable it from the Actions tab.
- To stop all notifications: disable the *Daily digest* workflow.

## 6. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the Project URL and publishable key
npm run dev
```

Open <http://localhost:5173>.

## 7. Deploy to GitHub Pages

1. Create a GitHub repository (e.g. `job-tracker`) and push this folder to `main`.
2. **Settings → Secrets and variables → Actions → Variables** → add
   repository *variables* (not secrets; both values are public by design):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your publishable key (`sb_publishable_…`)
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Push to `main` (or run the *Deploy to GitHub Pages* workflow by hand).
   The app is served at `https://<your-user>.github.io/<repo>/`. The
   workflow sets Vite's base path from the repo name automatically.

Never commit `.env.local` or any service-role/secret key; `.gitignore`
already excludes env files.

## 8. For her: install on iPhone

1. Open the app link in **Safari** (not Chrome or the Gmail/Outlook
   in-app browser).
2. Tap the **Share** button (square with an arrow), scroll down, tap **Add to
   Home Screen**, then **Add**.
3. Open **Jobs** from the new icon and sign in with your email and the
   6-digit code. (The home-screen app has its own sign-in, separate from
   Safari, so sign in from the icon.)
4. Go to **Settings → Daily job search** and describe the jobs you're after.
   New matches appear in the **Ideas** tab each morning.
5. In **Settings → Notifications**, tap **Turn on notifications** and then
   **Allow**. You'll get a summary at 8am on days there's something to do.
6. "Add to Calendar" buttons (follow-ups, interviews) open iPhone's own
   "Add to Calendar" screen, so reminders come from the Calendar app.

---

## Project layout

```
supabase/migrations/          SQL schema, RLS, triggers
supabase/functions/daily-digest/  the 8am push summary (Edge Function)
src/lib/                      Supabase client, data store, types, formatting, router, push
src/pages/                    Login, Home (Today), JobList, JobDetail, JobForm, Suggestions, Settings
src/components/               Tab bar, header, sheets, timeline, install/notifications cards, toast, icons
public/                       manifest, service worker (offline shell + push), icons
scripts/                      job-scout helper + the cloud routine's prompt
.github/workflows/            deploy.yml (Pages), daily-digest.yml (8am summary)
```
