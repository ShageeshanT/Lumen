import { auditLog, type Db } from "@lumen/db";

export interface AuditEntry {
  workspaceId: string;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Records one mutation (CLAUDE.md: audit log for every mutation). Metadata
 * must never carry secrets; callers pass names and ids only.
 */
export async function recordAudit(db: Pick<Db, "insert">, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    workspaceId: entry.workspaceId,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.metadata ?? null,
    ip: entry.ip ?? null,
  });
}
