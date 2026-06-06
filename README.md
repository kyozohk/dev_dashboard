# dev_dashboard

A development timeline of every Kyozo product — a Next.js app + Python
pipeline that mines every git repo under `~/Development/Kyozo`, classifies
changes into plain-English feature areas, and surfaces it as a
management-friendly timeline alongside an editable Obsidian vault.

> **For management:** scroll to see *how much code was shipped*, *what
> features were built*, and *what changed each day* with screenshots.
> **For engineers:** toggle "Show technical detail" on the day page to see
> API routes, schema diffs, component lists, hook signatures, and choices
> mined from commit message bodies.

---

## What it shows

- **Lines of code shipped / refactored / net product growth** — across 156 active days, 42 weeks, 13 months.
- **Major feature areas delivered** — 20+ plain-English areas (Authentication, Messaging, Organizations & Communities, Billing & Payments, Notifications, Feed & Posts, Mobile app, …) with day-counts.
- **Daily timeline** grouped by month accordion, each day showing primary headline, feature chips, repo tags, and LOC.
- **Per-day detail page** with: hero screenshots, impact metrics (new API endpoints, new UI), choices made (mined from commit message bodies), and editable headline / features / notes.
- **Projects grid** with current-state screenshots of each Kyozo project.
- **Edits are persisted** straight to the Obsidian vault — every PATCH rewrites JSON *and* the matching markdown.

---

## Layout

```
dev_dashboard/
├── app/                  Next.js 14 App Router pages + API routes
│   ├── components/       Accordion, FeatureChip, MonthAccordion
│   ├── api/              day | week | month | upload | screenshot | cron/refresh
│   ├── day/[day]/        executive view + per-repo accordion + tech toggle
│   ├── week/[week]/
│   ├── month/[month]/
│   ├── projects/
│   ├── page.tsx          home: metrics banner + feature areas + timeline
│   └── layout.tsx
├── lib/
│   ├── vault.ts          reads/writes Obsidian vault (or bundled data on Vercel)
│   ├── types.ts
│   └── colors.ts         stable per-repo color hash
├── data/                 daily.json | weekly.json | monthly.json | projects.json
├── screenshots/          captured project + day screenshots
├── pipeline/             Python + Node refresh scripts (run by launchd nightly)
│   ├── extract_git.py    walks every repo under ~/Development/Kyozo
│   ├── analyze_diffs.py  per-commit diff → API routes, components, schema, areas
│   ├── summarize.py      → daily/weekly/monthly summaries
│   ├── write_obsidian.py → markdown into the vault
│   ├── refresh.sh        launchd entry-point (chained 4 scripts above)
│   ├── com.kyozo.timeline.refresh.plist
│   └── screenshooter/    Puppeteer-based capture (Next.js, Vite, Flutter web)
├── vercel.json           daily Vercel cron at 03:00
└── package.json
```

---

## Run locally

```bash
npm install
npm run dev     # http://localhost:4123
```

`lib/vault.ts` auto-detects whether the Obsidian vault exists on this
machine. If it does, edits write straight back to
`~/Desktop/Obsidian/Kyozo/Development/`. If not (Vercel), reads bundled
`data/` + `screenshots/`.

## Daily refresh

```bash
# refresh local Obsidian vault from git
./pipeline/refresh.sh

# also commit fresh data into this repo (so Vercel re-deploys)
PUSH_TO_GIT=1 ./pipeline/refresh.sh
```

Install as a daily launchd job (macOS):

```bash
cp pipeline/com.kyozo.timeline.refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.kyozo.timeline.refresh.plist
launchctl start com.kyozo.timeline.refresh   # smoke-test
tail -f /tmp/kyozo-timeline-refresh.log
```

## Deploy to Vercel

```bash
npx vercel link        # one-time
npx vercel --prod
```

Set these in the Vercel project env:

| key                    | purpose                                                        |
|------------------------|----------------------------------------------------------------|
| `BASIC_AUTH_USER`      | site username (defaults to `kyozo-dev`)                        |
| `BASIC_AUTH_PASSWORD`  | site password (default in code — **override in Vercel env**)   |
| `CRON_SECRET`          | secures `/api/cron/refresh`; Vercel sends it automatically      |
| `REMOTE_DATA_URL`      | optional — remote JSON source for cron-triggered data refresh   |

The deployed UI is read-only; edits should happen locally where the vault
exists. The launchd job pushes data + screenshots to GitHub; Vercel
auto-redeploys.

## Access (HTTP Basic Auth)

The whole site is gated by HTTP Basic Auth. The browser shows its native
login dialog on first visit. Default credentials:

- **user**: `kyozo-dev`
- **password**: `buildsomethingpeoplewant`

Override either via the env vars above. `/api/cron/*` is exempt (Vercel
cron carries a bearer token instead).

## Pipeline details

- **`extract_git.py`** — walks every `.git` dir under `~/Development/Kyozo`
  (depth 2), pulls every commit's metadata + `--numstat`. Outputs
  `pipeline/commits.json` (~2.6 MB, ~2,140 commits).
- **`analyze_diffs.py`** — for each commit pulls the unified diff (zero
  context to keep it small, excludes lockfiles + media). Pattern-matches
  added lines + file paths against 24 feature rules (Authentication,
  Messaging, Billing & Payments, …) and emits a structured per-commit
  brief: new API routes (with HTTP methods), pages, components, hooks,
  Dart widgets, Prisma models, SQL tables, env vars, auth flag. Also
  pulls *choice sentences* from commit message bodies (regex on
  decided/migrated/instead-of/because/etc.).
- **`summarize.py`** — aggregates briefs into daily/weekly/monthly JSON.
  Promotes the code brief over weak commit subjects (`wip`, `update`, …).
- **`write_obsidian.py`** — merges into the Obsidian vault: regenerates
  markdown *but* preserves user-edited fields (notes, custom screenshots).
