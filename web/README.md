This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Local CI checks (the green path)

Run all three from `web/`:

```bash
npm test         # vitest — uses an in-memory SQLite db, no env required
npm run lint     # eslint — must be error-free (warnings are allowed, see below)
npm run build    # next build — must succeed
```

### Environment

- **Tests** need no environment — they use an in-memory SQLite database via
  `createTestDb()`.
- **Build** needs no database environment. The libsql client is created lazily
  (see `src/db/index.ts`), so `next build` can collect routes without
  `TURSO_DATABASE_URL`. At **runtime**, a missing `TURSO_DATABASE_URL` throws a
  clear, actionable error rather than a cryptic `URL_INVALID`.
- **Dev/runtime** environment variables (set in `web/.env.local`) include
  `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`,
  the `GOOGLE_*` OAuth/Sheets values, and the `TWILIO_*` values. Auth gates
  fail closed when `APP_PASSWORD` / `CRON_SECRET` are absent.

### Lint policy

`npm run lint` must report **0 errors**. Remaining warnings (e.g. unused
imports) are intentionally not failing CI yet; clear them opportunistically.

### Workspace root

`next.config.ts` pins `turbopack.root` to this directory so Next does not infer
an unrelated parent lockfile as the workspace root.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
