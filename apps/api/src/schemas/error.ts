import { z } from "@hono/zod-openapi";

import { LUMEN_ERROR_CODES } from "@lumen/shared";

const ErrorAction = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("link"), label: z.string(), href: z.string() }),
    z.object({
      kind: z.literal("button"),
      label: z.string(),
      actionId: z.string(),
      // Seconds until the action can succeed (rate limits); the client counts down.
      availableInS: z.number().nonnegative().optional(),
    }),
    z.object({ kind: z.literal("command"), label: z.string(), command: z.string() }),
  ])
  .openapi("ErrorAction");

/** The body of every error response: a catalog error (SPEC J6) the client can render as a card. */
export const ErrorResponse = z
  .object({
    error: z
      .object({
        code: z.enum(LUMEN_ERROR_CODES).openapi({ example: "NOT_FOUND" }),
        title: z
          .string()
          .openapi({ example: "This project doesn't exist or you don't have access" }),
        explanation: z.string(),
        fix: z.string(),
        action: ErrorAction,
        raw: z.string().optional(),
        supportId: z.string().optional().openapi({ example: "req_01j8x9k2d3m4n5p6q7r8s9t0v1" }),
      })
      .openapi("LumenError"),
  })
  .openapi("ErrorResponse");

export type ErrorResponseBody = z.infer<typeof ErrorResponse>;

/** Reusable response entry for routes that can fail unexpectedly. */
export const internalErrorResponse = {
  description: "Unexpected error; the body carries a support id to quote when reporting it",
  content: { "application/json": { schema: ErrorResponse } },
} as const;
