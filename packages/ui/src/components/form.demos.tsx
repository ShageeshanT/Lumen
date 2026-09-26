"use client";

import { useState } from "react";

import { formatMegabytes } from "../lib/format";

import { Combobox, type ComboboxItem } from "./combobox";
import { Field } from "./field";
import { KeyValueEditor, type KeyValueRow } from "./key-value-editor";
import { SegmentedControl } from "./segmented-control";
import { SliderWithInput } from "./slider-with-input";
import { Switch } from "./switch";

/** Stateful gallery demos. Client-only so the registry can be imported on the server. */

function Stack({ children, width = 360 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="flex w-full flex-col gap-5" style={{ maxWidth: width }}>
      {children}
    </div>
  );
}

const REPOS: ComboboxItem[] = [
  { value: "acme/api", label: "acme/api", meta: "2 h ago", icon: "git-branch", group: "acme" },
  { value: "acme/web", label: "acme/web", meta: "1 d ago", icon: "git-branch", group: "acme" },
  {
    value: "acme/worker",
    label: "acme/worker",
    meta: "3 d ago",
    icon: "git-branch",
    group: "acme",
  },
  {
    value: "shagee/blog",
    label: "shagee/blog",
    meta: "2 mo ago",
    icon: "git-branch",
    group: "shagee",
  },
];

export function ComboboxDemo({
  open = false,
  query = "",
  loading = false,
}: {
  open?: boolean;
  query?: string;
  loading?: boolean;
}) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <div className={open ? "h-[440px] w-full max-w-[360px]" : "w-full max-w-[360px]"}>
      <Field label="Repository">
        <Combobox
          items={REPOS}
          value={value}
          onValueChange={setValue}
          placeholder="Choose a repository"
          searchPlaceholder="Search repositories"
          emptyMessage="No repositories match"
          open={open ? true : undefined}
          defaultQuery={query}
          loading={loading}
          creatable={
            query === "" ? undefined : { label: (q) => `Add “${q}”`, onCreate: () => undefined }
          }
          footer={
            <a
              href="#github"
              className="text-meta text-accent-text inline-flex min-h-6 items-center hover:underline"
            >
              Missing a repository? Configure GitHub access
            </a>
          }
        />
      </Field>
    </div>
  );
}

export function SwitchDemo() {
  const [deploy, setDeploy] = useState(true);
  const [ci, setCi] = useState(false);
  return (
    <Stack>
      <Switch label="Deploy on push" checked={deploy} onCheckedChange={setDeploy} />
      <Switch
        label="Wait for CI"
        description="Deploy only after GitHub checks pass."
        checked={ci}
        onCheckedChange={setCi}
      />
      <Switch label="Small" size="sm" defaultChecked />
      <Switch label="Focused" defaultChecked data-force="focus" />
      <Switch label="Disabled off" disabled />
      <Switch label="Disabled on" disabled defaultChecked />
    </Stack>
  );
}

export function SegmentedDemo() {
  const [range, setRange] = useState("1h");
  const [mode, setMode] = useState("runtime");
  return (
    <Stack width={420}>
      <SegmentedControl
        aria-label="Time range"
        value={range}
        onValueChange={setRange}
        items={["1h", "6h", "24h", "7d", "30d"].map((v) => ({ value: v, label: v }))}
      />
      <SegmentedControl
        aria-label="Log source"
        size="sm"
        value={mode}
        onValueChange={setMode}
        items={[
          { value: "runtime", label: "Runtime", icon: "terminal" },
          { value: "http", label: "HTTP", icon: "globe" },
          { value: "build", label: "Build", icon: "box" },
        ]}
      />
      <SegmentedControl
        aria-label="Environment"
        fullWidth
        value="production"
        onValueChange={() => undefined}
        items={[
          { value: "production", label: "Production" },
          { value: "staging", label: "Staging" },
          { value: "preview", label: "Preview", disabled: true },
        ]}
      />
    </Stack>
  );
}

export function SliderDemo() {
  const [memory, setMemory] = useState(512);
  const [over, setOver] = useState(20 * 1024);
  const [cpu, setCpu] = useState(1);
  return (
    <Stack width={520}>
      <SliderWithInput
        label="Memory"
        unit="MB"
        unitName="megabytes"
        min={128}
        max={16384}
        step={128}
        value={memory}
        onValueChange={setMemory}
        formatValue={formatMegabytes}
        marks={[
          { value: 1024, label: "1 GB" },
          { value: 4096, label: "4 GB" },
          { value: 8192, label: "8 GB" },
        ]}
        limit={{ value: 12288, label: "Server “oracle-1” has 12 GB free" }}
      />
      <SliderWithInput
        label="Memory over the limit"
        unit="MB"
        unitName="megabytes"
        min={128}
        max={24576}
        step={128}
        value={over}
        onValueChange={setOver}
        formatValue={formatMegabytes}
        limit={{ value: 18432, label: "Server “oracle-1” has 18 GB free" }}
      />
      <SliderWithInput
        label="CPU"
        unit="vCPU"
        unitName="virtual CPUs"
        min={0.1}
        max={4}
        step={0.1}
        value={cpu}
        onValueChange={setCpu}
      />
    </Stack>
  );
}

export function KeyValueDemo({ initial }: { initial: KeyValueRow[] }) {
  const [rows, setRows] = useState(initial);
  return (
    <div className="w-full max-w-[560px]">
      <KeyValueEditor label="Variables" rows={rows} onChange={setRows} />
    </div>
  );
}
