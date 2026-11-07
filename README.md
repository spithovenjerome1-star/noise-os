# NOISE OS

The operating system for **NOISE** — video production & social media content, Malta.
Clients, video packages, production pipeline, scripts, client portal, invoices, expenses, calendar, analytics and automations in one fast web app.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical decisions, data rules and security model.

## Run it locally

Requirements: Node 20+, pnpm, PostgreSQL 14+.

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL
pnpm db:deploy                # apply migrations
pnpm db:seed                  # pipeline stages + Malta VAT rates (no business data)
pnpm dev                      # http://localhost:3000
```

The first visit opens **/setup** to create the owner account.

Optional, to explore before importing real data:

```bash
pnpm db:demo                  # clearly labelled "Demo · …" records, flagged isDemo
```

Remove them any time in **Settings → Data → Remove demo data**.

### Useful commands

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (money, VAT, invoices, packages, deadlines, permissions, portal access, scripts, import, automations) |
| `pnpm typecheck` | TypeScript check |
| `pnpm build && pnpm start` | Production build |
| `pnpm automations` | Run all automation rules once (for cron) |
| `pnpm db:migrate` | Create a new migration after editing `prisma/schema.prisma` |

## Keyboard

`⌘K` / `Ctrl K` or `/` opens search and quick actions. `G` then a letter jumps: **D** today, **I** inbox, **C** clients, **V** production, **P** packages, **S** scripts, **T** tasks, **K** calendar, **N** invoices, **E** expenses, **A** analytics, **B** bookings.

## What's in it

| Area | Status |
|---|---|
| Dashboard (revenue, expenses, profit, outstanding, active clients, videos remaining, deadlines, overdue tasks, week, attention list, trend) | ✅ all from live records |
| Clients + workspace (overview, videos, scripts, finances, calendar, files, notes, portal links), archive, contacts, projects, health indicator, activity timeline | ✅ |
| Packages (retainer, one-off, event, bundle, hourly, barter), independent periods, auto-renewal, rollover rules, progress without double-counting | ✅ |
| Production pipeline: board (drag & drop), list (batch actions), calendar; customisable stages; 7-day deadline rule (per client/package override) | ✅ |
| Scripts: structured editor, autosave, versions, compare/restore, approvals tied to a version, outdated-approval guard, comments, WhatsApp copy, secure share links | ✅ |
| Client portal: package progress, per-video status, review links, approve / request revision, script approvals, deliverables, invoices with payment status | ✅ |
| Invoices: line items with per-line VAT, atomic numbering, partial payments, derived Paid/Partial/Overdue, print view (Save as PDF), PDF attachments, CSV export | ✅ |
| Expenses: categories, VAT, reclaimable VAT, business-use %, receipts, recurring templates | ✅ |
| Calendar: month/week/day, shoots/meetings/milestones/deliveries + derived editing deadlines & invoice due dates, equipment booking with clash warnings | ✅ |
| Tasks: smart views, filters, recurring tasks | ✅ |
| Analytics: revenue/expenses/profit, per-client revenue & profitability, videos delivered, turnaround, revenue/video, ageing, recurring vs one-off, contracted revenue, effective hourly rate, VAT & tax estimates | ✅ estimates labelled |
| Automations (9 rules) + inbox, run log, cron endpoint | ✅ never sends external messages |
| CSV import with column mapping, preview, validation, duplicate detection, import log with raw rows | ✅ create-only (never overwrites) |
| Public services page + booking requests (`/book`), bookings inbox | ✅ requests are never auto-confirmed |
| Settings, team & roles, VAT rates, JSON backup, CSV exports, demo-data removal | ✅ |
| Creative library, equipment tracker, time tracking | ✅ |

### Known limitations (not built yet)

- **No outbound email/WhatsApp.** Reply links open your own mail/WhatsApp app. Sending is intentionally not implemented.
- **Invoice PDF** = the print view saved as PDF from the browser (no server-side PDF generation). No credit notes yet.
- **Google Calendar / Google Sheets** sync is not implemented; the data model has the integration seams.
- Import offers **skip or create** for duplicates; "update existing record" is not offered.
- Client health uses a fixed €25/h workload threshold (not yet a setting).
- Files are stored on local disk — use object storage in production (below).

## Deploying to Railway (recommended)

The repo includes `railway.json`; Railway builds with `pnpm build` and starts with `pnpm start:prod`, which applies migrations and the config seed on every deploy (both are idempotent), then starts the server. Health check: `/api/health`.

1. New project → **Deploy from GitHub repo** → `noise-os`.
2. In the project, **+ New → Database → PostgreSQL**.
3. On the app service → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_URL` = `https://os.noise.mt`
   - `CRON_SECRET` = a long random string
   - `STORAGE_DIR` = `/data/storage`
   - `NODE_ENV` = `production`
4. App service → **Settings → Volumes → Add volume**, mount path `/data` (keeps uploaded files across deploys).
5. App service → **Settings → Networking → Custom domain** `os.noise.mt`, then add the CNAME record Railway shows at your DNS provider.
6. Open the site **immediately** and create the owner account on `/setup` (the setup page is open until the first account exists).

## Deploying elsewhere

Recommended low-cost setup (no paid service required to start, all have free tiers):

1. **Database:** a managed Postgres (Supabase, Neon or Railway). Set `DATABASE_URL`, then run `pnpm db:deploy && pnpm db:seed`.
2. **App:** a Node host that keeps a persistent process — Railway, Render, Fly.io, or a small VPS (`pnpm build && pnpm start` behind HTTPS). Vercel also works if files are moved to object storage (step 3).
3. **Files:** replace `src/server/storage.ts` (`putFile` / `getFile` / `deleteFile`) with S3, Cloudflare R2 or Supabase Storage (private bucket). On a VPS, local disk with backups is fine — point `STORAGE_DIR` at a persistent volume.
4. **Environment:** `APP_URL=https://os.noise.mt` (used in portal links), a long random `CRON_SECRET`, `NODE_ENV=production` (secure cookies).
5. **Automations:** schedule `POST https://os.noise.mt/api/cron/automations` with header `Authorization: Bearer $CRON_SECRET` every 15–60 minutes (any cron service, or `pnpm automations` on a VPS).
6. **Domain:** e.g. `os.noise.mt` for the app; link `https://os.noise.mt/book` from noise.mt for services & booking requests (or proxy noise.mt/book to it).
7. **Backups:** enable your provider's daily Postgres backups, plus occasional **Settings → Data → Download backup** (JSON) or `pg_dump "$DATABASE_URL" > noise-$(date +%F).sql`.

Security checklist: HTTPS only; strong owner password; give editors the *Team member* role (no finance access); give portal links an expiry and revoke them when a collaboration ends.
