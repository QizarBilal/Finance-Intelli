import { auditLogsTable, db } from "@workspace/db";
import type { Request } from "express";

function safeJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value, (key, item) => {
    if (/password|token|secret|receipt/i.test(key)) return "[REDACTED]";
    return item;
  });
}

export async function writeAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string | number | null,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    profileId: req.user?.userId ?? null,
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    beforeJson: safeJson(before),
    afterJson: safeJson(after),
    ipAddress: req.ip,
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
  });
}
