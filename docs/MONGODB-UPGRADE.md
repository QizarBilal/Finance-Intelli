# MongoDB connection and upgrade

Finance Intelli uses MongoDB Atlas in the documented deployment setup. The application database is selected with `MONGODB_DATABASE`; when that setting is absent, the app uses `finance_intelli`. The Atlas URI belongs in the runtime secret `MONGODB_URI` and must never be committed or pasted into chat.

## Identify the live connection

Run this in the same environment where the API receives its MongoDB secrets:

```sh
pnpm --filter @workspace/scripts mongodb:info
```

The command prints the database name, sanitized host, whether the URI is an Atlas SRV connection, and MongoDB server version. It never prints the username, password, or URI query parameters. The local project copy does not include the runtime URI, so running it on a machine without the configured secret will fail with a missing-URI message.

## Upgrade the MongoDB server in Atlas

1. Run the connection check above and record the server version and cluster name.
2. Confirm the Atlas cluster has a recent backup or snapshot and that point-in-time recovery is configured if the plan supports it.
3. Upgrade a staging cluster first, deploy Finance Intelli against it, and verify login, transaction reads/writes, imports, transfers, reports, and the API health check.
4. In Atlas, open the cluster’s configuration and review the available MongoDB server upgrade target. Choose only a version allowed by Atlas for that cluster and follow the version-specific upgrade path. Do not skip required major versions.
5. After staging works, repeat the upgrade for production during a planned low-traffic window, then redeploy/restart the API and monitor Atlas and application logs.

The application MongoDB Node.js driver is pinned to 7.9.0 in both database packages. Its minimum Node.js runtime is 20.19.0; this project’s Replit configuration uses Node 24. The application database server is a separate Atlas setting and cannot be upgraded from this repository. A server upgrade should be selected only after the live cluster version and available Atlas target are known.
