import { PROVIDER_LABELS, SERVER_PROVIDERS, type ServerProvider } from "../servers/providers";

import {
  FIX_CODES,
  FIX_LAYERS,
  type FixCard,
  type FixCode,
  type FixKey,
  type FixLayer,
  type FixOptions,
  type FixStep,
} from "./types";

/**
 * Fix-card content for blocked ports (PHASE-02 §4.7). Console wording was
 * checked against each provider's documentation in September 2026; update the
 * steps and the `DOCS` links together when a provider changes its UI.
 */

/** Ports Lumen's proxy needs open to the internet. */
export const DEFAULT_WEB_PORTS: readonly number[] = [80, 443];

/** WireGuard port the private mesh uses between servers. */
export const MESH_PORT = 51820;

const DOCS = {
  oracleSecurityLists:
    "https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm",
  oracleNsg:
    "https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm",
  oracleUbuntuIptables:
    "https://blogs.oracle.com/developers/enabling-network-traffic-to-ubuntu-images-in-oracle-cloud-infrastructure",
  awsSecurityGroups:
    "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/working-with-security-groups.html",
  gcpFirewall: "https://docs.cloud.google.com/firewall/docs/using-firewalls",
  azureNsg: "https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group",
  hetznerFirewall: "https://docs.hetzner.com/cloud/firewalls/getting-started/creating-a-firewall/",
  digitaloceanFirewall:
    "https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/",
} as const;

interface Ctx {
  /** Sorted, de-duplicated TCP ports; never empty. */
  ports: readonly number[];
  /** Other servers' public IPs, or a placeholder when unknown; never empty. */
  peers: readonly string[];
  /** True when `peers` holds real addresses rather than the placeholder. */
  peersKnown: boolean;
}

type CardBody = Omit<FixCard, "key">;
type CardBuilder = (ctx: Ctx) => CardBody;

const PEER_PLACEHOLDER = "<other-server-ip>";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function normalizePorts(ports: readonly number[] | undefined): readonly number[] {
  const valid = [...new Set(ports ?? [])]
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535)
    .sort((a, b) => a - b);
  return valid.length > 0 ? valid : DEFAULT_WEB_PORTS;
}

function normalizePeers(peerIps: readonly string[] | undefined): readonly string[] {
  return [...new Set((peerIps ?? []).map((ip) => ip.trim()).filter((ip) => ip.length > 0))];
}

/** "a", "a and b", "a, b and c". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.slice(-1).join("")}`;
}

function portNumbers(ports: readonly number[]): string {
  return listWords(ports.map(String));
}

/** "port 443" or "ports 80 and 443". */
function portPhrase(ports: readonly number[]): string {
  return `${ports.length === 1 ? "port" : "ports"} ${portNumbers(ports)}`;
}

function portCsv(ports: readonly number[]): string {
  return ports.map(String).join(",");
}

/** A single-address CIDR for an IP, or the placeholder unchanged. */
function hostCidr(ip: string): string {
  if (ip === PEER_PLACEHOLDER || ip.includes("/")) {
    return ip;
  }
  return ip.includes(":") ? `${ip}/128` : `${ip}/32`;
}

function peerText(ctx: Ctx): string {
  return ctx.peersKnown ? listWords(ctx.peers) : "your other servers' public IPs";
}

function peerCidrText(ctx: Ctx): string {
  return ctx.peersKnown
    ? listWords(ctx.peers.map(hostCidr))
    : "each of your other servers' public IPs";
}

/** Friendly rule types some consoles offer as presets. */
function presetName(port: number): string {
  if (port === 80) {
    return "HTTP";
  }
  if (port === 443) {
    return "HTTPS";
  }
  return `Custom TCP (${String(port)})`;
}

function lines(commands: readonly string[]): string {
  return commands.join("\n");
}

// ---------------------------------------------------------------------------
// Shared OS-firewall commands
// ---------------------------------------------------------------------------

function ufwAllowPorts(ports: readonly number[]): string {
  return `sudo ufw allow ${portCsv(ports)}/tcp`;
}

function firewalldAllowPorts(ports: readonly number[]): string {
  const adds = ports.map((p) => `--add-port=${String(p)}/tcp`).join(" ");
  return `sudo firewall-cmd --permanent ${adds} && sudo firewall-cmd --reload`;
}

function iptablesAllowPort(port: number, position: number): string {
  return `sudo iptables -I INPUT ${String(position)} -m state --state NEW -p tcp --dport ${String(port)} -j ACCEPT`;
}

const PERSIST_IPTABLES = "sudo netfilter-persistent save";

function ufwAllowMesh(ctx: Ctx): string {
  return lines(
    ctx.peers.map((ip) => `sudo ufw allow from ${ip} to any port ${String(MESH_PORT)} proto udp`),
  );
}

function firewalldAllowMesh(ctx: Ctx): string {
  const rules = ctx.peers.map(
    (ip) =>
      `sudo firewall-cmd --permanent --add-rich-rule='rule source address="${ip}" port port="${String(MESH_PORT)}" protocol="udp" accept'`,
  );
  return lines([...rules, "sudo firewall-cmd --reload"]);
}

function iptablesAllowMesh(ctx: Ctx, position: number): string {
  const rules = ctx.peers.map(
    (ip) =>
      `sudo iptables -I INPUT ${String(position)} -p udp -s ${ip} --dport ${String(MESH_PORT)} -j ACCEPT`,
  );
  return lines([...rules, PERSIST_IPTABLES]);
}

/** ufw, then firewalld, then plain iptables: the order the installer detects them in. */
function genericOsPortSteps(ctx: Ctx): FixStep[] {
  const { ports } = ctx;
  return [
    {
      text: `If ufw is active (sudo ufw status shows "Status: active"), allow ${portPhrase(ports)} with ufw.`,
      command: ufwAllowPorts(ports),
    },
    {
      text: `If firewalld is running, as it is on most RHEL-family images, allow ${portPhrase(ports)} and reload it.`,
      command: firewalldAllowPorts(ports),
    },
    {
      text: `If you manage plain iptables rules, add accept rules at the top of the INPUT chain and save them.`,
      command: lines([...ports.map((p) => iptablesAllowPort(p, 1)), PERSIST_IPTABLES]),
    },
  ];
}

function genericOsMeshSteps(ctx: Ctx): FixStep[] {
  return [
    {
      text: `If ufw is active, allow UDP ${String(MESH_PORT)} from ${peerText(ctx)}.`,
      command: ufwAllowMesh(ctx),
    },
    {
      text: `If firewalld is running, add a rule for UDP ${String(MESH_PORT)} from ${peerText(ctx)} and reload it.`,
      command: firewalldAllowMesh(ctx),
    },
    {
      text: `If you manage plain iptables rules, accept UDP ${String(MESH_PORT)} from ${peerText(ctx)} and save the rules.`,
      command: iptablesAllowMesh(ctx, 1),
    },
  ];
}

function osPortTitle(ctx: Ctx): string {
  return `Open ${portPhrase(ctx.ports)} in the server's firewall`;
}

const OS_MESH_TITLE = `Allow UDP ${String(MESH_PORT)} between your servers in the server's firewall`;

// ---------------------------------------------------------------------------
// PORT_BLOCKED
// ---------------------------------------------------------------------------

const PORT_BLOCKED: Record<ServerProvider, Record<FixLayer, CardBuilder>> = {
  oracle: {
    cloud: ({ ports }) => {
      const [first, ...rest] = ports;
      const more =
        rest.length > 0 ? `, select Another ingress rule and repeat for ${portNumbers(rest)}` : "";
      return {
        title: `Open ${portPhrase(ports)} in Oracle Cloud's security list`,
        steps: [
          {
            text: "In the Oracle Cloud console, open Networking, then Virtual cloud networks, and select the VCN your server uses.",
            link: DOCS.oracleSecurityLists,
          },
          {
            text: "Open the subnet your server is in and select its security list, usually named Default Security List.",
          },
          {
            text: "Select Add Ingress Rules, set Source CIDR to 0.0.0.0/0 and set IP Protocol to TCP.",
          },
          {
            text: `Set Destination Port Range to ${String(first)}${more}, then select Add Ingress Rules.`,
          },
          {
            text: "If your server's network card uses a network security group, add the same rules there too.",
            link: DOCS.oracleNsg,
          },
        ],
        estimated_minutes: 3,
      };
    },
    os: ({ ports }) => {
      const perPort: FixStep[] =
        ports.length <= 2
          ? ports.map((p) => ({
              text: `Allow new connections on port ${String(p)} above the image's default reject rule.`,
              command: iptablesAllowPort(p, 6),
            }))
          : [
              {
                text: `Allow new connections on ${portPhrase(ports)} above the image's default reject rule.`,
                command: lines(ports.map((p) => iptablesAllowPort(p, 6))),
              },
            ];
      return {
        title: `Open ${portPhrase(ports)} in the server's iptables rules`,
        steps: [
          {
            text: "Check the rules first: Oracle's Ubuntu image ends the INPUT chain with a REJECT rule (reject-with icmp-host-prohibited) that blocks new ports.",
            command: "sudo iptables -L INPUT --line-numbers",
            link: DOCS.oracleUbuntuIptables,
          },
          ...perPort,
          {
            text: "Save the rules so they survive a reboot.",
            command: PERSIST_IPTABLES,
          },
          {
            text: `On Oracle Linux images, which use firewalld instead, allow ${portPhrase(ports)} and reload it.`,
            command: firewalldAllowPorts(ports),
          },
        ],
        estimated_minutes: 2,
      };
    },
  },

  aws: {
    cloud: ({ ports }) => ({
      title: `Open ${portPhrase(ports)} in your AWS security group`,
      steps: [
        {
          text: "In the EC2 console, open Instances, select your server and open the Security tab.",
          link: DOCS.awsSecurityGroups,
        },
        {
          text: "Select the security group listed there, then choose Edit inbound rules.",
        },
        {
          text: `For each of ${listWords(ports.map(presetName))}, choose Add rule twice: once with source 0.0.0.0/0 and once with ::/0 for IPv6.`,
        },
        { text: "Choose Save rules." },
      ],
      estimated_minutes: 2,
    }),
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: [
        {
          text: "Check whether an OS firewall is on at all, because Ubuntu and Amazon Linux images on AWS ship with it off.",
          command: "sudo ufw status; sudo firewall-cmd --state",
        },
        ...genericOsPortSteps(ctx),
      ],
      estimated_minutes: 2,
    }),
  },

  gcp: {
    cloud: ({ ports }) => {
      const isDefault = portCsv(ports) === portCsv(DEFAULT_WEB_PORTS);
      const ruleName = isDefault ? "lumen-web" : `lumen-web-${ports.map(String).join("-")}`;
      const allow = ports.map((p) => `tcp:${String(p)}`).join(",");
      return {
        title: `Open ${portPhrase(ports)} in a Google Cloud firewall rule`,
        steps: [
          {
            text: `In Cloud Shell, create a firewall rule that allows ${portPhrase(ports)} to servers tagged lumen.`,
            command: `gcloud compute firewall-rules create ${ruleName} --allow ${allow} --target-tags lumen`,
            link: DOCS.gcpFirewall,
          },
          {
            text: "Add the lumen tag to your server, using its instance name and zone.",
            command: "gcloud compute instances add-tags <instance> --tags lumen --zone <zone>",
          },
          {
            text: `To use the console instead, select Create firewall rule on the Firewall policies page, set Targets to Specified target tags with the tag lumen, Source IPv4 ranges to 0.0.0.0/0 and TCP ports to ${portCsv(ports)}.`,
            link: DOCS.gcpFirewall,
          },
        ],
        estimated_minutes: 3,
      };
    },
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: [
        {
          text: "Check whether an OS firewall is on at all, because Google's Ubuntu and Debian images ship with it off.",
          command: "sudo ufw status; sudo firewall-cmd --state",
        },
        ...genericOsPortSteps(ctx),
      ],
      estimated_minutes: 2,
    }),
  },

  azure: {
    cloud: ({ ports }) => ({
      title: `Open ${portPhrase(ports)} in your Azure network security group`,
      steps: [
        {
          text: "In the Azure portal, search for Network security groups and select the one attached to your VM.",
          link: DOCS.azureNsg,
        },
        {
          text: "Open Settings, then Inbound security rules, and select Add.",
        },
        {
          text: `Set Source to Any, Protocol to TCP, Destination port ranges to ${portCsv(ports)} and Action to Allow.`,
        },
        {
          text: "Give it an unused priority between 100 and 4096, such as 310, so it runs before the default deny rule at 65500, then select Add.",
        },
        {
          text: "If another network security group is attached to the VM's subnet, add the same rule there too.",
        },
      ],
      estimated_minutes: 3,
    }),
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: [
        {
          text: "Check whether an OS firewall is on at all, because Azure's Ubuntu images ship with ufw off.",
          command: "sudo ufw status; sudo firewall-cmd --state",
        },
        ...genericOsPortSteps(ctx),
      ],
      estimated_minutes: 2,
    }),
  },

  hetzner: {
    cloud: ({ ports }) => ({
      title: `Open ${portPhrase(ports)} in your Hetzner Cloud Firewall`,
      steps: [
        {
          text: "In the Hetzner Console, open Firewalls and select the firewall applied to your server.",
          link: DOCS.hetznerFirewall,
        },
        {
          text: `Under Inbound rules, add a TCP rule for ${portPhrase(ports)} with the sources Any IPv4 and Any IPv6.`,
        },
        {
          text: "Save the rules; Hetzner applies them to the server within a few seconds.",
        },
      ],
      estimated_minutes: 2,
    }),
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: [
        {
          text: "Check whether an OS firewall is on at all, because Hetzner's standard images ship without one.",
          command: "sudo ufw status; sudo firewall-cmd --state",
        },
        ...genericOsPortSteps(ctx),
      ],
      estimated_minutes: 2,
    }),
  },

  digitalocean: {
    cloud: ({ ports }) => ({
      title: `Open ${portPhrase(ports)} in your DigitalOcean Cloud Firewall`,
      steps: [
        {
          text: "In the DigitalOcean control panel, open Networking, then Firewalls, and select the firewall on your Droplet.",
          link: DOCS.digitaloceanFirewall,
        },
        {
          text: `On the Rules tab, add an inbound rule for each of ${listWords(ports.map(presetName))}.`,
        },
        {
          text: "Keep the sources as All IPv4 and All IPv6, then save each rule.",
        },
      ],
      estimated_minutes: 2,
    }),
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: [
        {
          text: `Allow ${portPhrase(ctx.ports)} with ufw, which Marketplace images such as the Docker one turn on by default.`,
          command: ufwAllowPorts(ctx.ports),
        },
        // The generic ufw step is replaced by the one above.
        ...genericOsPortSteps(ctx).slice(1),
      ],
      estimated_minutes: 2,
    }),
  },

  other: {
    cloud: ({ ports }) => ({
      title: `Open ${portPhrase(ports)} in your provider's firewall`,
      steps: [
        {
          text: "Open your provider's dashboard and find the firewall, security group or network rules for this server.",
        },
        {
          text: `Add inbound rules that allow TCP ${portPhrase(ports)} from anywhere: 0.0.0.0/0 for IPv4 and ::/0 for IPv6.`,
        },
        {
          text: "Save the rules and wait a minute for them to apply.",
        },
      ],
      estimated_minutes: 3,
    }),
    os: (ctx) => ({
      title: osPortTitle(ctx),
      steps: genericOsPortSteps(ctx),
      estimated_minutes: 2,
    }),
  },
};

// ---------------------------------------------------------------------------
// MESH_UNREACHABLE (content only in Phase 02; Phase 12 wires it)
// ---------------------------------------------------------------------------

const MESH = `UDP ${String(MESH_PORT)}`;

function genericOsMeshCard(ctx: Ctx): CardBody {
  return { title: OS_MESH_TITLE, steps: genericOsMeshSteps(ctx), estimated_minutes: 3 };
}

const MESH_UNREACHABLE: Record<ServerProvider, Record<FixLayer, CardBuilder>> = {
  oracle: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in Oracle Cloud's security list`,
      steps: [
        {
          text: "In the Oracle Cloud console, open the security list of the subnet your server is in.",
          link: DOCS.oracleSecurityLists,
        },
        {
          text: `Select Add Ingress Rules and add one rule per server, with Source CIDR set to ${peerCidrText(ctx)}.`,
        },
        {
          text: `Set IP Protocol to UDP and Destination Port Range to ${String(MESH_PORT)}, then select Add Ingress Rules.`,
        },
        {
          text: "If your server's network card uses a network security group, add the same rules there too.",
          link: DOCS.oracleNsg,
        },
      ],
      estimated_minutes: 3,
    }),
    os: (ctx) => ({
      title: OS_MESH_TITLE,
      steps: [
        {
          text: `Accept ${MESH} from ${peerText(ctx)} above the image's default reject rule, then save the rules.`,
          command: iptablesAllowMesh(ctx, 6),
          link: DOCS.oracleUbuntuIptables,
        },
        {
          text: `On Oracle Linux images, which use firewalld instead, add the rule there and reload it.`,
          command: firewalldAllowMesh(ctx),
        },
      ],
      estimated_minutes: 2,
    }),
  },

  aws: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in your AWS security group`,
      steps: [
        {
          text: "In the EC2 console, open your server's security group and choose Edit inbound rules.",
          link: DOCS.awsSecurityGroups,
        },
        {
          text: `Add a Custom UDP rule for port ${String(MESH_PORT)} for each of ${peerCidrText(ctx)}.`,
        },
        { text: "Choose Save rules, then do the same on each of your other servers." },
      ],
      estimated_minutes: 3,
    }),
    os: genericOsMeshCard,
  },

  gcp: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in a Google Cloud firewall rule`,
      steps: [
        {
          text: `In Cloud Shell, create a firewall rule that allows ${MESH} from your other servers to servers tagged lumen.`,
          command: `gcloud compute firewall-rules create lumen-mesh --allow udp:${String(MESH_PORT)} --source-ranges ${ctx.peers.map(hostCidr).join(",")} --target-tags lumen`,
          link: DOCS.gcpFirewall,
        },
        {
          text: "Add the lumen tag to your server if it doesn't have it yet.",
          command: "gcloud compute instances add-tags <instance> --tags lumen --zone <zone>",
        },
      ],
      estimated_minutes: 3,
    }),
    os: genericOsMeshCard,
  },

  azure: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in your Azure network security group`,
      steps: [
        {
          text: "In the Azure portal, open the network security group attached to your VM, then Inbound security rules, and select Add.",
          link: DOCS.azureNsg,
        },
        {
          text: `Set Source to IP Addresses and enter ${peerCidrText(ctx)}.`,
        },
        {
          text: `Set Protocol to UDP, Destination port ranges to ${String(MESH_PORT)}, Action to Allow and an unused priority between 100 and 4096, then select Add.`,
        },
      ],
      estimated_minutes: 3,
    }),
    os: genericOsMeshCard,
  },

  hetzner: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in your Hetzner Cloud Firewall`,
      steps: [
        {
          text: "In the Hetzner Console, open Firewalls and select the firewall applied to your server.",
          link: DOCS.hetznerFirewall,
        },
        {
          text: `Under Inbound rules, add a UDP rule for port ${String(MESH_PORT)} with ${peerCidrText(ctx)} as the source.`,
        },
        { text: "Save the rules; Hetzner applies them within a few seconds." },
      ],
      estimated_minutes: 2,
    }),
    os: genericOsMeshCard,
  },

  digitalocean: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in your DigitalOcean Cloud Firewall`,
      steps: [
        {
          text: "In the DigitalOcean control panel, open Networking, then Firewalls, and select the firewall on your Droplet.",
          link: DOCS.digitaloceanFirewall,
        },
        {
          text: `Add a Custom inbound rule with protocol UDP and port ${String(MESH_PORT)}.`,
        },
        {
          text: `Set its sources to ${ctx.peersKnown ? peerCidrText(ctx) : "your other Droplets or their public IPs"}, then save the rule.`,
        },
      ],
      estimated_minutes: 2,
    }),
    os: genericOsMeshCard,
  },

  other: {
    cloud: (ctx) => ({
      title: `Allow ${MESH} between your servers in your provider's firewall`,
      steps: [
        {
          text: "Open your provider's dashboard and find the firewall, security group or network rules for this server.",
        },
        {
          text: `Add an inbound rule for ${MESH} with ${peerCidrText(ctx)} as the source, not 0.0.0.0/0.`,
        },
        { text: "Save the rules, then do the same on each of your other servers." },
      ],
      estimated_minutes: 3,
    }),
    os: genericOsMeshCard,
  },
};

const REGISTRY: Record<FixCode, Record<ServerProvider, Record<FixLayer, CardBuilder>>> = {
  PORT_BLOCKED,
  MESH_UNREACHABLE,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Every fix-card key, in a stable order. */
export const FIX_KEYS: readonly FixKey[] = FIX_CODES.flatMap((code) =>
  SERVER_PROVIDERS.flatMap((provider) =>
    FIX_LAYERS.map((layer): FixKey => `${code}.${provider}.${layer}`),
  ),
);

/**
 * Returns the fix card for a code, provider and layer. Never returns
 * `undefined`: an unknown provider falls back to `other`, an unknown layer to
 * `cloud`. `PORT_BLOCKED` cards mention exactly `opts.ports` (default 80 and 443).
 */
export function getFix(
  code: FixCode,
  provider: ServerProvider,
  layer: FixLayer,
  opts: FixOptions = {},
): FixCard {
  const byProvider = REGISTRY[code] as
    Partial<Record<string, Record<FixLayer, CardBuilder>>> | undefined;
  const safeCode: FixCode = byProvider === undefined ? "PORT_BLOCKED" : code;
  const safeProvider: ServerProvider = (SERVER_PROVIDERS as readonly string[]).includes(provider)
    ? provider
    : "other";
  const safeLayer: FixLayer = (FIX_LAYERS as readonly string[]).includes(layer) ? layer : "cloud";

  const peers = normalizePeers(opts.peerIps);
  const ctx: Ctx = {
    ports: normalizePorts(opts.ports),
    peers: peers.length > 0 ? peers : [PEER_PLACEHOLDER],
    peersKnown: peers.length > 0,
  };

  const body = REGISTRY[safeCode][safeProvider][safeLayer](ctx);
  return { key: `${safeCode}.${safeProvider}.${safeLayer}`, ...body };
}

/** The provider's display name for use in surrounding copy ("your Oracle Cloud server"). */
export function fixProviderLabel(provider: ServerProvider): string {
  return provider === "other" ? "your provider" : PROVIDER_LABELS[provider];
}

/**
 * Plain-text rendering for terminals (the agent installer prints the cloud card
 * this way). Steps are numbered; each command line sits on its own line,
 * indented and prefixed with "$ "; links follow as "More: <url>".
 */
export function renderFixCardText(card: FixCard): string {
  const out: string[] = [`${card.title} (about ${String(card.estimated_minutes)} min)`, ""];
  card.steps.forEach((step, index) => {
    const number = `${String(index + 1)}. `;
    const indent = " ".repeat(number.length);
    out.push(`${number}${step.text}`);
    if (step.command !== undefined) {
      for (const line of step.command.split("\n")) {
        out.push(`${indent}  $ ${line}`);
      }
    }
    if (step.link !== undefined) {
      out.push(`${indent}More: ${step.link}`);
    }
  });
  return out.join("\n");
}
