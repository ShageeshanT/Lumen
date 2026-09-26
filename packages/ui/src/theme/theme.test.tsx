import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";
import {
  applyTheme,
  resolveTheme,
  THEME_EVENT,
  THEME_STORAGE_KEY,
  themeScript,
} from "./theme-script";
import { useTheme } from "./use-theme";

type Listener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<Listener>();
  let matches = initialDark;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener);
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    setDark(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button
        type="button"
        onClick={() => {
          setTheme("light");
        }}
      >
        light
      </button>
      <button
        type="button"
        onClick={() => {
          setTheme("system");
        }}
      >
        system
      </button>
    </div>
  );
}

describe("resolveTheme", () => {
  it("passes explicit preferences through and resolves system", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets the attribute and the color scheme", () => {
    const root = document.createElement("html");
    applyTheme("light", root);
    expect(root.dataset["theme"]).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("themeScript", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it.each([
    ["dark", true, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [null, false, "light"],
    ["garbage", true, "dark"],
  ])("with stored %s and OS dark=%s renders %s before paint", (stored, osDark, expected) => {
    installMatchMedia(osDark);
    if (stored !== null) {
      localStorage.setItem(THEME_STORAGE_KEY, stored);
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the inline <head> script is deliberately evaluated as a string
    const run = new Function(themeScript) as () => void;
    run();
    expect(document.documentElement.dataset["theme"]).toBe(expected);
    expect(document.documentElement.style.colorScheme).toBe(expected);
  });
});

describe("ThemeProvider", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to system and follows the OS live", () => {
    const media = installMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    act(() => {
      media.setDark(false);
    });
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("persists an explicit choice and stops following the OS", () => {
    const media = installMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByRole("button", { name: "light" }).click();
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");

    act(() => {
      media.setDark(true);
    });
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("picks up a change made in another tab", () => {
    installMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "light" }),
      );
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("picks up a same-tab write announced through the theme event", () => {
    installMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new Event(THEME_EVENT));
    });
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  it("throws when used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/inside <ThemeProvider>/);
  });
});
