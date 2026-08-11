---
description: Full-stack personal finance OS using MongoDB Atlas, Express, React, and Vite.
---

# Finance Intelli architecture

- Frontend: `artifacts/finance-intelli` — React, Vite, TanStack Query, Wouter, Tailwind CSS.
- Backend: `artifacts/api-server` — Express, bcryptjs, JWT authentication, and the official MongoDB Node.js driver.
- Database: MongoDB Atlas through `lib/db`, with pooled connections and collection/counter helpers.
- Validation: shared Zod contracts in `lib/api-spec`.
- Every financial query is scoped to the authenticated `profileId`.
- Transaction amounts are positive values; `type` and `direction` determine their financial effect.
- Soft-deleted or void transactions are excluded from balances, budgets, dashboards, analytics, and reports.
- Vercel builds the Vite client and exposes the Express serverless API under `/api`.
