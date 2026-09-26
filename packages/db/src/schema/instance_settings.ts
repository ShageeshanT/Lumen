import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { timestamps } from "../columns";

/**
 * Instance-wide settings (SPEC B6): base domain, SMTP, registration mode,
 * update channel, telemetry opt-in. A natural key-value table, so `key` is the
 * primary key instead of a generated id (docs/DECISIONS.md).
 */
export const instanceSettings = pgTable("instance_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  ...timestamps(),
});

export type InstanceSetting = typeof instanceSettings.$inferSelect;
export type NewInstanceSetting = typeof instanceSettings.$inferInsert;
