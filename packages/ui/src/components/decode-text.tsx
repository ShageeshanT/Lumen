"use client";

import { useEffect, useState, type ElementType } from "react";

import type { TextVariant } from "../styles/text-styles";
import { durations, prefersReducedMotion } from "../tokens/motion";

import { Text } from "./text";

/** Glyph noise the characters resolve from (the Signal "decode"). */
export const decodeGlyphs = "#%&*/<>=+?01ABCDEFXYZ";
const STEPS = 9;
/** DECISIONS 0032: a title decodes once per page in under 360 ms. */
export const decodeMaxMs = durations.decode;

/**
 * One frame of the decode: the first `revealed` characters are final, spaces
 * stay spaces, the rest are noise picked by `random`.
 */
export function decodeFrame(text: string, revealed: number, random: () => number): string {
  return Array.from(text)
    .map((char, index) =>
      index < revealed || char === " "
        ? char
        : (decodeGlyphs[Math.floor(random() * decodeGlyphs.length)] ?? char),
    )
    .join("");
}

export interface DecodeTextProps {
  text: string;
  /** A display style: page-title by default. */
  variant?: TextVariant;
  as?: ElementType;
  /** Total decode time, capped at 360 ms. */
  durationMs?: number;
  className?: string;
  /** Replays the decode when it changes. */
  replayKey?: number | string;
}

/**
 * A title that resolves left to right from glyph noise once, when it mounts.
 * The final text is rendered on the server and is the accessible name the
 * whole time; the noise is aria-hidden and sits over an invisible copy of the
 * final text so the layout never moves. Under reduced motion (OS or account
 * preference) the text is simply shown.
 */
export function DecodeText({
  text,
  variant = "page-title",
  as,
  durationMs = 324,
  className,
  replayKey,
}: DecodeTextProps) {
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || text.trim() === "") {
      return;
    }
    const tick = Math.min(durationMs, decodeMaxMs) / STEPS;
    let step = 0;
    // First scrambled frame on the next paint; the settled text is what the server rendered.
    const start = requestAnimationFrame(() => {
      setFrame(decodeFrame(text, 0, Math.random));
    });
    const timer = setInterval(() => {
      step += 1;
      if (step >= STEPS) {
        clearInterval(timer);
        setFrame(null);
        return;
      }
      setFrame(decodeFrame(text, Math.floor((step / STEPS) * text.length), Math.random));
    }, tick);
    return () => {
      cancelAnimationFrame(start);
      clearInterval(timer);
      setFrame(null);
    };
  }, [text, durationMs, replayKey]);

  return (
    <Text
      variant={variant}
      {...(as === undefined ? {} : { as })}
      className={className}
      data-decoding={frame === null ? undefined : ""}
    >
      {frame === null ? (
        text
      ) : (
        <>
          <span className="sr-only">{text}</span>
          <span aria-hidden="true" className="inline-grid">
            <span className="invisible col-start-1 row-start-1">{text}</span>
            {/* Zero intrinsic width: the invisible copy alone sizes the box. */}
            <span className="col-start-1 row-start-1 w-0 min-w-full overflow-hidden whitespace-nowrap">
              {frame}
            </span>
          </span>
        </>
      )}
    </Text>
  );
}
