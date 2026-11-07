# NOISE OS — Architecture & decisions

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server components keep pages fast (data is queried on the server, little JS shipped). Server actions give typed mutations without a separate API layer. |
| Database | **PostgreSQL + Prisma 6** | Relational integrity for money, packages and approvals. Prisma migrations are versioned in `prisma/migrations`. Prisma 6 is used rather than the 7/8 release candidates for stability. |
| Styling | **Tailwind CSS v4** with CSS-variable design tokens | One token set drives light and dark mode (`src/app/globals.css`). |
| Components | Hand-written **shadcn/ui-style** primitives on **Radix UI** | Same approach as shadcn/ui (owned source, Radix accessibility) without depending on the shadcn CLI. Lives in `src/components/ui`. |
| Icons | Lucide | Consistent stroke icon set. |
| Charts | Recharts | Lightweight; colours use a colour-blind-validated palette. |
| Validation | **Zod** on the server for every action | Forms post `FormData`; `src/server/zod.ts` coerces strings safely (money, %, dates). |
| Auth | **Built-in email + password sessions** (bcrypt, httpOnly cookie, hashed session tokens in the DB) | No paid or third-party service is required to run locally. Supabase Auth can replace `src/server/auth.ts` later without touching pages, because everything goes through `requireUser()` / `assertUser()`. |
| Files | Private local storage (`STORAGE_DIR`), served only via authenticated routes | Swap `src/server/storage.ts` for S3 / Cloudflare R2 / Supabase Storage in production (same 3-function interface). |
| Command menu | cmdk | Linear-style ⌘K. |
| Drag & drop | dnd-kit | Accessible (keyboard-capable) Kanban. |

## Data rules

- **Money is integer cents** (EUR). Parsing and formatting live only in `src/lib/money.ts`. VAT is computed per invoice line with half-up rounding and summed.
- **VAT rates are basis points** (18% = 1800) and configurable in Settings → Finance. Each invoice line carries its own rate, so mixed or zero-rated/reverse-charge invoices are supported.
- **Time zone:** timestamps are stored in UTC (`timestamptz`). Calendar dates (deadlines, invoice dates) use `@db.Date` and are interpreted as **Europe/Malta** days (`src/lib/dates.ts`). "Today" is always Malta's today.
- **Invoice status is split in two.** The stored status is only the lifecycle (`DRAFT`, `SENT`, `CANCELLED`). *Paid / Partially paid / Overdue* are **derived** from recorded payments and the due date (`paymentState()`), so a due date passing can never mark an invoice paid, and "overdue" is shown independently of partial payment.
- **Package progress is derived, never stored.** Each video has exactly one pipeline stage; each stage has a semantic *category* (Planned, Filmed, Editing, Awaiting approval, Approved, Delivered). Progress counts videos per category for a specific **package period**, so a video can't be counted twice and old periods never affect the current month. "Completed" (approved) is kept separate from "Delivered". Videos marked *extra* are tracked outside the included count.
- **Package periods** are generated per package (monthly retainers renew automatically). Closing a period applies the package's rollover rule (none / all / capped) to the next period's `rolledOverIn`.
- **Deadlines:** when a filming date is set, deadline = filming date + turnaround days. Turnaround resolves package → client → global default (7). A manual override always wins and is flagged.
- **Scripts are versioned.** Approvals always reference a frozen `ScriptVersion`. If the live script is edited after approval, it drops back to Draft and the UI flags the approved version as outdated.
- **Invoice numbers** are unique (DB constraint) and allocated atomically from Settings.
- **Nothing is deleted by accident.** Clients are archived (history kept); clients with invoices can't be hard-deleted (`onDelete: Restrict`).
- **Demo data** (if ever loaded) is flagged `isDemo` and can be removed in Settings → Data.

## Security model

- Roles: **Owner** (everything), **Admin** (everything except team management and hard deletes), **Team member** (production only: no money, settings, exports or imports). Defined in `src/lib/permissions.ts` and enforced server-side in every action and route; the UI also hides what a role can't use.
- Sessions: random 32-byte token in an httpOnly, SameSite=Lax cookie; only its SHA-256 hash is stored. Login is throttled.
- **Client portal / share links:** random token shown once; only its hash is stored. Links are scoped (whole client portal, or one script), can expire, and can be revoked. Every portal read and write re-resolves the token and checks the resource belongs to that link's client. Portal pages never expose internal notes, costs, expenses, margins or time entries.
- Files are never served statically; downloads check the session (and finance permission for receipts/invoice PDFs), or the portal token plus `visibleToClient`.
- **No outbound communication.** The app sends no emails, WhatsApp messages or payment reminders. `Settings.externalCommsEnabled` is a locked safety switch reserved for a future, explicitly authorised integration.

## Automations

Rules live in `src/server/automations`. They are idempotent (each alert has a `dedupeKey`), auto-resolve when their condition clears, can be toggled individually, and every run is recorded in `AutomationRun`. They run throttled when you open the app, and can be scheduled in production via `POST /api/cron/automations` with `Authorization: Bearer $CRON_SECRET` (or `pnpm automations`).

## Folder layout

```
prisma/            schema, migrations, config seed
src/app/(app)/     signed-in application pages
src/app/portal/    client portal (token-based, no login)
src/app/book/      public services & booking page
src/app/api/       search, files, exports, backup, cron
src/server/        server-only code: auth, actions, queries, automations
src/lib/           shared pure code: money, dates, permissions, domain logic
src/components/    UI primitives, shell, feature components
tests/             vitest unit tests for calculations and permissions
```

## Future integration seams

- **Google Calendar:** `CalendarEvent.externalSource/externalId` are reserved for two-way sync.
- **Google Sheets import:** the CSV importer's mapping layer accepts any tabular source; a Sheets connector can feed rows into the same pipeline.
- **Supabase:** point `DATABASE_URL` at Supabase Postgres; optionally swap auth and storage modules.
