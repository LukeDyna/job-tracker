# Job Tracker

A personal, mobile-first job-application tracker. Installable on iPhone
(Safari → Add to Home Screen) and usable on a Mac. Free stack:
Vite + React + TypeScript + supabase-js, hosted on GitHub Pages, with
Supabase (free tier) for auth, database and functions.

> **Status:** phases 1–3 done: sign-in, jobs with one-tap statuses, list
> filter/search/sort, "Today" (needs attention) home screen, activity
> timeline with notes, stats, Add to Calendar (.ics), CSV backup, daily
> job-search suggestions, and the installable home-screen app. Phase 4 (daily
> push notifications) is next.

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
     Only needed in phase 4 (function/Actions secrets).

## 2. Run the database migration

Either:

- **Dashboard:** SQL Editor → New query → paste each file in
  [`supabase/migrations/`](supabase/migrations/) **in order** → Run:
  1. `20261104000001_init.sql`: jobs, timeline, settings
  2. `20261104000002_suggestions.sql`: search brief, suggestions, job scout

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
job search**. Every morning a scheduled Claude task on Luke's PC searches UK
job boards for matching adverts and drops them into her **Ideas** tab, where
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
- Scheduled task: **Job Tracker: daily job search** (Claude desktop app →
  Scheduled), daily at about 07:00. It runs only while the Claude app is
  open on that PC; if the app was closed it runs on next launch.

Set-up on a new machine (already done on Luke's PC):

```bash
node scripts/job-scout.mjs init https://<ref>.supabase.co sb_publishable_…
```

Run the SQL it prints once in the Supabase SQL Editor, then check with:

```bash
node scripts/job-scout.mjs check
```

To revoke a scout key: `delete from public.scout_keys;` in the SQL Editor.

## 5. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the Project URL and publishable key
npm run dev
```

Open <http://localhost:5173>.

## 6. Deploy to GitHub Pages

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

## 7. For her: install on iPhone

1. Open the app link in **Safari** (not Chrome or the Gmail/Outlook
   in-app browser).
2. Tap the **Share** button (square with an arrow), scroll down, tap **Add to
   Home Screen**, then **Add**.
3. Open **Jobs** from the new icon and sign in with your email and the
   6-digit code. (The home-screen app has its own sign-in, separate from
   Safari, so sign in from the icon.)
4. Go to **Settings → Daily job search** and describe the jobs you're after.
   New matches appear in the **Ideas** tab each morning.
5. "Add to Calendar" buttons (follow-ups, interviews) open iPhone's own
   "Add to Calendar" screen, so reminders come from the Calendar app.

---

## Project layout

```
supabase/migrations/   SQL schema, RLS, triggers
src/lib/               Supabase client, data store, types, formatting, router
src/pages/             Login, Home (Today), JobList, JobDetail, JobForm, Suggestions, Settings
src/components/        Tab bar, header, status/follow-up sheets, timeline, install card, toast, icons
public/                manifest, service worker (offline shell + push), icons
scripts/job-scout.mjs  helper for the daily job-search task
.github/workflows/     deploy.yml (Pages)
```
