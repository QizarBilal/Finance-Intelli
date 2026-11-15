import { getDatabase, getMongoClient } from "@workspace/db";

async function main() {
  const database = await getDatabase();
  const info = await database.admin().command({ buildInfo: 1 });
  const rawUri = process.env.MONGODB_URI;
  let host = "unknown";
  let deployment = "MongoDB";
  if (rawUri) {
    try {
      const parsed = new URL(rawUri);
      host = parsed.hostname;
      deployment = parsed.protocol === "mongodb+srv:" ? "MongoDB Atlas (SRV connection)" : "MongoDB connection";
    } catch {
      host = "URI could not be parsed; value was not printed";
    }
  }
  process.stdout.write(`${JSON.stringify({
    database: database.databaseName,
    deployment,
    host,
    serverVersion: info.version ?? "unknown",
  }, null, 2)}\n`);
  await (await getMongoClient()).close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown connection failure";
  process.stderr.write(`MongoDB check failed: ${message}\n`);
  process.exitCode = 1;
});
