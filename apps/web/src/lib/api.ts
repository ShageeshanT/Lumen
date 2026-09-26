/** Base URL of the control-plane API, inlined at build time from NEXT_PUBLIC_API_URL. */
export function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  db: "ok" | "unavailable";
  uptime_s: number;
}

export type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; db: HealthResponse["db"]; version: string; uptimeS: number }
  | { kind: "unreachable"; url: string };

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate["status"] === "ok" || candidate["status"] === "degraded") &&
    typeof candidate["version"] === "string" &&
    (candidate["db"] === "ok" || candidate["db"] === "unavailable") &&
    typeof candidate["uptime_s"] === "number"
  );
}

/** Fetches `/v1/health`. Never throws; network failures become the `unreachable` state. */
export async function fetchHealth(fetchImpl: typeof fetch = fetch): Promise<HealthState> {
  const url = apiUrl();
  try {
    const res = await fetchImpl(`${url}/v1/health`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status !== 200 && res.status !== 503) {
      return { kind: "unreachable", url };
    }
    const body: unknown = await res.json();
    if (!isHealthResponse(body)) {
      return { kind: "unreachable", url };
    }
    return { kind: "ok", db: body.db, version: body.version, uptimeS: body.uptime_s };
  } catch {
    return { kind: "unreachable", url };
  }
}
