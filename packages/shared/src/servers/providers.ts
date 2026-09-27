/**
 * Cloud providers Lumen recognises. The agent detects one of these from the
 * instance metadata service at install time; anything it can't identify is
 * `other`. The order is the order the dashboard lists them in.
 */
export const SERVER_PROVIDERS = [
  "oracle",
  "aws",
  "gcp",
  "azure",
  "hetzner",
  "digitalocean",
  "other",
] as const;

export type ServerProvider = (typeof SERVER_PROVIDERS)[number];

/** Human names for each provider, used in titles, pickers and docs links. */
export const PROVIDER_LABELS: Record<ServerProvider, string> = {
  oracle: "Oracle Cloud",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  hetzner: "Hetzner",
  digitalocean: "DigitalOcean",
  other: "Other",
};

/** Narrows an arbitrary string (a database value, a query parameter) to a known provider. */
export function isServerProvider(value: unknown): value is ServerProvider {
  return typeof value === "string" && (SERVER_PROVIDERS as readonly string[]).includes(value);
}
