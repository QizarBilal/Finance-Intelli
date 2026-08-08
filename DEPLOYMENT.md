# Vercel and MongoDB Atlas deployment

## Vercel

1. Import this repository into Vercel and keep the repository root as the project root.
2. Add `SESSION_SECRET`, `ALLOWED_ORIGINS`, and `DATABASE_URL` to Production, Preview, and Development environments. Add `MONGODB_URI` and `MONGODB_DATABASE` when the Atlas migration is activated.
3. Generate `SESSION_SECRET` with a cryptographically secure generator and use at least 32 characters.
4. Set `ALLOWED_ORIGINS` to the production URL. Add preview URLs deliberately instead of using a wildcard.
5. Deploy. `vercel.json` builds the Vite application and exposes the Express API through `/api`.

## MongoDB Atlas

1. Create an Atlas Free, Flex, or Dedicated cluster and a least-privilege database user.
2. Copy the `mongodb+srv` driver URI into `MONGODB_URI`; do not store it in source control.
3. Use `finance_intelli` for `MONGODB_DATABASE`, or set another explicit database name.
4. Configure Atlas Network Access for the deployment environment and keep TLS enabled.
5. Create backups before migrating production financial records and compare collection counts and ledger totals after migration.

The current ledger routes remain on PostgreSQL until the Atlas repository rewrite and reconciled data migration are completed. MongoDB Atlas is not wire-compatible with PostgreSQL/Drizzle, so replacing only the environment variable would corrupt or disable financial workflows. The application must not be pointed at an empty Atlas database until its PostgreSQL records have been migrated and financially reconciled.
