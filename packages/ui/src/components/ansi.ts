/**
 * A small ANSI SGR parser for log lines. It turns escape-coded text into plain
 * segments with style flags; the log viewer renders each segment as a span with
 * token classes, so no markup from a log line ever reaches the DOM as HTML.
 *
 * Supported: reset (0), bold (1), dim (2), italic (3), underline (4), their
 * resets (22, 23, 24), the 16 foreground colors (30–37, 90–97), default
 * foreground (39), and 256-color / truecolor foregrounds (38;5;n, 38;2;r;g;b),
 * which are mapped to the nearest of the eight token colors. Backgrounds (40–47,
 * 100–107, 48;…) are parsed and dropped on purpose: a log panel stays calm and
 * every text color keeps its contrast guarantee. Every other CSI sequence
 * (cursor moves, erase line) and OSC sequence (window titles, hyperlinks) is
 * stripped.
 */

/** The eight token-compatible colors ANSI colors map to (Phase 1 §4.14). */
export type AnsiColor = "danger" | "success" | "warning" | "info" | "accent" | "secondary";

export interface AnsiSegment {
  text: string;
  color?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

interface AnsiState {
  color: AnsiColor | undefined;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

/** Index 0–7 is the normal palette, 8–15 the bright one. */
const BASIC: readonly AnsiColor[] = [
  "secondary", // black: unreadable on a dark panel, shown as secondary text
  "danger", // red
  "success", // green
  "warning", // yellow
  "info", // blue
  "accent", // magenta
  "accent", // cyan
  "secondary", // white
];

/** Text color class per ANSI color; the `-text` tier holds 4.5:1 in both themes. */
export const ansiColorClass: Record<AnsiColor, string> = {
  danger: "text-danger-text",
  success: "text-success-text",
  warning: "text-warning-text",
  info: "text-info-text",
  accent: "text-accent-text",
  secondary: "text-text-secondary",
};

const ESC = "\u001b";
// CSI: ESC [ params intermediates final. OSC: ESC ] … (BEL | ESC \).
// Other two-byte escapes (ESC c, ESC =) are dropped as well.
const SEQUENCE =
  /\u001b(?:\[([0-?]*)([ -/]*)([@-~])|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])/g;

function basicColor(index: number): AnsiColor | undefined {
  return BASIC[index % 8];
}

/** Nearest token color for an RGB value: hue decides, low saturation is secondary. */
export function rgbToAnsiColor(r: number, g: number, b: number): AnsiColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40) {
    return "secondary";
  }
  let hue: number;
  if (max === r) {
    hue = ((g - b) / (max - min)) * 60;
  } else if (max === g) {
    hue = (2 + (b - r) / (max - min)) * 60;
  } else {
    hue = (4 + (r - g) / (max - min)) * 60;
  }
  if (hue < 0) {
    hue += 360;
  }
  if (hue < 20 || hue >= 330) {
    return "danger";
  }
  if (hue < 70) {
    return "warning";
  }
  if (hue < 160) {
    return "success";
  }
  if (hue < 250) {
    return hue < 200 ? "accent" : "info";
  }
  return "accent";
}

/** Maps an xterm 256-color index to a token color. */
export function xterm256ToAnsiColor(index: number): AnsiColor | undefined {
  if (index < 0 || index > 255) {
    return undefined;
  }
  if (index < 16) {
    return basicColor(index);
  }
  if (index >= 232) {
    return "secondary";
  }
  const cube = index - 16;
  const level = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return rgbToAnsiColor(
    level(Math.floor(cube / 36)),
    level(Math.floor(cube / 6) % 6),
    level(cube % 6),
  );
}

function applySgr(state: AnsiState, params: string): void {
  const codes = params === "" ? [0] : params.split(/[;:]/).map((part) => Number(part || "0"));
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i] ?? 0;
    if (code === 0) {
      state.color = undefined;
      state.bold = false;
      state.dim = false;
      state.italic = false;
      state.underline = false;
    } else if (code === 1) {
      state.bold = true;
    } else if (code === 2) {
      state.dim = true;
    } else if (code === 3) {
      state.italic = true;
    } else if (code === 4) {
      state.underline = true;
    } else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) {
      state.italic = false;
    } else if (code === 24) {
      state.underline = false;
    } else if (code >= 30 && code <= 37) {
      state.color = basicColor(code - 30);
    } else if (code >= 90 && code <= 97) {
      state.color = basicColor(code - 90 + 8);
    } else if (code === 39) {
      state.color = undefined;
    } else if (code === 38 || code === 48) {
      const mode = codes[i + 1];
      let color: AnsiColor | undefined;
      if (mode === 5) {
        color = xterm256ToAnsiColor(codes[i + 2] ?? -1);
        i += 2;
      } else if (mode === 2) {
        color = rgbToAnsiColor(codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0);
        i += 4;
      }
      if (code === 38) {
        state.color = color;
      }
    }
    // Backgrounds (40–47, 49, 100–107), blink, inverse, strike: ignored.
  }
}

function pushSegment(segments: AnsiSegment[], raw: string, state: AnsiState): void {
  // A sequence cut off at the end of a line leaves a bare ESC; it is never shown.
  const text = raw.includes(ESC) ? raw.replaceAll(ESC, "") : raw;
  if (text === "") {
    return;
  }
  const segment: AnsiSegment = { text };
  if (state.color !== undefined) {
    segment.color = state.color;
  }
  if (state.bold) {
    segment.bold = true;
  }
  if (state.dim) {
    segment.dim = true;
  }
  if (state.italic) {
    segment.italic = true;
  }
  if (state.underline) {
    segment.underline = true;
  }
  const previous = segments.at(-1);
  if (
    previous !== undefined &&
    previous.color === segment.color &&
    previous.bold === segment.bold &&
    previous.dim === segment.dim &&
    previous.italic === segment.italic &&
    previous.underline === segment.underline
  ) {
    previous.text += text;
    return;
  }
  segments.push(segment);
}

/** Splits a line into styled segments. Text without escapes returns one plain segment. */
export function parseAnsi(input: string): AnsiSegment[] {
  if (!input.includes(ESC)) {
    return input === "" ? [] : [{ text: input }];
  }
  const segments: AnsiSegment[] = [];
  const state: AnsiState = {
    color: undefined,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
  };
  let last = 0;
  SEQUENCE.lastIndex = 0;
  for (let match = SEQUENCE.exec(input); match !== null; match = SEQUENCE.exec(input)) {
    pushSegment(segments, input.slice(last, match.index), state);
    last = match.index + match[0].length;
    const [, params, intermediates, final] = match;
    if (final === "m" && intermediates === "" && params !== undefined) {
      applySgr(state, params);
    }
  }
  pushSegment(segments, input.slice(last), state);
  return segments;
}

/** The line as plain text, every escape sequence removed. Used for copy and search. */
export function stripAnsi(input: string): string {
  return input.includes(ESC) ? input.replace(SEQUENCE, "").replaceAll(ESC, "") : input;
}
