import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type DbHandle } from "./client";
import { runMigrations } from "./migrate";
import { instanceSettings } from "./schema/index";

const databaseUrl = process.env["DATABASE_URL"];
const schemaName = `test_${Date.now().toString(36)}_${process.pid.toString(36)}`;

function withSearchPath(url: string, schema: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}options=-c%20search_path%3D${schema}`;
}

describe.skipIf(databaseUrl === undefined)(
  "migrations against Postgres (needs DATABASE_URL)",
  () => {
    let handle: DbHandle;
    let scopedUrl: string;
    let firstRun: { applied: number };

    beforeAll(async () => {
      if (databaseUrl === undefined) {
        throw new Error("DATABASE_URL is required");
      }
      const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      await admin.query(`create schema "${schemaName}"`);
      await admin.end();

      scopedUrl = withSearchPath(databaseUrl, schemaName);
      firstRun = await runMigrations(scopedUrl, { migrationsSchema: schemaName });
      handle = createDb(scopedUrl, { max: 2 });
    });

    afterAll(async () => {
      await handle.close();
      if (databaseUrl === undefined) {
        return;
      }
      const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      await admin.query(`drop schema "${schemaName}" cascade`);
      await admin.end();
    });

    it("applies the migration on an empty database", () => {
      expect(firstRun.applied).toBe(1);
    });

    it("creates instance_settings and stores a row", async () => {
      await handle.db
        .insert(instanceSettings)
        .values({ key: "base_domain", value: { host: "apps.example.com" } });
      const rows = await handle.db.select().from(instanceSettings);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.key).toBe("base_domain");
      expect(rows[0]?.value).toEqual({ host: "apps.example.com" });
      expect(rows[0]?.createdAt).toBeInstanceOf(Date);
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
    });

    it("is a no-op the second time", async () => {
      const second = await runMigrations(scopedUrl, { migrationsSchema: schemaName });
      expect(second.applied).toBe(0);
    });

    it("rejects an unsafe migrations schema name", async () => {
      await expect(runMigrations(scopedUrl, { migrationsSchema: 'x"; drop' })).rejects.toThrow(
        /Invalid migrations schema name/,
      );
    });
  },
);
