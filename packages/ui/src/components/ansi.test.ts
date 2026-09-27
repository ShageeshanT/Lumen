import { describe, expect, it } from "vitest";

import { parseAnsi, rgbToAnsiColor, stripAnsi, xterm256ToAnsiColor } from "./ansi";

const E = "\u001b";

describe("parseAnsi", () => {
  it("returns plain text as one segment and nothing for an empty line", () => {
    expect(parseAnsi("server listening on :3000")).toEqual([{ text: "server listening on :3000" }]);
    expect(parseAnsi("")).toEqual([]);
  });

  it("maps the eight basic colors to token colors", () => {
    const line = [30, 31, 32, 33, 34, 35, 36, 37].map((code) => `${E}[${String(code)}mx`).join("");
    expect(parseAnsi(line).map((segment) => segment.color)).toEqual([
      "secondary",
      "danger",
      "success",
      "warning",
      "info",
      "accent",
      // magenta and cyan merge into one accent segment
      "secondary",
    ]);
  });

  it("maps bright colors like their normal counterparts", () => {
    expect(parseAnsi(`${E}[91merror${E}[0m`)).toEqual([{ text: "error", color: "danger" }]);
    expect(parseAnsi(`${E}[90mdebug`)).toEqual([{ text: "debug", color: "secondary" }]);
  });

  it("resets with 0, an empty parameter list and 39", () => {
    expect(parseAnsi(`${E}[32mok${E}[0m done`)).toEqual([
      { text: "ok", color: "success" },
      { text: " done" },
    ]);
    expect(parseAnsi(`${E}[32mok${E}[m done`)).toEqual([
      { text: "ok", color: "success" },
      { text: " done" },
    ]);
    expect(parseAnsi(`${E}[1;33mwarn${E}[39m plain bold`)).toEqual([
      { text: "warn", color: "warning", bold: true },
      { text: " plain bold", bold: true },
    ]);
  });

  it("tracks bold, dim, italic and underline with their resets", () => {
    expect(parseAnsi(`${E}[1mB${E}[22m${E}[2mD${E}[22m${E}[3mI${E}[23m${E}[4mU${E}[24mN`)).toEqual([
      { text: "B", bold: true },
      { text: "D", dim: true },
      { text: "I", italic: true },
      { text: "U", underline: true },
      { text: "N" },
    ]);
  });

  it("combines several parameters in one sequence", () => {
    expect(parseAnsi(`${E}[1;4;31mboom`)).toEqual([
      { text: "boom", color: "danger", bold: true, underline: true },
    ]);
  });

  it("maps 256-color and truecolor foregrounds to the nearest token color", () => {
    expect(parseAnsi(`${E}[38;5;196mred`)[0]?.color).toBe("danger");
    expect(parseAnsi(`${E}[38;5;2mgreen`)[0]?.color).toBe("success");
    expect(parseAnsi(`${E}[38;5;244mgray`)[0]?.color).toBe("secondary");
    expect(parseAnsi(`${E}[38;2;255;200;0mgold`)[0]?.color).toBe("warning");
    expect(parseAnsi(`${E}[38;2;40;120;255mblue`)[0]?.color).toBe("info");
  });

  it("drops backgrounds but keeps parsing the rest of the sequence", () => {
    expect(parseAnsi(`${E}[41;37m FAIL ${E}[0m`)).toEqual([{ text: " FAIL ", color: "secondary" }]);
    expect(parseAnsi(`${E}[48;5;21;32mok`)).toEqual([{ text: "ok", color: "success" }]);
  });

  it("strips cursor, erase and OSC hyperlink sequences", () => {
    expect(parseAnsi(`${E}[2K${E}[1Gprogress 40%`)).toEqual([{ text: "progress 40%" }]);
    expect(parseAnsi(`see ${E}]8;;https://example.com${E}\\docs${E}]8;;${E}\\ now`)).toEqual([
      { text: "see docs now" },
    ]);
    expect(parseAnsi(`${E}]0;title\u0007hello`)).toEqual([{ text: "hello" }]);
  });

  it("never produces markup: angle brackets stay text", () => {
    expect(parseAnsi(`${E}[31m<script>alert(1)</script>`)).toEqual([
      { text: "<script>alert(1)</script>", color: "danger" },
    ]);
  });

  it("never lets a stray escape character through from a cut-off sequence", () => {
    const text = parseAnsi(`${E}[32mok${E}[31`)
      .map((segment) => segment.text)
      .join("");
    expect(text.startsWith("ok")).toBe(true);
    expect(text).not.toContain(E);
    expect(stripAnsi(`done${E}[`)).not.toContain(E);
  });
});

describe("stripAnsi", () => {
  it("returns the plain text", () => {
    expect(stripAnsi(`${E}[1;32m✓${E}[0m compiled ${E}[90min 1.2s${E}[0m`)).toBe(
      "✓ compiled in 1.2s",
    );
    expect(stripAnsi("no escapes")).toBe("no escapes");
  });
});

describe("color mapping helpers", () => {
  it("treats low-saturation colors as secondary", () => {
    expect(rgbToAnsiColor(128, 128, 128)).toBe("secondary");
    expect(rgbToAnsiColor(255, 0, 255)).toBe("accent");
    expect(rgbToAnsiColor(0, 200, 200)).toBe("accent");
  });

  it("rejects out-of-range 256-color indexes", () => {
    expect(xterm256ToAnsiColor(300)).toBeUndefined();
    expect(xterm256ToAnsiColor(9)).toBe("danger");
    expect(xterm256ToAnsiColor(240)).toBe("secondary");
  });
});
