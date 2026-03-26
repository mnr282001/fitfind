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

## Monitoring Token Spend And Errors

- Apply latest migration: `supabase/migrations/20260326130000_monitoring.sql`
- Apply admin migration: `supabase/migrations/20260326133000_admin_users.sql`
- Token usage and cost estimates are logged to `token_usage_events`.
- API failures are logged to `api_error_events`.
- `GET /api/monitoring/summary` is admin-only.
- Grant admin by inserting a profile id into `admin_users`.
- Admin dashboard page: `/admin` (admin-only).

Optional env vars for price estimation:

- `GEMINI_INPUT_USD_PER_1M` (default: `0.3`)
- `GEMINI_OUTPUT_USD_PER_1M` (default: `2.5`)

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
