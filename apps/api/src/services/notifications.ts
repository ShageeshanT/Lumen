import { notifications, type Db } from "@lumen/db";
import { makeError, type ErrorContext, type LumenErrorCode } from "@lumen/shared";

export interface NotifyInput {
  workspaceId: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  code: LumenErrorCode;
  ctx?: ErrorContext;
  targetType: string;
  targetId: string;
  data?: Record<string, unknown>;
}

/**
 * Writes an in-app notification row with catalog copy. External delivery
 * (email, Discord, Slack, webhooks) reads these rows in Phase 08.
 */
export async function notify(db: Pick<Db, "insert">, input: NotifyInput): Promise<void> {
  const err = makeError(input.code, input.ctx ?? {});
  await db.insert(notifications).values({
    workspaceId: input.workspaceId,
    kind: input.kind,
    severity: input.severity,
    code: input.code,
    title: err.title,
    body: `${err.explanation} ${err.fix}`,
    targetType: input.targetType,
    targetId: input.targetId,
    data: input.data ?? null,
  });
}
