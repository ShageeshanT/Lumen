import type pg from "pg";

import type { Db } from "@lumen/db";

import type { Config } from "./config";
import type { GatewayMetrics } from "./gateway/metrics";
import type { Registry } from "./gateway/registry";
import type { InstanceKey } from "./gateway/signing-key";
import type { Logger } from "./logger";
import type { Bus } from "./realtime/bus";

/** Everything the server routes, the agent gateway and the workers share. */
export interface ControlPlane {
  db: Db;
  pool: pg.Pool;
  bus: Bus;
  logger: Logger;
  config: Config;
  instanceKey: InstanceKey;
  registry: Registry;
  metrics: GatewayMetrics;
  now: () => Date;
}
