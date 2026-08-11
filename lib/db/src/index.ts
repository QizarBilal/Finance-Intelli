import {
  type ClientSession,
  type Collection,
  type Db,
  type Document,
  MongoClient,
} from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE || "finance_intelli";

if (!uri) {
  throw new Error("MONGODB_URI must be set for the Finance Intelli API");
}

declare global {
  // eslint-disable-next-line no-var
  var __financeIntelliMongoClient: Promise<MongoClient> | undefined;
}

const clientPromise = globalThis.__financeIntelliMongoClient ?? new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 10_000,
  retryReads: true,
  retryWrites: true,
}).connect();

if (process.env.NODE_ENV !== "production") {
  globalThis.__financeIntelliMongoClient = clientPromise;
}

export const collections = {
  accounts: "accounts",
  accountBalanceSnapshots: "account-balance-snapshots",
  auditLogs: "audit-logs",
  budgets: "budgets",
  categories: "categories",
  categorizationRules: "categorization-rules",
  creditSnapshots: "credit",
  dashboardLayouts: "dashboard-layouts",
  goalContributions: "goal-contributions",
  goals: "goals",
  householdApprovals: "household-approvals",
  householdMembers: "household-members",
  households: "households",
  importBatches: "import-batches",
  investments: "investments",
  jobs: "jobs",
  monthlyReviews: "reviews",
  notificationPreferences: "notification-preferences",
  notifications: "notifications",
  profiles: "profiles",
  receipts: "receipts",
  reconciliations: "reconciliations",
  recurrenceRuns: "recurrence-runs",
  recurringRules: "recurring-rules",
  reminders: "reminders",
  savedViews: "saved-views",
  sessions: "sessions",
  subscriptions: "subscriptions",
  taxTags: "tax",
  transactions: "transactions",
} as const;

export type CollectionName = (typeof collections)[keyof typeof collections];
export type FinanceDocument = Document & { id?: number; createdAt?: Date; updatedAt?: Date };

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDatabase(): Promise<Db> {
  return (await clientPromise).db(databaseName);
}

export async function getCollection<T extends Document = FinanceDocument>(
  name: CollectionName,
): Promise<Collection<T>> {
  return (await getDatabase()).collection<T>(name);
}

export async function nextId(name: CollectionName, session?: ClientSession): Promise<number> {
  const counters = (await getDatabase()).collection<{ _id: string; value: number }>("counters");
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  if (!result) throw new Error(`Unable to allocate an id for ${name}`);
  return result.value;
}

export function withoutMongoId<T extends Document>(document: T | null): Omit<T, "_id"> | null {
  if (!document) return null;
  const { _id: _ignored, ...rest } = document;
  return rest as Omit<T, "_id">;
}

export function withoutMongoIds<T extends Document>(documents: T[]): Array<Omit<T, "_id">> {
  return documents.map((document) => withoutMongoId(document) as Omit<T, "_id">);
}

export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const client = await clientPromise;
  const session = client.startSession();
  try {
    let value!: T;
    await session.withTransaction(async () => {
      value = await operation(session);
    });
    return value;
  } finally {
    await session.endSession();
  }
}

export async function mongoHealthcheck(): Promise<void> {
  await (await getDatabase()).command({ ping: 1 });
}
