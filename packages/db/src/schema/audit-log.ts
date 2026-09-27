import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "../columns";

/**
 * Audit log (SPEC B6 `audit_log`): one row per mutation. Phase 02 records
 * server and join-token mutations with the instance-admin actor; Phase 04
 * adds user actors and the read API, and must keep these columns.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id("aud"),
    workspaceId: text("workspace_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    ...timestamps(),
  },
  (t) => [index("audit_log_workspace_idx").on(t.workspaceId, t.createdAt)],
);
