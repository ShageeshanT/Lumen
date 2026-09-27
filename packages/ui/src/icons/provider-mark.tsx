import { cn } from "../lib/cn";

export const PROVIDERS = [
  "oracle",
  "aws",
  "gcp",
  "azure",
  "hetzner",
  "digitalocean",
  "other",
] as const;

export type ProviderKey = (typeof PROVIDERS)[number];

export const PROVIDER_NAMES: Record<ProviderKey, string> = {
  oracle: "Oracle Cloud",
  aws: "Amazon Web Services",
  gcp: "Google Cloud",
  azure: "Microsoft Azure",
  hetzner: "Hetzner",
  digitalocean: "DigitalOcean",
  other: "Other provider",
};

/** Monograms drawn in Lumen's own type; no trademark artwork (vendor/LICENSES.md). */
export const PROVIDER_MONOGRAMS: Record<ProviderKey, string> = {
  oracle: "OC",
  aws: "AWS",
  gcp: "GCP",
  azure: "AZ",
  hetzner: "HZ",
  digitalocean: "DO",
  other: "?",
};

export interface ProviderMarkProps {
  provider: ProviderKey;
  /** 20 inline with text (default), 24 in cards, 32 in the add-server picker. */
  size?: 20 | 24 | 32;
  className?: string;
  /**
   * Accessible name. Omit when the provider's name is written next to the
   * tile; pass `true` to use the provider's full name.
   */
  label?: string | true;
}

/**
 * The cloud a server runs on, as a monogram tile: mono caps on the raised
 * surface with a hairline frame. Three-letter monograms widen the tile rather
 * than shrinking the type below 11 px.
 */
export function ProviderMark({ provider, size = 20, className, label }: ProviderMarkProps) {
  const name = label === true ? PROVIDER_NAMES[provider] : label;
  return (
    <span
      role={name === undefined ? undefined : "img"}
      aria-label={name}
      aria-hidden={name === undefined ? true : undefined}
      data-provider={provider}
      className={cn(
        "border-border-strong bg-surface-raised text-text-secondary rounded-kbd inline-flex shrink-0 items-center justify-center border font-mono font-medium select-none",
        size === 32 ? "text-13" : "text-11",
        className,
      )}
      style={{
        height: size,
        minWidth: size,
        paddingInline: PROVIDER_MONOGRAMS[provider].length > 2 ? 3 : 0,
      }}
    >
      {PROVIDER_MONOGRAMS[provider]}
    </span>
  );
}
