import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "../columns";

/**
 * Single-use join tokens (SPEC B6 `server_join_tokens`, B12). The token is
 * 32 random bytes shown once; only its SHA-256 is stored. It expires after an
 * hour and `used_at` is set in the same transaction that creates the server.
 */
export const serverJoinTokens = pgTable(
  "server_join_tokens",
  {
    id: id("jtk"),
    workspaceId: text("workspace_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    // What the wizard asked for; copied onto the server at join.
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    labels: text("labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    serverId: text("server_id"),
    createdBy: text("created_by").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("server_join_tokens_hash_idx").on(t.tokenHash),
    index("server_join_tokens_workspace_idx").on(t.workspaceId),
  ],
);

export type ServerJoinTokenRow = typeof serverJoinTokens.$inferSelect;
