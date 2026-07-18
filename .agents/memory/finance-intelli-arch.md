---
name: Finance Intelli Architecture
description: Key decisions and wiring for the Finance Intelli personal finance OS app.
---

## Stack
- Frontend: `artifacts/finance-intelli` — React + Vite, Wouter routing, Framer Motion, Recharts, shadcn/ui, dark mode default
- Backend: `artifacts/api-server` — Express, Drizzle ORM, bcryptjs, jsonwebtoken
- DB: Postgres via `lib/db`, Drizzle schema in `lib/db/src/schema/`
- Generated hooks: `lib/api-client-react` (React Query hooks from OpenAPI spec)
- Zod schemas: `lib/api-zod`

## Auth
- JWT stored in `localStorage('finance_token')`
- `SESSION_SECRET` env var used as JWT secret (falls back to hardcoded dev string)
- `requireAuth` middleware in `artifacts/api-server/src/middlewares/auth.ts`
- Single user — profile table has exactly one row; `/api/auth/check` returns `{exists: bool}`

## API routes
All under `/api/` prefix in `artifacts/api-server/src/routes/`:
- auth, transactions, categories, budgets, goals, reminders, dashboard, analytics, insights

## Token wiring
`artifacts/finance-intelli/src/lib/api-client.ts` calls `setAuthTokenGetter` from `@workspace/api-client-react/custom-fetch`

**Why:** The custom-fetch module must be exported as a subpath in `lib/api-client-react/package.json` — see the exports fix memory entry.

## DB schema tables
profile, transactions, categories, budgets, goals, reminders — all in `lib/db/src/schema/`

## bcrypt
Using `bcryptjs` (pure JS) instead of `bcrypt` (native) — avoids pnpm approve-builds requirement.

## Critical data-access patterns
- `/goals`, `/budgets`, `/reminders`, `/categories` return plain arrays — frontend must use `Array.isArray(data) ? data : []`, NOT `data?.data`
- `/transactions` returns `{ data: [...], total: N }` — use `data?.data`
- Dashboard/analytics endpoints return structured objects

## Analytics SQL
Never use `to_char(date, ${formatVar})` in Drizzle — the format string gets parameterized and Postgres rejects it. Use `date_trunc(${sql.raw("'day'")}, date::timestamp)::date` instead.

## Calendar timezone
Always use local-time date formatting (getFullYear/getMonth/getDate) not `toISOString()` which shifts IST dates back one day due to UTC midnight offset.
