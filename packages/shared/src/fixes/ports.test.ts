import { describe, expect, it } from "vitest";

import {
  PROVIDER_LABELS,
  SERVER_PROVIDERS,
  isServerProvider,
  type ServerProvider,
} from "../servers/providers";

import {
  DEFAULT_WEB_PORTS,
  FIX_CODES,
  FIX_KEYS,
  FIX_LAYERS,
  MESH_PORT,
  fixProviderLabel,
  getFix,
  renderFixCardText,
  type FixCard,
  type FixCode,
  type FixLayer,
} from "./index";

const ALL: { code: FixCode; provider: ServerProvider; layer: FixLayer }[] = FIX_CODES.flatMap(
  (code) =>
    SERVER_PROVIDERS.flatMap((provider) => FIX_LAYERS.map((layer) => ({ code, provider, layer }))),
);

// Option sets that exercise every interpolation branch.
const OPTION_SETS = [
  {},
  { ports: [443] },
  { ports: [80, 443, 8080] },
  { peerIps: ["203.0.113.4"] },
  { peerIps: ["203.0.113.4", "2001:db8::1", "198.51.100.0/24"] },
];

function allCards(): FixCard[] {
  return ALL.flatMap(({ code, provider, layer }) =>
    OPTION_SETS.map((opts) => getFix(code, provider, layer, opts)),
  );
}

function commandsOf(card: FixCard): string {
  return card.steps.map((s) => s.command ?? "").join("\n");
}

function textOf(card: FixCard): string {
  return [card.title, ...card.steps.map((s) => s.text)].join("\n");
}

describe("fix card keys", () => {
  it("has every provider × layer key for PORT_BLOCKED and MESH_UNREACHABLE", () => {
    expect([...FIX_KEYS].sort()).toMatchSnapshot();
    expect(FIX_KEYS).toHaveLength(2 * 7 * 2);
    expect(new Set(FIX_KEYS).size).toBe(FIX_KEYS.length);
  });

  it("returns a card whose key matches the request", () => {
    for (const { code, provider, layer } of ALL) {
      expect(getFix(code, provider, layer).key).toBe(`${code}.${provider}.${layer}`);
    }
  });
});

describe("getFix", () => {
  it("never returns undefined, even for unknown values", () => {
    const unknownProvider = getFix("PORT_BLOCKED", "linode" as ServerProvider, "cloud");
    expect(unknownProvider.key).toBe("PORT_BLOCKED.other.cloud");
    expect(unknownProvider.steps.length).toBeGreaterThan(0);

    const unknownLayer = getFix("MESH_UNREACHABLE", "aws", "kernel" as FixLayer);
    expect(unknownLayer.key).toBe("MESH_UNREACHABLE.aws.cloud");

    const unknownCode = getFix("NOPE" as FixCode, "oracle", "os");
    expect(unknownCode.key).toBe("PORT_BLOCKED.oracle.os");

    for (const card of allCards()) {
      expect(card).toBeDefined();
      expect(card.title.length).toBeGreaterThan(0);
    }
  });

  it("defaults to ports 80 and 443", () => {
    expect(DEFAULT_WEB_PORTS).toEqual([80, 443]);
    const card = getFix("PORT_BLOCKED", "oracle", "cloud");
    expect(card.title).toBe("Open ports 80 and 443 in Oracle Cloud's security list");
    expect(getFix("PORT_BLOCKED", "oracle", "cloud", { ports: [] })).toEqual(card);
    expect(getFix("PORT_BLOCKED", "oracle", "cloud", { ports: [0, 70000, 1.5] })).toEqual(card);
  });

  it("mentions exactly the blocked ports", () => {
    const card = getFix("PORT_BLOCKED", "oracle", "os", { ports: [443] });
    expect(card.title).toBe("Open port 443 in the server's iptables rules");
    const commands = commandsOf(card);
    expect(commands).toContain(
      "sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT",
    );
    expect(commands).toContain("sudo netfilter-persistent save");
    expect(commands).not.toMatch(/\b80\b/);

    for (const { provider, layer } of ALL.filter((c) => c.code === "PORT_BLOCKED")) {
      const only443 = getFix("PORT_BLOCKED", provider, layer, { ports: [443] });
      expect(only443.title, only443.key).toContain("port 443");
      expect(textOf(only443) + commandsOf(only443), only443.key).not.toMatch(/\b80\b/);
    }
  });

  it("de-duplicates and sorts ports", () => {
    const card = getFix("PORT_BLOCKED", "aws", "os", { ports: [443, 80, 443] });
    expect(card.title).toBe("Open ports 80 and 443 in the server's firewall");
  });

  it("lists three or more ports naturally and keeps Oracle's OS card short", () => {
    const card = getFix("PORT_BLOCKED", "oracle", "os", { ports: [8080, 80, 443] });
    expect(card.title).toBe("Open ports 80, 443 and 8080 in the server's iptables rules");
    expect(card.steps.length).toBeLessThanOrEqual(6);
    expect(commandsOf(card)).toContain("--dport 8080");
  });

  it("uses the Oracle commands from the spec", () => {
    const commands = commandsOf(getFix("PORT_BLOCKED", "oracle", "os"));
    expect(commands).toContain(
      "sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT",
    );
    expect(commands).toContain(
      "sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT",
    );
    expect(commands).toContain("sudo netfilter-persistent save");
    const cloud = textOf(getFix("PORT_BLOCKED", "oracle", "cloud"));
    expect(cloud).toContain("0.0.0.0/0");
    expect(cloud).toContain("network security group");
  });

  it("uses the Google Cloud and DigitalOcean commands from the spec", () => {
    const gcp = commandsOf(getFix("PORT_BLOCKED", "gcp", "cloud"));
    expect(gcp).toContain(
      "gcloud compute firewall-rules create lumen-web --allow tcp:80,tcp:443 --target-tags lumen",
    );
    expect(gcp).toContain(
      "gcloud compute instances add-tags <instance> --tags lumen --zone <zone>",
    );
    expect(commandsOf(getFix("PORT_BLOCKED", "gcp", "cloud", { ports: [443] }))).toContain(
      "create lumen-web-443 --allow tcp:443",
    );
    expect(commandsOf(getFix("PORT_BLOCKED", "digitalocean", "os"))).toContain(
      "sudo ufw allow 80,443/tcp",
    );
    expect(textOf(getFix("PORT_BLOCKED", "aws", "cloud"))).toContain("::/0");
  });

  it("scopes mesh rules to UDP 51820 from the other servers only", () => {
    expect(MESH_PORT).toBe(51820);
    for (const { provider, layer } of ALL.filter((c) => c.code === "MESH_UNREACHABLE")) {
      const card = getFix("MESH_UNREACHABLE", provider, layer, { peerIps: ["203.0.113.4"] });
      const all = textOf(card) + commandsOf(card);
      expect(all, card.key).toContain("51820");
      expect(all, card.key).toContain("203.0.113.4");
      expect(all.replace(", not 0.0.0.0/0", ""), card.key).not.toContain("0.0.0.0/0");
      expect(all, card.key).not.toMatch(/tcp/i);
    }
    const gcp = commandsOf(
      getFix("MESH_UNREACHABLE", "gcp", "cloud", { peerIps: ["203.0.113.4", "2001:db8::1"] }),
    );
    expect(gcp).toContain("--source-ranges 203.0.113.4/32,2001:db8::1/128");

    const unknownPeers = getFix("MESH_UNREACHABLE", "aws", "os");
    expect(commandsOf(unknownPeers)).toContain("<other-server-ip>");
    expect(textOf(unknownPeers)).toContain("your other servers' public IPs");
  });
});

describe("voice", () => {
  it("follows the C9 rules on every card", () => {
    for (const card of allCards()) {
      const where = card.key;
      expect(card.title, where).not.toMatch(/[.!]$/);
      expect(card.title, where).toMatch(/^[A-Z]/);
      expect(card.title, where).not.toContain("!");
      expect(card.steps.length, where).toBeGreaterThanOrEqual(2);
      expect(card.steps.length, where).toBeLessThanOrEqual(6);
      expect(card.estimated_minutes, where).toBeGreaterThanOrEqual(2);
      expect(card.estimated_minutes, where).toBeLessThanOrEqual(5);
      for (const step of card.steps) {
        expect(step.text, where).toMatch(/^[A-Z]/);
        expect(step.text, where).toMatch(/\.$/);
        expect(step.text, where).not.toContain("!");
        // One sentence per step: no sentence break in the middle.
        expect(step.text.slice(0, -1), where).not.toMatch(/[.?!]\s+[A-Z]/);
        if (step.command !== undefined) {
          expect(step.command.trim().length, where).toBeGreaterThan(0);
          expect(step.command, where).not.toMatch(/TODO|FIXME|XXX|undefined|NaN/);
        }
        if (step.link !== undefined) {
          expect(step.link, where).toMatch(/^https:\/\//);
        }
      }
      expect(textOf(card), where).not.toMatch(/TODO|FIXME|undefined|NaN/);
    }
  });
});

describe("renderFixCardText", () => {
  it("numbers steps and puts each command line on its own prefixed line", () => {
    const text = renderFixCardText(getFix("PORT_BLOCKED", "oracle", "os", { ports: [443] }));
    expect(text).toMatchInlineSnapshot(`
      "Open port 443 in the server's iptables rules (about 2 min)

      1. Check the rules first: Oracle's Ubuntu image ends the INPUT chain with a REJECT rule (reject-with icmp-host-prohibited) that blocks new ports.
           $ sudo iptables -L INPUT --line-numbers
         More: https://blogs.oracle.com/developers/enabling-network-traffic-to-ubuntu-images-in-oracle-cloud-infrastructure
      2. Allow new connections on port 443 above the image's default reject rule.
           $ sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
      3. Save the rules so they survive a reboot.
           $ sudo netfilter-persistent save
      4. On Oracle Linux images, which use firewalld instead, allow port 443 and reload it.
           $ sudo firewall-cmd --permanent --add-port=443/tcp && sudo firewall-cmd --reload"
    `);
  });

  it("splits multi-line commands and renders steps without commands", () => {
    const text = renderFixCardText(
      getFix("MESH_UNREACHABLE", "other", "os", { peerIps: ["203.0.113.4", "203.0.113.9"] }),
    );
    expect(text).toContain("   $ sudo ufw allow from 203.0.113.4 to any port 51820 proto udp\n");
    expect(text).toContain("   $ sudo ufw allow from 203.0.113.9 to any port 51820 proto udp\n");
    const cloud = renderFixCardText(getFix("PORT_BLOCKED", "other", "cloud"));
    expect(cloud).not.toContain("$ ");
    expect(cloud.split("\n")[0]).toBe(
      "Open ports 80 and 443 in your provider's firewall (about 3 min)",
    );
  });
});

describe("providers", () => {
  it("labels every provider", () => {
    for (const provider of SERVER_PROVIDERS) {
      expect(PROVIDER_LABELS[provider].length).toBeGreaterThan(0);
      expect(isServerProvider(provider)).toBe(true);
    }
    expect(isServerProvider("linode")).toBe(false);
    expect(isServerProvider(42)).toBe(false);
    expect(fixProviderLabel("oracle")).toBe("Oracle Cloud");
    expect(fixProviderLabel("other")).toBe("your provider");
  });
});
