import { pino, type DestinationStream, type Logger } from "pino";

/**
 * Keys whose values never reach a log line. Phase 04 extends this with
 * variable values, tokens and session ids.
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

export type { Logger };

/** Structured JSON logger. Pass a destination in tests to capture output. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: { service: "lumen-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
