import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Operation ids the control plane has already processed per server, kept
 * 24 hours so a re-delivered message is handled once (PHASE-02 §5). A
 * natural composite key replaces the generated id (DECISIONS, like 0018).
 */
export const agentOps = pgTable(
  "agent_ops",
  {
    serverId: text("server_id").notNull(),
    opId: text("op_id").notNull(),
    kind: text("kind").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.opId] }),
    index("agent_ops_received_idx").on(t.receivedAt),
  ],
);
