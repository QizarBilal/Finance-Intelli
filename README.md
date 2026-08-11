<div align="center">

<img src="docs/readme/hero.svg" alt="Finance Intelli — personal finance intelligence by Mohammed Qizar Bilal" width="100%" />

<br />

[![Live App](https://img.shields.io/badge/Live_App-finance--intelli.vercel.app-ff334e?style=for-the-badge&logo=vercel&logoColor=white)](https://finance-intelli.vercel.app/)
[![React](https://img.shields.io/badge/React_19-20232a?style=for-the-badge&logo=react&logoColor=61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vercel](https://img.shields.io/badge/Deployed_on_Vercel-000?style=for-the-badge&logo=vercel)](https://vercel.com/)

### Your money, translated into clarity.

Finance Intelli is a full-stack personal finance operating system for tracking accounts, transactions, budgets, goals, reminders, cash flow, and long-term financial health from one polished workspace.

[Explore the live product](https://finance-intelli.vercel.app/) · [Architecture](#-architecture) · [Run locally](#-local-development) · [Meet the creator](#-crafted-by-mohammed-qizar-bilal)

</div>

---

## ✦ The product at a glance

| Financial command | What Finance Intelli delivers |
|---|---|
| **See** | Dynamic balances, income, expenses, savings rate, health score, and recent activity |
| **Understand** | Cash-flow trends, category distribution, calendar heatmaps, and savings growth |
| **Control** | Category-aware budgets, thresholds, recurring activity, and account management |
| **Plan** | Goals, reminders, reports, wealth views, and an actionable financial command centre |
| **Protect** | Profile-scoped records, soft deletion, audit history, secure sessions, and validated ledger writes |

> **Design philosophy:** serious financial data should feel calm, legible, and actionable—not like a spreadsheet wearing a dashboard.

## ◈ Product tour

### Financial command dashboard

Real-time financial KPIs, a 30-day cash-flow narrative, health scoring, smart insights, and recent transactions—designed to answer “How am I doing?” in seconds.

<img src="docs/readme/dashboard.png" alt="Finance Intelli dashboard with balance, income, expenses, cash flow and health score" width="100%" />

### Daily money map

The Financial Calendar turns every date into an inspectable income/expense story, with day-level totals and transaction details.

<img src="docs/readme/calendar.png" alt="Finance Intelli financial calendar with daily income and expense activity" width="100%" />

### Category-aware budget control

Budgets automatically measure qualifying expenses by period and category, including backward-compatible matching for previously created named budgets.

<img src="docs/readme/budgets.png" alt="Finance Intelli category budget cards and overall usage" width="100%" />

## ◎ Core capabilities

<table>
<tr><td width="50%" valign="top">

### Dashboard intelligence

- Today, weekly, monthly, and yearly rollups
- Net-worth-aware account aggregation
- Cash-flow charts with resilient numeric formatting
- Savings rate and financial health scoring
- Recent activity and personalized insights

</td><td width="50%" valign="top">

### Transaction ledger

- Income, expense, and balanced transfers
- Categories, merchants, tags, notes, and status
- Search, filtering, sorting, and pagination
- Soft deletion and optimistic version checks
- Per-user category normalization

</td></tr>
<tr><td width="50%" valign="top">

### Budgets & planning

- Daily, weekly, monthly, yearly, and custom periods
- Category-specific or all-expense tracking
- Usage thresholds and remaining-budget indicators
- Financial goals and recurring contributions
- Bills, reminders, and forward planning

</td><td width="50%" valign="top">

### Accounts & analytics

- Bank, cash, card, loan, investment, and wallet accounts
- Create, edit, archive/delete, transfer, and reconcile
- Income-versus-expense and net-savings charts
- Category distribution and spending heatmaps
- Calendar, wealth, and downloadable report views

</td></tr>
</table>

## ⟳ How money flows through the system

```mermaid
flowchart LR
    A["User action"] --> B["React + TanStack Query"]
    B --> C["Typed API client"]
    C --> D["Express API"]
    D --> E["Authentication + validation"]
    E --> F["Ledger service"]
    F --> G[("PostgreSQL / Drizzle")]
    G --> H["Financial aggregations"]
    H --> I["Dashboard • Budgets • Analytics"]

    style A fill:#ff334e,color:#fff,stroke:#ff334e
    style G fill:#111827,color:#fff,stroke:#64748b
    style I fill:#12372d,color:#fff,stroke:#18d99b
```

### Transaction-to-insight workflow

```mermaid
sequenceDiagram
    actor User
    participant UI as Finance Intelli UI
    participant API as Express API
    participant Ledger as Ledger & Categories
    participant DB as Financial Database

    User->>UI: Add or edit a transaction
    UI->>API: Validated typed request
    API->>Ledger: Normalize type, direction & category
    Ledger->>DB: Atomic profile-scoped write
    DB-->>Ledger: Stored ledger entry
    Ledger-->>API: Serialized transaction
    API-->>UI: Refresh dependent queries
    UI->>API: Request dashboard, budgets & analytics
    API->>DB: Aggregate non-void financial activity
    DB-->>UI: Updated financial intelligence
```

## ⬡ Architecture

```text
Finance-Intelli/
├── api/                              # Vercel serverless entry point
├── artifacts/
│   ├── api-server/                   # Express API application
│   │   └── src/
│   │       ├── lib/                  # Finance, dates, accounts, audit helpers
│   │       ├── middlewares/          # Authentication and request guards
│   │       └── routes/               # REST endpoints and aggregations
│   ├── finance-intelli/              # React + Vite web application
│   │   └── src/
│   │       ├── components/           # UI primitives and application layout
│   │       ├── hooks/                # Shared React behaviors
│   │       ├── lib/                  # Client utilities
│   │       └── pages/                # Product surfaces and workflows
│   └── mockup-sandbox/               # Isolated UI exploration workspace
├── lib/
│   ├── api-client-react/             # Generated TanStack Query client
│   ├── api-spec/                     # OpenAPI source of truth
│   ├── api-zod/                      # Generated runtime validation schemas
│   └── db/                           # Drizzle schema and migrations
├── scripts/                          # Workspace and migration utilities
├── docs/readme/                      # README artwork and product screenshots
├── pnpm-workspace.yaml               # Monorepo package map
└── vercel.json                       # Production routing and build config
```

## ⚙ Technology map

| Layer | Technology | Responsibility |
|---|---|---|
| Experience | React 19, Vite, Wouter, Tailwind CSS, shadcn/ui | Responsive application shell and feature pages |
| Motion & data | Framer Motion, Recharts, TanStack Query | Interaction, visualization, caching, invalidation |
| API | Express 5, Zod/OpenAPI-generated contracts | Authenticated endpoints and input validation |
| Persistence | Drizzle ORM, PostgreSQL | Profile-scoped ledger and financial records |
| Security | JWT sessions, secure cookies, Helmet, CORS, rate limiting | Session integrity and production hardening |
| Delivery | pnpm workspaces, TypeScript, Vercel | Reproducible builds and serverless deployment |

> **MongoDB Atlas note:** Atlas variables and migration guidance are included for the planned repository migration. The active ledger implementation in this codebase currently uses PostgreSQL through Drizzle; switching databases requires a reconciled data migration, not only an environment-variable change.

## ▶ Local development

### Prerequisites

- Node.js 24+
- pnpm 11+
- PostgreSQL database

### 1. Clone and install

```bash
git clone https://github.com/QizarBilal/Finance-Intelli.git
cd Finance-Intelli
pnpm install --frozen-lockfile
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Set a strong `SESSION_SECRET`, the permitted `ALLOWED_ORIGINS`, and the active database connection. Never commit production credentials.

### 3. Run the applications

```bash
# API
pnpm --filter @workspace/api-server dev

# Web app (separate terminal)
pnpm --filter @workspace/finance-intelli dev
```

### 4. Verify before shipping

```bash
pnpm run typecheck
pnpm test
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/finance-intelli run build
```

## ☁ Deployment

```mermaid
flowchart LR
    A["Push to main"] --> B["Vercel build"]
    B --> C["Vite production bundle"]
    B --> D["Express serverless function"]
    C --> E["Global static delivery"]
    D --> F["Authenticated /api routes"]
    F --> G[("Production database")]
```

The root `vercel.json` builds the web artifact, maps `/api/*` to the Express function, preserves SPA routing, and applies long-lived caching to fingerprinted assets.

## ✓ Engineering principles

- **Financial correctness first** — transfers balance, void/deleted entries are excluded, and aggregation rules stay explicit.
- **No surprise data loss** — transactions are soft-deleted and accounts with history are archived.
- **Multi-user isolation** — reads and writes are scoped to the authenticated profile.
- **Typed boundaries** — OpenAPI, generated clients, and runtime schemas reduce contract drift.
- **Timezone-safe dates** — financial periods respect the user’s IANA timezone and configured week start.
- **Accessible, responsive UI** — keyboard-friendly primitives and adaptive layouts across desktop and mobile.

## ◇ Roadmap ideas

- Complete the reconciled PostgreSQL-to-MongoDB Atlas repository migration
- Expand automated aggregation and route integration coverage
- Add CSV/OFX bank import with duplicate detection
- Introduce configurable dashboard widgets and richer forecasting
- Add CI quality gates, dependency scanning, and preview smoke tests

## ♡ Crafted by Mohammed Qizar Bilal

<div align="center">

### **Mohammed Qizar Bilal**

Builder of thoughtful digital products where engineering, design, and practical intelligence meet.

[![GitHub](https://img.shields.io/badge/GitHub-QizarBilal-181717?style=for-the-badge&logo=github)](https://github.com/QizarBilal)
[![Live Project](https://img.shields.io/badge/Experience-Finance_Intelli-ff334e?style=for-the-badge&logo=vercel&logoColor=white)](https://finance-intelli.vercel.app/)

<sub>Designed and engineered with care, curiosity, and a belief that better information creates better decisions.</sub>

</div>

---

<div align="center">

If Finance Intelli inspires you, consider giving the repository a ⭐

**© 2026 Mohammed Qizar Bilal. Built with purpose.**

</div>
