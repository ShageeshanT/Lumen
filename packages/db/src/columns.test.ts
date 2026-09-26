import { getTableColumns } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { id, timestamps } from "./columns";

const sample = pgTable("sample", {
  id: id("prj"),
  name: text("name").notNull(),
  ...timestamps(),
});

describe("column helpers", () => {
  it("generates prefixed ids by default", () => {
    const columns = getTableColumns(sample);
    expect(columns.id.primary).toBe(true);
    const generated = columns.id.defaultFn?.();
    expect(generated).toMatch(/^prj_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("names the timestamp columns after SPEC B6", () => {
    const columns = getTableColumns(sample);
    expect(columns.createdAt.name).toBe("created_at");
    expect(columns.updatedAt.name).toBe("updated_at");
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.updatedAt.onUpdateFn?.()).toBeInstanceOf(Date);
  });
});
