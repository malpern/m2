# Matt Scheduler — Web App

## Stack
- Next.js 16 (App Router, React Server Components)
- shadcn/ui + Tailwind CSS v4
- Drizzle ORM over libSQL — Turso in production, a local SQLite file in development
- Vitest for testing

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npx drizzle-kit push` — apply `src/db/schema.ts` to whatever `TURSO_DATABASE_URL` points at
- `npx tsx src/db/seed.ts` — seed mock data

## Testing Rules

**Every new feature must include unit tests.** This is a hard requirement.

- Test files live next to the code they test: `foo.ts` → `foo.test.ts`
- Use Vitest (`describe`, `it`, `expect`) — not Jest
- Database tests use `createTestDb()` from `@/test/db` — in-memory SQLite whose schema is
  generated from `src/db/schema.ts` at import time, so it cannot drift from production
- Business logic should be extracted into `src/lib/` so it's testable without server components
- Run `npm test` before committing — all tests must pass
- When adding a new server action, test the underlying logic (not the action itself, since those need Next.js runtime)

## Project Structure
- `src/app/` — Next.js pages and server actions
- `src/components/` — shared UI components
- `src/db/` — Drizzle schema, database connection, seed script
- `src/lib/` — business logic (priority ranking, scheduling rules, etc.)
- `src/proxy.ts` — the password gate. Next 16 renamed the `middleware` file convention
  to `proxy`; the matcher and `NextResponse` behaviour are unchanged.
- `src/test/` — test helpers (setup, test DB factory)

## Priority Ranking Algorithm
The priority sort is in `src/lib/priority.ts`. Order:
1. Manual `sortOrder` (drag-to-reorder) overrides everything when set
2. `collegeBound` — true ranks above false
3. `gradeLevel` — senior > junior > sophomore > freshman > adult
4. `behaviorScore` — higher is better (tiebreaker)

## Scheduled jobs

Only two of the four `/api/cron/*` routes are scheduled, in `vercel.json`:

| Route | Schedule (UTC) | Local | Writes to the DB? |
|---|---|---|---|
| `session-reminders` | `0 14 * * *` | 07:00 PT | no |
| `daily-digest` | **unscheduled** | — | no |
| `send-waves` | **unscheduled** | — | **yes** |
| `follow-ups` | **unscheduled** | **—** | **yes** |

`daily-digest` is unscheduled by choice, not by hazard. It only reads, but it
texts and emails `ALERT_PHONE`/`ALERT_EMAIL` — Micah's own number, which is on the
dev allowlist, so unlike the client-facing routes it is *not* suppressed by
`OUTREACH_LIVE`. Nightly notifications about a system with no live outreach yet
are noise. Re-add it when outreach is live and the digest has something to say.

Vercel injects `Authorization: Bearer $CRON_SECRET` on cron invocations, which is what
each route checks. With `CRON_SECRET` unset the routes fail closed and every invocation
returns 401 — correct, but it means the jobs silently do nothing.

### The other two are still unscheduled, but the reason has changed

**#227 is fixed.** `sendSMS` now returns a discriminated `SendResult`, and every caller
that records outreach state demotes the row to `pending` when a send is skipped or
fails. A row therefore only reaches `awaiting_reply` if a message actually went out, so
`follow-ups` can no longer expire a phantom row and cancel the session behind it. That
specific hazard is closed structurally, not by a guard.

They stay unscheduled for a different and simpler reason: **there is nothing useful for
them to do yet.** `OUTREACH_LIVE` is off, and 55 of the 56 clients in production have no
phone number at all — `phone IS NULL` since #221/#222 replaced the `+15550000000`
placeholder — so `send-waves` would skip every one of them on the dev guard and write
nothing. Schedule them once #17 lands and outreach is genuinely live, and note that
`follow-ups` cancelling an unanswered session is then *correct* behaviour, so turn it on
deliberately rather than as an afterthought.

## Google Calendar — reads and writes target DIFFERENT calendars

This is deliberate now, but it was an accident until 2026-08-29 and is easy to
misread, so it is written down.

| | Env var | Falls back to |
|---|---|---|
| **Reads** (`listEvents`) | `GOOGLE_CALENDAR_EMAIL` | `f4lathletics@gmail.com` — Matt's own booking calendar, which Acuity syncs into |
| **Writes** (`createCalendarEvent`, attendee patches, deletes) | `GOOGLE_CALENDAR_ID` | `"primary"` — whatever account is connected |

Reads point at Matt's calendar because that is where the truth about what actually
happened lives — it is what `getOpenSlots` uses for conflict detection and what the
reconciler in `calendar-match.ts` reads.

Writes point at **"Micah - M2 Performance & Therapy"** (`GOOGLE_CALENDAR_ID`, set in
Vercel), so sessions m2 creates stay separate from Matt's own bookings instead of being
mixed into them.

**Two traps here, both already hit:**

- **`"primary"` is not a calendar, it is "whoever is connected".** The app authenticates
  as `malpern@gmail.com`, so before `GOOGLE_CALENDAR_ID` was set, a confirmed session
  would have written a client's training session into Micah's personal calendar. The
  first symptom of this class of mistake, back on 2026-05-30, was
  `GCal create failed: You need to have writer access to this calendar` — the account
  had only reader access to the calendar it was asked to write to.
- **Reads and writes are configured by different variables.** Setting one does not move
  the other. If the intent ever becomes "one calendar for everything", both must change.

Connected-account access matters as much as the ID: `malpern@gmail.com` is `reader` on
`f4lathletics@gmail.com` and `owner` on the M2 calendar. Reads work either way; writes
need owner or writer.

## Database
`src/db/schema.ts` is the single source of truth. The connection is libSQL
(`@libsql/client`), built lazily in `src/db/index.ts` from `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` — lazily so that `next build` can collect routes without database
credentials present.

There are three databases, all the same schema:

| Where | What | Set by |
|---|---|---|
| **Production** | Turso, over the network | `TURSO_DATABASE_URL` in the Vercel project |
| **Local dev** | a plain file — libSQL accepts `file:` URLs, so no Turso account is needed | `TURSO_DATABASE_URL=file:./m2-dev.db` in `web/.env.local` (untracked) |
| **Tests** | in-memory, schema generated from `schema.ts` at import time | `createTestDb()` in `src/test/db.ts` |

Build or reset a local database from scratch:

```bash
rm -f m2-dev.db \
  && TURSO_DATABASE_URL=file:./m2-dev.db npx drizzle-kit push --force \
  && TURSO_DATABASE_URL=file:./m2-dev.db npx tsx src/db/seed.ts
```

Both env assignments are needed: `drizzle.config.ts` and `seed.ts` are plain Node, so
neither reads `.env.local` the way Next does.

**Restart `npm run dev` after rebuilding the file.** The running server holds an open
handle to the deleted inode, so every page 500s with `no such column` against a database
that is demonstrably correct when you inspect it with `sqlite3`. The error points at the
schema; the cause is the stale connection.

### Schema changes reach production only by hand

There is **no `drizzle/` migrations directory and no migrate step in the build**, so
`drizzle-kit push` against production is a deliberate, manual act, and nothing verifies
that the deployed code and the production schema agree. Treat a schema change as two
separate deployments: the code, and the database.

Production was reconciled on 2026-08-29 (#222). It had drifted badly while deploys were
broken — **none of the 23 indexes existed**, and `clients.phone` was still `NOT NULL`.
Two things that cost time and are worth knowing before the next push:

- **`drizzle-kit push` cannot always do it in one pass.** Adding a `UNIQUE` index while
  duplicate values exist fails, so the data has to be fixed first, in its own step.
- **Rebuilding a table that others reference needs `PRAGMA foreign_keys=OFF` on a
  persistent connection.** SQLite cannot `ALTER COLUMN`, so a nullability change is
  create-copy-drop-rename — and `DROP TABLE` is blocked by the foreign keys from
  `sessions`, `packages`, `outreach` and `weekly_skips`. A libSQL `batch()` will NOT
  work for this: it wraps the statements in a transaction, where the pragma is ignored.
  Issue the statements individually on one client, and check `PRAGMA foreign_key_check`
  and `sqlite_sequence` afterwards — the latter carries the autoincrement counter and a
  careless rebuild resets it, silently reusing ids.

Still divergent, deliberately: `clients.created_at`, `clients.updated_at` and
`sessions.created_at` are nullable in production where the schema says `NOT NULL`. Zero
rows violate it; fold the fix into the next change that needs a rebuild anyway.

`better-sqlite3` is used *only* by `src/test/db.ts`; nothing in `src/app` or `src/lib`
imports it, and it is declared as a devDependency. Note it is still installed by
`npm ci --omit=dev` regardless, because drizzle-orm pulls it in as a peer.
