import type { ComponentDoc } from "../examples/types";

import { DnsRecordCard } from "./dns-record-card";
import { PortCheckCard, type PortCheck, type PortFix } from "./port-check-card";
import { Stepper, type StepperStep } from "./stepper";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");

// ─── Stepper ─────────────────────────────────────────────────────────────────

const SETUP: StepperStep[] = [
  { id: "verify", label: "Verify" },
  { id: "admin", label: "Admin" },
  { id: "domain", label: "Domain" },
  { id: "github", label: "GitHub" },
  { id: "email", label: "Email", optional: true },
  { id: "backups", label: "Backups", optional: true },
];

const ADD_SERVER: StepperStep[] = [
  { id: "name", label: "Name" },
  { id: "command", label: "Command" },
  { id: "checklist", label: "Checklist" },
  { id: "done", label: "Done" },
];

function doneBefore(steps: StepperStep[], current: string): string[] {
  const index = steps.findIndex((step) => step.id === current);
  return steps.slice(0, Math.max(0, index)).map((step) => step.id);
}

function noop() {
  return undefined;
}

export const stepperDoc: ComponentDoc = {
  slug: "stepper",
  name: "Stepper",
  group: "Specialized",
  summary:
    "Wizard progress: numbered square markers on a rail. Finished steps are buttons, so going back is always one click; phones get “Step 3 of 6”.",
  components: ["Stepper"],
  examples: [
    {
      id: "setup-steps",
      title: "Setup wizard: first, middle, last",
      wide: true,
      render: () => (
        <div className="flex w-full flex-col gap-8">
          {["verify", "domain", "backups"].map((current) => (
            <Stepper
              key={current}
              steps={SETUP}
              current={current}
              completed={doneBefore(SETUP, current)}
              onStepClick={noop}
              collapse="never"
              label={`Setup progress, at ${current}`}
            />
          ))}
        </div>
      ),
    },
    {
      id: "hover",
      title: "A finished step on hover",
      render: () => (
        <Stepper
          steps={ADD_SERVER}
          current="checklist"
          completed={["name", "command"]}
          onStepClick={noop}
          forcedHover="command"
          collapse="never"
          label="Add server progress"
        />
      ),
    },
    {
      id: "vertical",
      title: "Vertical, for the wizard's left column",
      render: () => (
        <Stepper
          steps={SETUP}
          current="github"
          completed={["verify", "admin", "domain"]}
          onStepClick={noop}
          orientation="vertical"
          collapse="never"
        />
      ),
    },
    {
      id: "compact",
      title: "Phone: collapsed",
      render: () => (
        <div className="w-full max-w-[360px]">
          <Stepper
            steps={SETUP}
            current="domain"
            completed={["verify", "admin"]}
            collapse="always"
          />
        </div>
      ),
    },
    {
      id: "responsive",
      title: "Add-server wizard, responsive",
      description: "Full list from 640 px, “Step 2 of 4” below.",
      render: () => (
        <Stepper
          steps={ADD_SERVER}
          current="command"
          completed={["name"]}
          onStepClick={noop}
          label="Add server progress"
        />
      ),
    },
  ],
};

// ─── DnsRecordCard ───────────────────────────────────────────────────────────

const A_RECORD = { type: "A", name: "apps", value: "198.51.100.4", ttl: 300 } as const;

export const dnsRecordDoc: ComponentDoc = {
  slug: "dns-record-card",
  name: "DNS record card",
  group: "Specialized",
  summary:
    "A record to add at the DNS provider: copyable type, name and value, and a live check that says whether it points here yet.",
  components: ["DnsRecordCard"],
  examples: [
    {
      id: "idle",
      title: "Not checked yet",
      render: () => (
        <DnsRecordCard
          record={A_RECORD}
          zone="example.com"
          check={{ status: "idle" }}
          onRecheck={noop}
        />
      ),
    },
    {
      id: "checking",
      title: "Checking",
      render: () => (
        <DnsRecordCard
          record={A_RECORD}
          zone="example.com"
          check={{ status: "checking" }}
          onRecheck={noop}
        />
      ),
    },
    {
      id: "ok",
      title: "Pointing here",
      render: () => (
        <DnsRecordCard
          record={A_RECORD}
          zone="example.com"
          check={{ status: "ok", checkedAt: NOW - 20_000 }}
          now={NOW}
          onRecheck={noop}
        />
      ),
    },
    {
      id: "mismatch",
      title: "Points elsewhere",
      render: () => (
        <DnsRecordCard
          record={A_RECORD}
          zone="example.com"
          check={{ status: "mismatch", observed: "203.0.113.9", checkedAt: NOW - 20_000 }}
          now={NOW}
          onRecheck={noop}
        />
      ),
    },
    {
      id: "missing",
      title: "Not found yet",
      render: () => (
        <DnsRecordCard
          record={A_RECORD}
          zone="example.com"
          check={{ status: "missing", checkedAt: NOW - 3 * 60_000 }}
          now={NOW}
          onRecheck={noop}
        />
      ),
    },
    {
      id: "wildcard-pair",
      title: "Wildcard pair",
      description: "One name for the dashboard and a wildcard so every app gets its own.",
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <DnsRecordCard
            record={A_RECORD}
            zone="example.com"
            check={{ status: "ok", checkedAt: NOW - 20_000 }}
            now={NOW}
            onRecheck={noop}
          />
          <DnsRecordCard
            record={{ type: "A", name: "*.apps", value: "198.51.100.4" }}
            zone="example.com"
            check={{ status: "missing", checkedAt: NOW - 20_000 }}
            now={NOW}
            onRecheck={noop}
          />
        </div>
      ),
    },
    {
      id: "cname",
      title: "CNAME for a custom domain",
      render: () => (
        <DnsRecordCard
          record={{ type: "CNAME", name: "shop", value: "web-production-k3n8.apps.example.com" }}
          zone="acme.co"
          check={{ status: "ok", checkedAt: NOW - 45_000 }}
          now={NOW}
          onRecheck={noop}
        />
      ),
    },
  ],
};

// ─── PortCheckCard ───────────────────────────────────────────────────────────

function ports(overrides: Partial<Record<number, PortCheck["status"]>> = {}): PortCheck[] {
  return [
    { port: 80, protocol: "tcp", label: "HTTP (certificates)", status: overrides[80] ?? "open" },
    { port: 443, protocol: "tcp", label: "HTTPS", status: overrides[443] ?? "open" },
    {
      port: 51820,
      protocol: "udp",
      label: "Private network",
      status: overrides[51820] ?? "open",
      ...(overrides[51820] === "unknown"
        ? { note: "Couldn't check from here; only needed between servers" }
        : {}),
    },
  ];
}

const ORACLE_443: PortFix = {
  title: "Open port 443 on Oracle Cloud",
  sections: [
    {
      heading: "In the Oracle Cloud console",
      steps: [
        {
          text: "Open Networking → Virtual cloud networks, then your VCN's default security list.",
        },
        { text: "Add an ingress rule: source 0.0.0.0/0, TCP, destination port 443." },
      ],
    },
    {
      heading: "On the server",
      steps: [
        {
          text: "Oracle images ship with iptables rules that drop the port. Allow it and save:",
          command: "sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT",
        },
        { text: "Keep the rule after a reboot:", command: "sudo netfilter-persistent save" },
      ],
    },
  ],
};

const AWS_80: PortFix = {
  title: "Open port 80 on AWS",
  steps: [
    { text: "In EC2 → Instances, open the instance's security group." },
    { text: "Edit inbound rules and add HTTP (TCP 80) from 0.0.0.0/0 and ::/0." },
  ],
};

const GENERIC_443: PortFix = {
  title: "Open port 443",
  steps: [
    { text: "Allow TCP 443 in your provider's firewall or security group." },
    { text: "If the server runs ufw, allow it there too:", command: "sudo ufw allow 443/tcp" },
  ],
};

export const portCheckDoc: ComponentDoc = {
  slug: "port-check-card",
  name: "Port check card",
  group: "Specialized",
  summary:
    "The ports a server needs, each with a reachability result. A blocked port opens into the fix for the user's provider.",
  components: ["PortCheckCard"],
  examples: [
    {
      id: "checking",
      title: "Checking",
      render: () => (
        <PortCheckCard
          provider="oracle"
          ports={ports({ 80: "checking", 443: "checking", 51820: "checking" })}
          running
          onRerun={noop}
        />
      ),
    },
    {
      id: "open",
      title: "All reachable",
      render: () => (
        <PortCheckCard
          provider="hetzner"
          ports={ports()}
          lastRunAt={NOW - 20_000}
          now={NOW}
          onRerun={noop}
        />
      ),
    },
    {
      id: "oracle-blocked",
      title: "Oracle: 443 blocked, fix open",
      wide: true,
      render: () => (
        <PortCheckCard
          provider="oracle"
          ports={ports({ 443: "blocked", 51820: "unknown" })}
          fixes={{ 443: ORACLE_443 }}
          defaultExpanded={[443]}
          lastRunAt={NOW - 20_000}
          now={NOW}
          onRerun={noop}
        />
      ),
    },
    {
      id: "aws-blocked",
      title: "AWS: 80 blocked",
      render: () => (
        <PortCheckCard
          provider="aws"
          ports={ports({ 80: "blocked" })}
          fixes={{ 80: AWS_80 }}
          defaultExpanded={[80]}
          lastRunAt={NOW - 20_000}
          now={NOW}
          onRerun={noop}
        />
      ),
    },
    {
      id: "generic",
      title: "Other provider, collapsed",
      render: () => (
        <PortCheckCard
          provider="other"
          ports={ports({ 443: "blocked" })}
          fixes={{ 443: GENERIC_443 }}
          lastRunAt={NOW - 20_000}
          now={NOW}
          onRerun={noop}
        />
      ),
    },
    {
      id: "udp-unknown",
      title: "UDP could not be checked",
      render: () => (
        <PortCheckCard
          provider="digitalocean"
          ports={ports({ 51820: "unknown" })}
          lastRunAt={NOW - 20_000}
          now={NOW}
          onRerun={noop}
        />
      ),
    },
  ],
};
