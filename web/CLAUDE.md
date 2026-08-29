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
- `src/test/` — test helpers (setup, test DB factory)

## Priority Ranking Algorithm
The priority sort is in `src/lib/priority.ts`. Order:
1. Manual `sortOrder` (drag-to-reorder) overrides everything when set
2. `collegeBound` — true ranks above false
3. `gradeLevel` — senior > junior > sophomore > freshman > adult
4. `behaviorScore` — higher is better (tiebreaker)

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

### Schema changes reach production only by hand

There is **no `drizzle/` migrations directory and no migrate step in the build**, so
`drizzle-kit push` against production is a deliberate, manual act. Nothing verifies that
the deployed code and the production schema agree, and as of 2026-08-28 they do not —
see #222. Treat a schema change as two separate deployments: the code, and the database.

`better-sqlite3` is used *only* by `src/test/db.ts`; nothing in `src/app` or `src/lib`
imports it. (It currently sits in `dependencies` rather than `devDependencies`.)
