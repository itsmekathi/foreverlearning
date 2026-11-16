# ForeverLearning

A mobile-friendly PDF library that remembers where you left off on every device, plans your reading, and tracks what you've covered.

- **Books live in a Git repo.** "Sync from repo" lists every PDF (Git LFS supported).
- **Pages stream on demand.** The reader fetches only the byte ranges needed for the pages on screen (256 KB chunks), proxied through `/api/books/[id]/file` so your GitHub token never reaches the browser.
- **Vercel Blob is a temporary cache.** The first open streams from GitHub and copies the file into Blob in the background; later reads come from Blob. A daily cron deletes copies not read in `BLOB_TTL_DAYS`.
- **Resume anywhere.** Position is saved every couple of seconds and when you close the tab; offline saves queue on the device and sync later.
- **Plan & cover.** Finish-by-date or pages-per-day plans with reading days, today's target pages and ahead/behind; a chapter checklist from the PDF's table of contents (auto-ticked as you read past); highlights, notes and bookmarks; streaks, heatmap and time per book.
- **Installable** on your phone's home screen (PWA).

## Setup (Vercel first, like sakuraarchitects)

The database (Neon Postgres) and Blob storage are **created from the Vercel dashboard**, not on neon.tech. Vercel adds their environment variables to the project for you. The tables are created by `vercel-build` (`scripts/migrate.mjs`) on every deploy, so there's no manual database step.

### Environment variables at a glance

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | **Automatic.** Vercel → Storage → Neon (step 4 below) |
| `BLOB_READ_WRITE_TOKEN` | **Automatic.** Vercel → Storage → Blob (step 5 below) |
| `AUTH_SECRET` | Generate it: `npx auth secret` |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | Your GitHub OAuth app (see below) |
| `ALLOWED_GITHUB_USERS` | Your GitHub username(s), comma-separated. Only these accounts can sign in |
| `GITHUB_REPO` | The repo holding your PDFs, as `owner/name` |
| `GITHUB_BRANCH` | That repo's branch, usually `main` |
| `GITHUB_BOOKS_PATH` | Optional folder inside the repo, e.g. `books`. Empty = whole repo |
| `GITHUB_TOKEN` | Read-only fine-grained token for that repo (see below) |
| `BLOB_TTL_DAYS` | Days before an unread Blob copy is deleted (default `3`) |
| `CRON_SECRET` | Any random string (e.g. another `npx auth secret`). Secures the daily cleanup |

#### GitHub OAuth app (the "Continue with GitHub" login)
1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
2. **Application name:** ForeverLearning. **Homepage URL:** `https://<your-app>.vercel.app`.
3. **Authorization callback URL:** `https://<your-app>.vercel.app/api/auth/callback/github`.
4. Register it. The **Client ID** is `AUTH_GITHUB_ID`. Click **Generate a new client secret** and copy it right away, because it's only shown once. That's `AUTH_GITHUB_SECRET`.

An OAuth app has a single callback URL, so for local development create a second OAuth app with `http://localhost:3000` / `http://localhost:3000/api/auth/callback/github` and put its ID and secret in `.env.local`.

#### GitHub token for the book repo
1. Go to <https://github.com/settings/personal-access-tokens> → **Generate new token** (fine-grained).
2. **Repository access:** Only select repositories → your book repo.
3. **Permissions → Repository permissions → Contents:** Read-only.
4. Generate it and copy the `github_pat_…` value into `GITHUB_TOKEN`.

The token is required for a private repo. It's still recommended for a public one, because GitHub limits requests made without a token.

### Deploy steps
1. **Push this project to GitHub**, then on vercel.com go to **Add New → Project** and import it.
2. **Add env vars** (Project → Settings → Environment Variables): everything in the table above **except** `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
3. **Deploy.** The build logs *"No database connected — skipping migrations"*, and the site errors until storage is connected. This is expected.
4. **Project → Storage → Create Database → Neon**, then **Connect** it to this project (all environments). Vercel adds `DATABASE_URL`.
5. **Project → Storage → Create → Blob**, then **Connect** it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN`.
6. **Redeploy** (Deployments → ⋯ → Redeploy). The build log now shows *"✓ Database migrations applied"*.
7. Open the site, sign in with GitHub, and tap **Sync from repo**.

### Local development
```
npm install
npx vercel link                 # pick the Vercel project
npx vercel env pull .env.local  # downloads DATABASE_URL, BLOB_READ_WRITE_TOKEN and the other vars
npm run dev                     # http://localhost:3000
```
Then in `.env.local`, swap in the **local** OAuth app's `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (see above). `vercel env pull` overwrites the file, so re-apply those after each pull. `.env.local` is gitignored; never commit it.

Locally you share the same Neon database and Blob store as production. Your progress is the same on both, which is the point of the app.

### Changing the schema
Edit `lib/db/schema.ts` → `npm run db:generate` → commit `drizzle/*`. The next deploy applies it.

## Tips

- **Large PDFs:** "linearize" them (`qpdf --linearize in.pdf out.pdf`) before committing. pdf.js can then show the first pages with even fewer requests.
- GitHub rejects files over 100 MB unless they're in Git LFS. LFS files are detected and streamed automatically.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | unit tests (reading-plan math, streaks) |
| `npm run db:migrate` | apply migrations (runs automatically on Vercel) |
| `npm run db:generate` | create a migration after editing the schema |
| `npm run build` | production build |
