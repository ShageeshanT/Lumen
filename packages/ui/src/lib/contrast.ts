/**
 * WCAG 2.x contrast math. Used by the gallery "Tokens" page to recompute the
 * contrast table live from the CSS variables, and by the test that holds the
 * token values to their thresholds.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Rgba extends Rgb {
  a: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Parses `#rgb`, `#rrggbb`, `rgb(r, g, b)` and `rgba(r, g, b, a)`. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  const hex = HEX.exec(value);
  if (hex?.[1] !== undefined) {
    const digits =
      hex[1].length === 3
        ? Array.from(hex[1])
            .map((d) => d + d)
            .join("")
        : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = RGBA.exec(value);
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Unsupported color: ${input}`);
}

/** Alpha-composites `top` over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG contrast ratio between two opaque colors, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Contrast of `foreground` on `background`, both given as CSS color strings.
 * A translucent foreground is composited over the background first.
 */
export function contrast(foreground: string, background: string): number {
  const bg = parseColor(background);
  const fg = parseColor(foreground);
  const opaqueBg: Rgb = { r: bg.r, g: bg.g, b: bg.b };
  const opaqueFg = fg.a < 1 ? composite(fg, opaqueBg) : { r: fg.r, g: fg.g, b: fg.b };
  return contrastRatio(opaqueFg, opaqueBg);
}

export const WCAG_TEXT = 4.5;
export const WCAG_NON_TEXT = 3;
export const WCAG_LARGE_TEXT = 3;

export function toHex(color: Rgb): string {
  const part = (v: number) => v.toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}
