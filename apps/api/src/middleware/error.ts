import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import {
  LumenHttpError,
  makeError,
  type ErrorContext,
  type LumenError,
  type LumenErrorCode,
} from "@lumen/shared";

import type { Logger } from "../logger.js";

import type { RequestIdVariables } from "./request-id.js";

/** Every error response has exactly this body. */
export interface ErrorBody {
  error: LumenError;
}

interface Env {
  Variables: RequestIdVariables;
}

const STATUS_TO_CODE: Partial<Record<number, LumenErrorCode>> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  429: "RATE_LIMITED",
};

/**
 * Converts anything thrown by a route into `{ error: LumenError }`. Stack traces
 * and raw messages of unexpected errors are logged with the request id and
 * never sent to the client (CLAUDE.md: never show raw stack traces to users).
 */
export function errorHandler(logger: Logger): ErrorHandler<Env> {
  return (err, c) => {
    const requestId = c.get("requestId");

    if (err instanceof LumenHttpError) {
      return c.json<ErrorBody>({ error: err.error }, err.status as ContentfulStatusCode);
    }

    if (err instanceof HTTPException) {
      const code = STATUS_TO_CODE[err.status];
      if (code !== undefined) {
        const ctx: ErrorContext = {};
        if (err.message !== "") {
          ctx.detail = err.message;
        }
        return c.json<ErrorBody>({ error: makeError(code, ctx) }, err.status);
      }
    }

    logger.error({ err, requestId }, "unhandled error");
    return c.json<ErrorBody>({ error: makeError("INTERNAL", { supportId: requestId }) }, 500);
  };
}

/** Unknown routes get a catalog error too, so clients never see Hono's plain-text 404. */
export const notFoundHandler: NotFoundHandler<Env> = (c) =>
  c.json<ErrorBody>({ error: makeError("NOT_FOUND", { resource: "route" }) }, 404);
