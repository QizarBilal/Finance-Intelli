# Vercel and MongoDB Atlas deployment

## Vercel

1. Import this repository into Vercel and keep the repository root as the project root.
2. Add `SESSION_SECRET`, `ALLOWED_ORIGINS`, `MONGODB_URI`, and `MONGODB_DATABASE` to Production, Preview, and Development environments.
3. Generate `SESSION_SECRET` with a cryptographically secure generator and use at least 32 characters.
4. Set `ALLOWED_ORIGINS` to the production URL. Add preview URLs deliberately instead of using a wildcard.
5. Deploy. `vercel.json` builds the Vite application and exposes the Express API through `/api`.

## MongoDB Atlas

1. Create an Atlas Free, Flex, or Dedicated cluster and a least-privilege database user.
2. Copy the `mongodb+srv` driver URI into `MONGODB_URI`; do not store it in source control.
3. Use `finance_intelli` for `MONGODB_DATABASE`, or set another explicit database name.
4. Configure Atlas Network Access for the deployment environment and keep TLS enabled.
5. Enable Atlas backups and monitor collection counts and ledger totals after each deployment.

The API reads and writes the existing Atlas collections directly. Deployments do not run destructive data migrations.
