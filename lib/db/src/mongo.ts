import { MongoClient, type Db, type Document } from "mongodb";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set.");
const uri: string = process.env.MONGODB_URI;

const databaseName = process.env.MONGODB_DATABASE || "finance_intelli";
const globalCache = globalThis as typeof globalThis & {
  __financeMongo?: Promise<{ client: MongoClient; db: Db }>;
};

async function connect() {
  const client = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
  await client.connect();
  const db = client.db(databaseName);
  await Promise.all([
    db.collection("profiles").createIndex({ username: 1 }, { unique: true }),
    db.collection("profiles").createIndex({ email: 1 }, { unique: true, sparse: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("transactions").createIndex({ profileId: 1, date: -1 }),
    db.collection("accounts").createIndex({ profileId: 1, status: 1 }),
    db.collection("budgets").createIndex({ profileId: 1, archivedAt: 1 }),
    db.collection("goals").createIndex({ profileId: 1, archivedAt: 1 }),
    db.collection("reminders").createIndex({ profileId: 1, dueDate: 1 }),
  ]);
  return { client, db };
}

export function mongo(): Promise<{ client: MongoClient; db: Db }> {
  globalCache.__financeMongo ??= connect().catch(error => {
    delete globalCache.__financeMongo;
    throw error;
  });
  return globalCache.__financeMongo;
}

export async function nextId(name: string): Promise<number> {
  const { db } = await mongo();
  const result = await db.collection<{ _id: string; value: number }>("counters").findOneAndUpdate(
    { _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after" },
  );
  return Number(result?.value ?? 1);
}

export function publicDocument<T extends Document>(document: T | null): Omit<T, "_id"> | null {
  if (!document) return null;
  const { _id: _ignored, ...rest } = document;
  return rest as Omit<T, "_id">;
}
