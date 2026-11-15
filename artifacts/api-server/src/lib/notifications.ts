import webpush from "web-push";
import { collections, getCollection, nextId } from "@workspace/db";

let sourceIndexReady: Promise<void> | null = null;

export async function notifyUser(profileId: number, title: string, message: string, href = "/studio") {
  const now = new Date();
  const notifications = await getCollection(collections.notifications);
  const notification = {
    id: await nextId(collections.notifications), profileId, title, message,
    type: "account", href, readAt: null, createdAt: now, updatedAt: now,
  };
  await notifications.insertOne(notification);
  await sendPush(profileId, { title, body: message, url: href });
  return notification;
}

export async function notifyUserOnce(profileId: number, sourceKey: string, title: string, message: string, href: string) {
  const notifications = await getCollection(collections.notifications);
  sourceIndexReady ??= notifications.createIndex({ profileId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: "string" } }, name: "profile_notification_source_unique" }).then(() => undefined).catch(error => { sourceIndexReady = null; throw error; });
  await sourceIndexReady;
  const now = new Date();
  const result = await notifications.updateOne(
    { profileId, sourceKey },
    { $setOnInsert: { id: await nextId(collections.notifications), profileId, sourceKey, title, message, type: "alert", href, readAt: null, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  if (result.upsertedCount) await sendPush(profileId, { title, body: message, url: href });
  return Boolean(result.upsertedCount);
}

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function sendPush(profileId: number, payload: { title: string; body: string; url?: string }) {
  if (!pushConfigured()) return;
  const subscriptions = await getCollection(collections.pushSubscriptions);
  const rows = await subscriptions.find({ profileId }).toArray();
  await Promise.all(rows.map(async (row: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: row.keys },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "normal", vapidDetails: {
          subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!,
        } },
      );
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) await subscriptions.deleteOne({ id: row.id, profileId });
    }
  }));
}
