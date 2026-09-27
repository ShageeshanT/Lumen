import type { ComponentDoc } from "../examples/types";
import { STATUSES } from "../status/status";

import { Avatar } from "./avatar";
import { AvatarStack } from "./avatar-stack";
import { Badge } from "./badge";
import { Kbd } from "./kbd";
import { StatusMarker } from "./status-marker";
import { StatusTag } from "./status-tag";

export const statusTagDoc: ComponentDoc = {
  slug: "status-tag",
  name: "Status tag",
  group: "Status",
  summary:
    "Status in HUD notation: marker + color + word, never color alone. Building and deploying blink like an LED.",
  components: ["StatusTag", "StatusMarker"],
  examples: [
    {
      id: "all",
      title: "Every status",
      wide: true,
      render: () => (
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
          {STATUSES.map((status) => (
            <StatusTag key={status} status={status} />
          ))}
        </div>
      ),
    },
    {
      id: "detail-sm",
      title: "Detail and small size",
      render: () => (
        <div className="flex flex-col gap-3">
          <StatusTag status="crashed" detail="restarting in 8s" />
          <StatusTag status="active" label="Live" />
          <StatusTag status="failed" size="sm" brackets={false} />
        </div>
      ),
    },
    {
      id: "markers",
      title: "Standalone markers",
      description: "Standalone markers carry their own accessible name.",
      render: () => (
        <div className="flex items-center gap-4">
          {(
            ["active", "building", "failed", "crashed", "sleeping", "stopped", "offline"] as const
          ).map((status) => (
            <StatusMarker key={status} status={status} size={10} standalone />
          ))}
        </div>
      ),
    },
  ],
};

export const badgeDoc: ComponentDoc = {
  slug: "badge",
  name: "Badge",
  group: "Status",
  summary: "Small framed labels and counts.",
  components: ["Badge"],
  examples: [
    {
      id: "variants",
      title: "Variants",
      render: () => (
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge variant="accent">Preview #42</Badge>
          <Badge variant="success" icon="lock">
            Production
          </Badge>
          <Badge variant="warning">Update available</Badge>
          <Badge variant="danger">Offline</Badge>
          <Badge variant="outline">×3</Badge>
        </div>
      ),
    },
    {
      id: "counts",
      title: "Counts and small",
      render: () => (
        <div className="flex flex-wrap items-center gap-3">
          <Badge count={3} />
          <Badge count={12} variant="accent" />
          <Badge count={120} />
          <Badge size="sm" variant="outline">
            oracle-1
          </Badge>
        </div>
      ),
    },
  ],
};

export const avatarDoc: ComponentDoc = {
  slug: "avatar",
  name: "Avatar",
  group: "Status",
  summary: "People are circles, workspaces are squares; initials when there is no image.",
  components: ["Avatar"],
  examples: [
    {
      id: "sizes",
      title: "Sizes and shapes",
      render: () => (
        <div className="flex items-center gap-4">
          <Avatar name="Shagee" size={20} />
          <Avatar name="Ana Ruiz" size={24} />
          <Avatar name="Ben Okafor" size={32} status="online" />
          <Avatar name="Acme" size={32} shape="square" />
          <Avatar name="Broken Image" size={32} src="/does-not-exist.png" />
        </div>
      ),
    },
  ],
};

export const kbdDoc: ComponentDoc = {
  slug: "kbd",
  name: "Keyboard hint",
  group: "Status",
  summary: "Shortcuts as keycaps. Combinations sit together; sequences read “then”.",
  components: ["Kbd"],
  examples: [
    {
      id: "shortcut-sheet",
      title: "Shortcut sheet (SPEC C13)",
      wide: true,
      render: () => (
        <dl className="grid grid-cols-1 gap-x-12 gap-y-2 md:grid-cols-2">
          {(
            [
              ["Command palette", ["mod", "K"]],
              ["Add service", ["mod", "J"]],
              ["Go home", ["G", "then", "H"]],
              ["Go to projects", ["G", "then", "P"]],
              ["Go to servers", ["G", "then", "S"]],
              ["Go to templates", ["G", "then", "T"]],
              ["Switch environment", ["E"]],
              ["Redeploy selected", ["D"]],
              ["Logs", ["L"]],
              ["Variables", ["V"]],
              ["Metrics", ["M"]],
              ["Settings", [","]],
              ["Apply staged changes", ["shift", "enter"]],
              ["Close panel", ["esc"]],
              ["Fit canvas", ["mod", "0"]],
              ["Shortcut sheet", ["?"]],
            ] as const
          ).map(([label, keys]) => (
            <div
              key={label}
              className="border-border flex items-center justify-between gap-3 border-b py-2"
            >
              <dt className="text-body-secondary min-w-0">{label}</dt>
              <dd className="shrink-0">
                <Kbd keys={[...keys]} platform="mac" />
              </dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: "platforms",
      title: "macOS and other platforms",
      render: () => (
        <div className="flex items-center gap-6">
          <Kbd keys={["mod", "K"]} platform="mac" />
          <Kbd keys={["mod", "K"]} platform="other" />
          <Kbd keys={["shift", "enter"]} platform="other" size="sm" />
        </div>
      ),
    },
  ],
};

const TEAM = [
  { name: "Ana Ruiz" },
  { name: "Ben Okafor" },
  { name: "Chen Wei" },
  { name: "Dana Kim" },
  { name: "Eli Novak" },
  { name: "Farah Aziz" },
];

export const avatarStackDoc: ComponentDoc = {
  slug: "avatar-stack",
  name: "Avatar stack",
  group: "Status",
  summary:
    "Who is on a project, in a small overlapping row: four faces at most, then +N. With nobody, the parent says so in words.",
  components: ["AvatarStack"],
  examples: [
    {
      id: "counts",
      title: "One, three, six, none",
      render: () => (
        <div className="flex flex-col gap-4">
          <AvatarStack people={TEAM.slice(0, 1)} />
          <AvatarStack people={TEAM.slice(0, 3)} />
          <AvatarStack people={TEAM} />
          <div className="flex items-center gap-2">
            <AvatarStack people={[]} />
            <span className="text-body-secondary">No members</span>
          </div>
        </div>
      ),
    },
    {
      id: "small-interactive",
      title: "Small, and interactive with names on focus",
      render: () => (
        <div className="flex flex-col gap-4">
          <AvatarStack people={TEAM} size={20} />
          <AvatarStack people={TEAM.slice(0, 4)} interactive />
        </div>
      ),
    },
  ],
};
