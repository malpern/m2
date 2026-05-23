# Matt Scheduler — Web App

## Stack
- Next.js 15 (App Router, React Server Components)
- shadcn/ui + Tailwind CSS v4
- Drizzle ORM + SQLite (better-sqlite3)
- Vitest for testing

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npx drizzle-kit push` — push schema changes to SQLite
- `npx tsx src/db/seed.ts` — seed mock data

## Testing Rules

**Every new feature must include unit tests.** This is a hard requirement.

- Test files live next to the code they test: `foo.ts` → `foo.test.ts`
- Use Vitest (`describe`, `it`, `expect`) — not Jest
- Database tests use `createTestDb()` from `@/test/db` (in-memory SQLite)
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
SQLite file at `matt_scheduler.db` in the web root. Schema changes go in `src/db/schema.ts` and are pushed with `npx drizzle-kit push`.
