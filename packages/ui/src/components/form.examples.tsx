import type { ComponentDoc } from "../examples/types";

import { Checkbox } from "./checkbox";
import { CopyField } from "./copy-field";
import { Field } from "./field";
import { ComboboxDemo, KeyValueDemo, SegmentedDemo, SliderDemo, SwitchDemo } from "./form.demos";
import { Input } from "./input";
import { RadioGroup } from "./radio-group";
import { SecretField } from "./secret-field";
import { Select } from "./select";
import { Skeleton } from "./skeleton";
import { Textarea } from "./textarea";

function Stack({ children, width = 360 }: { children: React.ReactNode; width?: number }) {
  return (
    <div className="flex w-full flex-col gap-5" style={{ maxWidth: width }}>
      {children}
    </div>
  );
}

export const inputDoc: ComponentDoc = {
  slug: "input",
  name: "Input",
  group: "Form controls",
  summary:
    "Text entry. Focus draws an accent frame, a soft halo and accent corner brackets. Identifiers use mono.",
  components: ["Input", "Field"],
  examples: [
    {
      id: "states",
      title: "States",
      render: () => (
        <Stack>
          <Field label="Service name" helper="Lowercase letters, numbers and dashes.">
            <Input placeholder="api" />
          </Field>
          <Field label="Service name">
            <Input defaultValue="api-production" data-force="focus" />
          </Field>
          <Field label="Start command" error="Add a start command, for example “node server.js”.">
            <Input defaultValue="" placeholder="node server.js" monospace />
          </Field>
          <Field label="Region" disabled>
            <Input defaultValue="eu-frankfurt-1" />
          </Field>
        </Stack>
      ),
    },
    {
      id: "decorated",
      title: "Icon, mono, read-only, small",
      render: () => (
        <Stack>
          <Field label="Search" hideLabel>
            <Input type="search" leadingIcon="search" placeholder="Search services" />
          </Field>
          <Field label="Health check path" optional>
            <Input monospace defaultValue="/health" />
          </Field>
          <Field label="Private domain" helper="Only services in this project can reach it.">
            <Input monospace readOnly defaultValue="api.production.lumen.internal" />
          </Field>
          <Field label="Port" hideLabel>
            <Input size="sm" monospace defaultValue="3000" />
          </Field>
        </Stack>
      ),
    },
    {
      id: "field-states",
      title: "Field: required, locked by config, hint",
      render: () => (
        <Stack>
          <Field label="Name" required>
            <Input defaultValue="Acme" />
          </Field>
          <Field
            label="Build command"
            lockedBy="lumen.toml"
            helper="Set in lumen.toml under [build] command."
          >
            <Input monospace defaultValue="npm run build" />
          </Field>
          <Field label="Watch paths" hint={{ label: "Examples", href: "#watch-paths" }}>
            <Input monospace defaultValue="apps/api/**" />
          </Field>
        </Stack>
      ),
    },
  ],
};

export const textareaDoc: ComponentDoc = {
  slug: "textarea",
  name: "Textarea",
  group: "Form controls",
  summary: "Multi-line text that grows with its content up to a limit, then scrolls.",
  components: ["Textarea"],
  examples: [
    {
      id: "states",
      title: "Prose, raw .env, invalid",
      render: () => (
        <Stack width={420}>
          <Field label="Note" optional helper="Shows in the deployment history.">
            <Textarea placeholder="Why this change?" />
          </Field>
          <Field label="Raw variables">
            <Textarea
              monospace
              rows={4}
              defaultValue={
                "DATABASE_URL=${{ postgres.DATABASE_URL }}\nPORT=3000\nNODE_ENV=production"
              }
            />
          </Field>
          <Field label="Raw variables" error="Line 2: names can't start with a number.">
            <Textarea monospace rows={2} defaultValue={"API_KEY=abc\n2FA_SECRET=xyz"} />
          </Field>
        </Stack>
      ),
    },
  ],
};

const RESTART = [
  {
    value: "on_failure",
    label: "On failure",
    description: "Restart when the app exits with an error.",
  },
  { value: "always", label: "Always", description: "Restart whenever the app stops." },
  { value: "never", label: "Never", description: "Leave it stopped." },
];

export const selectDoc: ComponentDoc = {
  slug: "select",
  name: "Select",
  group: "Form controls",
  summary: "One choice from a short list. Typeahead, arrow keys and Escape work as expected.",
  components: ["Select"],
  examples: [
    {
      id: "closed",
      title: "Closed: value, placeholder, invalid, disabled",
      render: () => (
        <Stack>
          <Field label="Restart policy">
            <Select options={RESTART} defaultValue="on_failure" />
          </Field>
          <Field label="Builder">
            <Select
              placeholder="Choose a builder"
              options={[
                { value: "auto", label: "Automatic", icon: "sparkles" },
                { value: "dockerfile", label: "Dockerfile", icon: "file-code" },
                { value: "image", label: "Prebuilt image", icon: "box" },
              ]}
            />
          </Field>
          <Field label="Server" error="Choose a server with enough memory.">
            <Select options={[{ value: "oracle-1", label: "oracle-1" }]} />
          </Field>
          <Field label="Region" disabled>
            <Select options={[{ value: "fra", label: "Frankfurt" }]} defaultValue="fra" />
          </Field>
        </Stack>
      ),
    },
    {
      id: "open",
      title: "Open with descriptions",
      forcesModal: true,
      render: () => (
        <div className="h-[260px] w-full max-w-[360px]">
          <Field label="Restart policy">
            <Select options={RESTART} defaultValue="on_failure" open />
          </Field>
        </div>
      ),
    },
  ],
};

export const comboboxDoc: ComponentDoc = {
  slug: "combobox",
  name: "Combobox",
  group: "Form controls",
  summary:
    "Pick from a long or remote list by typing. Groups, meta, loading, empty and create states.",
  components: ["Combobox"],
  examples: [
    { id: "closed", title: "Closed", render: () => <ComboboxDemo /> },
    { id: "open", title: "Open with groups", render: () => <ComboboxDemo open /> },
    {
      id: "empty-create",
      title: "No match, offer to create",
      render: () => <ComboboxDemo open query="acme/billing" />,
    },
    { id: "loading", title: "Loading remote results", render: () => <ComboboxDemo open loading /> },
  ],
};

export const switchDoc: ComponentDoc = {
  slug: "switch",
  name: "Switch",
  group: "Form controls",
  summary: "A hardware toggle for settings that apply on their own. Space toggles.",
  components: ["Switch"],
  examples: [{ id: "states", title: "States", render: () => <SwitchDemo /> }],
};

export const checkboxDoc: ComponentDoc = {
  slug: "checkbox",
  name: "Checkbox",
  group: "Form controls",
  summary: "Independent yes/no choices, with an indeterminate state for select-all.",
  components: ["Checkbox"],
  examples: [
    {
      id: "states",
      title: "States",
      render: () => (
        <Stack>
          <Checkbox label="Select all services" checked="indeterminate" />
          <Checkbox label="api" defaultChecked />
          <Checkbox label="worker" />
          <Checkbox
            label="Also restore variables from that time"
            description="Off by default. Current variables stay unless you check this."
          />
          <Checkbox label="I understand the data is deleted" invalid />
          <Checkbox label="Focused" data-force="focus" />
          <Checkbox label="Disabled" disabled defaultChecked />
        </Stack>
      ),
    },
  ],
};

export const radioDoc: ComponentDoc = {
  slug: "radio-group",
  name: "Radio group",
  group: "Form controls",
  summary: "One choice from a few. Cards for big decisions; arrow keys move and select.",
  components: ["RadioGroup"],
  examples: [
    {
      id: "list",
      title: "List",
      render: () => (
        <RadioGroup aria-label="Restart policy" options={RESTART} defaultValue="on_failure" />
      ),
    },
    {
      id: "cards",
      title: "Cards",
      wide: true,
      render: () => (
        <RadioGroup
          aria-label="Domain"
          variant="cards"
          orientation="horizontal"
          defaultValue="own"
          className="w-full"
          options={[
            {
              value: "own",
              label: "I have a domain",
              icon: "globe",
              description: "Point a wildcard record at this server. We show you the exact record.",
            },
            {
              value: "temporary",
              label: "Use a free temporary address",
              icon: "zap",
              description: "Works right away with an IP-based address. Fine for trying Lumen.",
            },
          ]}
        />
      ),
    },
  ],
};

export const segmentedDoc: ComponentDoc = {
  slug: "segmented-control",
  name: "Segmented control",
  group: "Form controls",
  summary: "Mutually exclusive modes. The selected block slides between segments.",
  components: ["SegmentedControl"],
  examples: [
    {
      id: "states",
      title: "Ranges, modes with icons, full width",
      render: () => <SegmentedDemo />,
    },
  ],
};

export const sliderDoc: ComponentDoc = {
  slug: "slider-with-input",
  name: "Slider with input",
  group: "Form controls",
  summary:
    "Resource limits: a fader and a number that stay in sync, aware of the server's capacity.",
  components: ["SliderWithInput"],
  examples: [{ id: "states", title: "Memory, over the limit, CPU", render: () => <SliderDemo /> }],
};

export const keyValueDoc: ComponentDoc = {
  slug: "key-value-editor",
  name: "Key-value editor",
  group: "Form controls",
  summary:
    "Rows of names and values. Paste a .env block to fill it; bad and duplicate names are flagged.",
  components: ["KeyValueEditor"],
  examples: [
    { id: "empty", title: "Empty", render: () => <KeyValueDemo initial={[]} /> },
    {
      id: "rows",
      title: "Rows, a duplicate, a sealed value",
      render: () => (
        <KeyValueDemo
          initial={[
            { key: "DATABASE_URL", value: "${{ postgres.DATABASE_URL }}" },
            { key: "PORT", value: "3000" },
            { key: "PORT", value: "8080" },
            { key: "STRIPE_KEY", value: "", sealed: true },
          ]}
        />
      ),
    },
  ],
};

export const copyFieldDoc: ComponentDoc = {
  slug: "copy-field",
  name: "Copy and secret fields",
  group: "Form controls",
  summary:
    "Read-only values with one-click copy. Secrets stay masked in the DOM until revealed and mask again after 10 s.",
  components: ["CopyField", "SecretField", "SealedValue"],
  examples: [
    {
      id: "copy",
      title: "Copy",
      render: () => (
        <Stack width={420}>
          <CopyField
            label="install command"
            value="curl -fsSL https://get.lumen.dev/install.sh | sh -s -- --token lmn_join_4fQ8"
          />
          <CopyField label="private domain" value="api.production.lumen.internal" />
          <CopyField
            label="deployment id"
            value="dep_01j8x9k2d3m4n5p6q7r8s9t0v1"
            truncate="middle"
            size="sm"
          />
        </Stack>
      ),
    },
    {
      id: "secret",
      title: "Secret: masked, sealed",
      render: () => (
        <Stack width={420}>
          <SecretField
            label="DATABASE_URL"
            value="postgres://app:s3cr3t@postgres.lumen.internal:5432/app"
          />
          <SecretField label="STRIPE_KEY" value="" sealed />
        </Stack>
      ),
    },
  ],
};

export const skeletonDoc: ComponentDoc = {
  slug: "skeleton",
  name: "Skeleton",
  group: "Feedback",
  summary:
    "Placeholders shaped like what is loading, with a slow light sweep that stops under reduced motion.",
  components: ["Skeleton"],
  examples: [
    {
      id: "primitives",
      title: "Block, text, circle",
      render: () => (
        <div className="flex w-full max-w-[420px] items-start gap-4">
          <Skeleton variant="circle" width={32} height={32} />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton width="40%" height={16} />
            <Skeleton variant="text" lines={3} />
          </div>
        </div>
      ),
    },
  ],
};
