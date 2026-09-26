import { text, timestamp } from "drizzle-orm/pg-core";

import { newId, type IdPrefix } from "@lumen/shared";

/** Text primary key generated in application code as `<prefix>_<ulid>` (SPEC B6 `id`). */
export function id(prefix: IdPrefix) {
  return text("id")
    .primaryKey()
    .$defaultFn(() => newId(prefix));
}

/** The `created_at` / `updated_at` pair every table carries (SPEC B6). */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  };
}
