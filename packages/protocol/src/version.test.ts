import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { PROTOCOL_VERSION } from "./version";

it("matches the PROTOCOL_VERSION file", () => {
  const file = fileURLToPath(new URL("../PROTOCOL_VERSION", import.meta.url));
  const fromFile = Number.parseInt(readFileSync(file, "utf8").trim(), 10);
  expect(PROTOCOL_VERSION).toBe(fromFile);
});
