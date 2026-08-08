---
name: Finance Intelli architecture
description: Full-stack personal finance OS — JWT auth, Drizzle+Postgres, Express API, React+Vite frontend.
---

## Stack
- **Frontend**: `artifacts/finance-intelli` — React + Vite + Wouter + Framer Motion + Recharts + shadcn/ui + Tailwind v4
- **Backend**: `artifacts/api-server` — Express + Drizzle ORM + bcryptjs + JWT (365-day, `localStorage('finance_token')`)
- **DB**: Replit Postgres via `lib/db`, schema in `lib/db/src/schema/`
- **Generated hooks**: `lib/api-client-react` (Orval/React Query from OpenAPI spec)

## Key decisions
- `bcryptjs` (pure JS) over native `bcrypt`
- JWT auth; token in localStorage; `setAuthTokenGetter` wired in `lib/api-client-react/src/custom-fetch.ts`
- `/goals`, `/budgets`, `/reminders`, `/categories` return plain arrays; `/transactions` returns `{ data: [...], total: N }`
- `/dashboard/recent-transactions` returns a plain array (NOT `{ data: [...] }`) — frontend must use `Array.isArray(recent) ? recent : []`
- Analytics SQL uses `date_trunc` not `to_char` (Drizzle parameterizes format strings)
- Calendar date formatting uses `getFullYear/getMonth/getDate` (local time), never `toISOString()` (shifts IST dates)
- Dark theme: deep navy-black `224 22% 6%`, primary emerald `158 72% 42%`
- Multi-user: signup enabled, `/auth/check` always returns `{ exists: true }`, `isSetup` concept removed

## Data isolation (implemented)
All 5 data tables (`transactions`, `budgets`, `goals`, `reminders`, `categories`) have a `profile_id INTEGER` column.
All routes scope reads/writes by `eq(table.profileId, req.user!.userId)`.
Categories table: unique constraint on `name` dropped; per-user upsert done via manual SELECT+INSERT check.
Reset route also scoped — only deletes the current user's data.

**Why:** Multi-user app needs isolation. The `profile_id` column was added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration.

## Health score formula (dashboard.ts)
Four components: savings rate (0–40), budget adherence (0–30), positive balance (0–20), has data this month (0–10).
Use `?? '--'` (nullish coalescing) NOT `|| '--'` on the frontend for zero-value score display.
