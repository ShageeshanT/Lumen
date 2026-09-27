import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "../columns";

/**
 * In-app notifications (the notifications center, SPEC C7.24). Phase 02
 * writes server offline, disk-full and update results here; Phase 08 adds
 * delivery to email, Discord, Slack and webhooks from the same rows.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id("ntf"),
    workspaceId: text("workspace_id").notNull(),
    // Null means every member of the workspace sees it.
    userId: text("user_id"),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    // A catalog error code the dashboard renders as a card.
    code: text("code"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    index("notifications_workspace_idx").on(t.workspaceId, t.createdAt),
    index("notifications_target_idx").on(t.targetType, t.targetId),
  ],
);

export type NotificationRow = typeof notifications.$inferSelect;
