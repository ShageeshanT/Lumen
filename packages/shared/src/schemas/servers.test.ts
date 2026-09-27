import { describe, expect, it } from "vitest";

import { newId } from "../ids";

import {
  AgentUpdateRequest,
  CreateJoinToken,
  PatchServer,
  PortCheckRequest,
  ServerId,
  WorkspaceId,
} from "./servers";

describe("server schemas", () => {
  const ws = newId("ws");

  it("validates join-token requests and defaults labels", () => {
    const parsed = CreateJoinToken.parse({
      workspace_id: ws,
      name: " oracle-1 ",
      provider: "oracle",
    });
    expect(parsed).toEqual({ workspace_id: ws, name: "oracle-1", provider: "oracle", labels: [] });
    expect(
      CreateJoinToken.safeParse({ workspace_id: "not-an-id", name: "x", provider: "oracle" })
        .success,
    ).toBe(false);
    expect(
      CreateJoinToken.safeParse({ workspace_id: ws, name: "", provider: "oracle" }).success,
    ).toBe(false);
    expect(
      CreateJoinToken.safeParse({ workspace_id: ws, name: "x", provider: "linode" }).success,
    ).toBe(false);
    expect(
      CreateJoinToken.safeParse({
        workspace_id: ws,
        name: "x",
        provider: "aws",
        labels: Array.from({ length: 21 }, () => "a"),
      }).success,
    ).toBe(false);
    expect(
      CreateJoinToken.safeParse({ workspace_id: ws, name: "a\u0007b", provider: "aws" }).success,
    ).toBe(false);
  });

  it("only allows the documented PATCH fields", () => {
    expect(PatchServer.parse({ name: "db-1", monthly_cost: null })).toEqual({
      name: "db-1",
      monthly_cost: null,
    });
    expect(PatchServer.safeParse({ status: "online" }).success).toBe(false);
    expect(PatchServer.safeParse({ public_ip: "1.2.3.4" }).success).toBe(false);
    expect(PatchServer.safeParse({ monthly_cost: -1 }).success).toBe(false);
  });

  it("defaults port checks to 80 and 443 and bounds them", () => {
    expect(PortCheckRequest.parse({})).toEqual({ ports: [80, 443] });
    expect(PortCheckRequest.safeParse({ ports: [0] }).success).toBe(false);
    expect(PortCheckRequest.safeParse({ ports: [] }).success).toBe(false);
    expect(
      PortCheckRequest.safeParse({ ports: Array.from({ length: 11 }, () => 80) }).success,
    ).toBe(false);
  });

  it("checks ids and versions", () => {
    expect(ServerId.safeParse(newId("srv")).success).toBe(true);
    expect(ServerId.safeParse(ws).success).toBe(false);
    expect(WorkspaceId.safeParse(ws).success).toBe(true);
    expect(AgentUpdateRequest.parse({ version: "0.2.1" })).toEqual({
      version: "0.2.1",
      force: false,
    });
    expect(AgentUpdateRequest.safeParse({ version: "latest" }).success).toBe(false);
  });
});
