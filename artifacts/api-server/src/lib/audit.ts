import { collections, getCollection, nextId } from "@workspace/db";
import type { Request } from "express";

function safeJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value, (key, item) => /password|token|secret|receipt/i.test(key) ? "[REDACTED]" : item);
}

export async function writeAudit(req: Request, action: string, entityType: string, entityId: string | number | null, before?: unknown, after?: unknown): Promise<void> {
  const auditLogs = await getCollection(collections.auditLogs);
  const now = new Date();
  await auditLogs.insertOne({
    id: await nextId(collections.auditLogs), profileId: req.user?.userId ?? null, action, entityType,
    entityId: entityId == null ? null : String(entityId), beforeJson: safeJson(before), afterJson: safeJson(after),
    ipAddress: req.ip, userAgent: req.get("user-agent")?.slice(0, 500) ?? null, createdAt: now, updatedAt: now,
  });
}
