import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type DbHandle } from "./client";
import { runMigrations } from "./migrate";
import { instanceSettings, serverJoinTokens, servers } from "./schema/index";

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

    it("applies the migrations on an empty database", () => {
      expect(firstRun.applied).toBe(2);
    });

    it("stores servers and join tokens and enforces status and provider values", async () => {
      const [server] = await handle.db
        .insert(servers)
        .values({
          workspaceId: "ws_01j8x9k2d3m4n5p6q7r8s9t0v1",
          name: "oracle-1",
          provider: "oracle",
          agentPublicKey: "pk",
          credentialHash: "hash",
          monthlyCost: 4.5,
        })
        .returning();
      expect(server?.id).toMatch(/^srv_/);
      expect(server?.status).toBe("pending");
      expect(server?.labels).toEqual([]);
      expect(server?.monthlyCost).toBe(4.5);
      expect(server?.diskLow).toBe(false);

      const [token] = await handle.db
        .insert(serverJoinTokens)
        .values({
          workspaceId: "ws_01j8x9k2d3m4n5p6q7r8s9t0v1",
          tokenHash: "abc",
          name: "oracle-1",
          provider: "oracle",
          expiresAt: new Date(Date.now() + 3_600_000),
          createdBy: "instance-admin",
        })
        .returning();
      expect(token?.id).toMatch(/^jtk_/);
      await expect(
        handle.db.insert(serverJoinTokens).values({
          workspaceId: "ws_01j8x9k2d3m4n5p6q7r8s9t0v1",
          tokenHash: "abc",
          name: "dup",
          provider: "aws",
          expiresAt: new Date(),
          createdBy: "instance-admin",
        }),
      ).rejects.toThrow();

      await expect(
        handle.db.insert(servers).values({
          workspaceId: "ws_x",
          name: "bad",
          status: "rebooting",
          agentPublicKey: "pk",
          credentialHash: "h",
        }),
      ).rejects.toThrow();
      await expect(
        handle.db.insert(servers).values({
          workspaceId: "ws_x",
          name: "bad",
          provider: "linode",
          agentPublicKey: "pk",
          credentialHash: "h",
        }),
      ).rejects.toThrow();
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
