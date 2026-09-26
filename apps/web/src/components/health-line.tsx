"use client";

import { useEffect, useState } from "react";

import { fetchHealth, type HealthState } from "@/lib/api";

function describe(state: HealthState): string {
  switch (state.kind) {
    case "loading":
      return "Checking API…";
    case "ok":
      return `API: ok · db: ${state.db} · up ${String(state.uptimeS)}s`;
    case "unreachable":
      return `API unreachable at ${state.url}`;
  }
}

/** One line of live status: the first thing on the shell page that proves the stack is wired. */
export function HealthLine() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchHealth().then((next) => {
      if (!cancelled) {
        setState(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p role="status" aria-live="polite" className="font-mono text-sm tabular-nums">
      {describe(state)}
    </p>
  );
}
