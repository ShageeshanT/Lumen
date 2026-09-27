import type { ReactNode } from "react";

import {
  LUMEN_ERROR_CODES,
  makeError,
  type ErrorContext,
  type LumenError,
} from "@lumen/shared/errors";

import type { ComponentDoc } from "../examples/types";

import { Alert } from "./alert";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorCard } from "./error-card";
import { LiveStepsDemo, ToastDemo } from "./feedback.demos";
import { ModalPreview } from "./overlays.demos";
import { ProgressSteps, type ProgressStep, type StepState } from "./progress-steps";
import { StatusTag } from "./status-tag";
import { Toast, type ToastRecord } from "./toast";

const noop = () => undefined;

function record(partial: Partial<ToastRecord> & { title: string }): ToastRecord {
  return { id: partial.title, variant: "info", duration: 8000, ...partial };
}

function ToastColumn({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-[360px] flex-col gap-2">{children}</div>;
}

export const toastDoc: ComponentDoc = {
  slug: "toast",
  name: "Toast",
  group: "Feedback",
  summary:
    "Short confirmations at the bottom right. Three at most, newest at the bottom, eight seconds each; hover, focus or leaving the window pauses the timer. F8 jumps to the newest; Escape closes it.",
  components: ["Toast", "Toaster"],
  examples: [
    {
      id: "variants",
      title: "Four variants",
      render: () => (
        <ToastColumn>
          <Toast toast={record({ title: "Domain verified", variant: "success" })} progress={1} />
          <Toast
            toast={record({
              title: "Deploy queued",
              description: "api starts building when oracle-1 is free.",
            })}
            progress={1}
          />
          <Toast
            toast={record({
              title: "Server is running low on disk",
              description: "oracle-1 has 1.2 GB free.",
              variant: "warning",
            })}
            progress={1}
          />
          <Toast
            toast={record({
              title: "Couldn't reach GitHub",
              variant: "danger",
              action: { label: "Retry", onClick: noop },
            })}
            progress={1}
          />
        </ToastColumn>
      ),
    },
    {
      id: "undo-action",
      title: "With undo and with an action",
      render: () => (
        <ToastColumn>
          <Toast
            toast={record({ title: "Variable deleted", undo: noop })}
            onDismiss={noop}
            progress={0.8}
          />
          <Toast
            toast={record({
              title: "Deploy failed",
              description: "The build failed. The first error is in the logs.",
              variant: "danger",
              action: { label: "View logs", onClick: noop },
            })}
            onDismiss={noop}
            progress={0.8}
          />
        </ToastColumn>
      ),
    },
    {
      id: "stack",
      title: "Stack of three, paused on hover",
      description:
        "The newest sits at the bottom. The hovered toast shows its close button and its timer bar stops.",
      render: () => (
        <ToastColumn>
          <Toast toast={record({ title: "Variables saved", variant: "success" })} progress={0.2} />
          <Toast
            toast={record({ title: "Replica added", description: "api now runs 2 replicas." })}
            progress={0.55}
          />
          <Toast
            toast={record({ title: "Variable deleted", undo: noop })}
            onDismiss={noop}
            paused
            progress={0.9}
            forceHover
          />
        </ToastColumn>
      ),
    },
    {
      id: "live",
      title: "Live toaster",
      description:
        "Press a few buttons: the fourth toast pushes the oldest out. F8 focuses the newest; Escape closes it.",
      render: () => <ToastDemo />,
    },
  ],
};

export const alertDoc: ComponentDoc = {
  slug: "alert",
  name: "Alert",
  group: "Feedback",
  summary:
    "Inline banners that explain a situation and offer the next step. Dismissible unless the problem is still there.",
  components: ["Alert"],
  examples: [
    {
      id: "variants",
      title: "Variants, with and without a title",
      wide: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <Alert title="Found a .env.example" action={{ label: "Add them", onClick: noop }}>
            It lists 6 variables this service expects. Add them now so the first deploy works.
          </Alert>
          <Alert variant="warning" title="Resizing this volume restarts postgres">
            Expect about 20 seconds of downtime. Connections retry on their own.
          </Alert>
          <Alert variant="danger" action={{ label: "Run backup now", onClick: noop }}>
            The last backup failed. Your data is safe; the next run is at 03:00.
          </Alert>
        </div>
      ),
    },
    {
      id: "dismissible-compact",
      title: "Dismissible and compact",
      wide: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <Alert dismissible title="Preview environments are on">
            Every pull request gets its own copy of this project.
          </Alert>
          <Alert compact dismissible>
            Lumen 0.9 is available. Update from Settings.
          </Alert>
          <Alert compact variant="warning" action={{ label: "Review", href: "#staged" }}>
            2 changes are staged and not deployed.
          </Alert>
        </div>
      ),
    },
    {
      id: "global",
      title: "Server offline (critical, page banner)",
      wide: true,
      render: () => (
        <div className="border-border -mx-6 w-[calc(100%+48px)] border-y">
          <Alert
            global
            critical
            variant="danger"
            title="oracle-1 isn't responding"
            action={{ label: "Open troubleshooting", onClick: noop }}
          >
            Your apps keep running if the machine is up; only the dashboard has lost contact.
          </Alert>
        </div>
      ),
    },
    {
      id: "in-modal",
      title: "Inside a modal",
      description: "A failed save explains itself above the form instead of closing the dialog.",
      wide: true,
      render: () => (
        <ModalPreview
          size="md"
          height={380}
          title="Add a custom domain"
          footer={
            <>
              <Button variant="ghost">Cancel</Button>
              <Button variant="primary">Try again</Button>
            </>
          }
        >
          <Alert variant="danger" title="app.example.com is already in use">
            Another service in this workspace owns it. Remove it there first, or pick a different
            name.
          </Alert>
        </ModalPreview>
      ),
    },
  ],
};

const T0 = Date.UTC(2026, 8, 26, 12, 0, 0);
const STAGES = ["Queued", "Building", "Pre-deploy", "Deploying", "Health check", "Live"] as const;

/** Six stages; states and seconds per stage (started 0 s, then the durations). */
function stages(states: StepState[], seconds: number[] = [2, 48, 6, 14, 9, 0]): ProgressStep[] {
  let clock = T0;
  return STAGES.map((label, index) => {
    const state = states[index] ?? "pending";
    const started = clock;
    const length = (seconds[index] ?? 0) * 1000;
    clock += state === "skipped" ? 0 : length;
    return {
      id: label,
      label,
      state,
      ...(state === "pending" || state === "skipped" ? {} : { startedAt: started }),
      ...(state === "done" || state === "failed" ? { finishedAt: started + length } : {}),
    };
  });
}

/** "Now" for the active examples: 12 s into the active step. */
const NOW_AT_STEP_3 = T0 + (2 + 48 + 12) * 1000;
const NOW_AT_STEP_4 = T0 + (2 + 48 + 6 + 7) * 1000;

export const progressStepsDoc: ComponentDoc = {
  slug: "progress-steps",
  name: "Progress steps",
  group: "Feedback",
  summary:
    "The deploy timeline. Each stage shows its state and duration; the active one ticks every second and each change is announced.",
  components: ["ProgressSteps", "LiveRegion"],
  examples: [
    {
      id: "states",
      title: "Pending, active, done, failed",
      wide: true,
      render: () => (
        <div className="flex w-full flex-col gap-8">
          <ProgressSteps steps={stages([])} now={T0} />
          <ProgressSteps steps={stages(["done", "done", "active"])} now={NOW_AT_STEP_3} />
          <ProgressSteps
            steps={stages(["done", "done", "done", "done", "done", "done"])}
            now={T0}
          />
          <ProgressSteps steps={stages(["done", "done", "done", "failed"])} now={T0} />
        </div>
      ),
    },
    {
      id: "skipped",
      title: "Skipped step",
      description: "No pre-deploy command is set, so that stage is skipped.",
      wide: true,
      render: () => (
        <ProgressSteps steps={stages(["done", "done", "skipped", "active"])} now={NOW_AT_STEP_4} />
      ),
    },
    {
      id: "vertical",
      title: "Vertical, in the inspector",
      render: () => (
        <div className="border-border bg-surface rounded-card flex w-full max-w-[360px] flex-col gap-4 border p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-card-title">api</span>
            <StatusTag status="deploying" />
          </div>
          <ProgressSteps
            orientation="vertical"
            now={NOW_AT_STEP_4}
            steps={stages(["done", "done", "done", "active"]).map((step) =>
              step.id === "Building"
                ? { ...step, detail: "Railpack · Node 22 · image 212 MB" }
                : step.id === "Deploying"
                  ? { ...step, detail: "Starting 2 replicas on oracle-1" }
                  : step,
            )}
          />
        </div>
      ),
    },
    {
      id: "live",
      title: "Live ticking",
      render: () => <LiveStepsDemo />,
      wide: true,
    },
  ],
};

export const emptyStateDoc: ComponentDoc = {
  slug: "empty-state",
  name: "Empty state",
  group: "Feedback",
  summary: "Before there is anything to show: what this place is for and the one thing to do next.",
  components: ["EmptyState"],
  examples: [
    {
      id: "no-logs",
      title: "No logs yet",
      render: () => (
        <EmptyState
          icon="file-text"
          title="No logs yet"
          description="Your app hasn't printed anything since this deploy started."
          secondary={{ label: "How logging works", href: "#docs-logs" }}
        />
      ),
    },
    {
      id: "viewer",
      title: "Viewer role, no action",
      render: () => (
        <EmptyState
          icon="server"
          title="No servers yet"
          description="Ask an admin to add a server. You'll see it here as soon as it connects."
        />
      ),
    },
    {
      id: "first-project",
      title: "Create your first project, with quick starts",
      wide: true,
      render: () => (
        <EmptyState
          icon="layers"
          title="Create your first project"
          description="A project holds your services, databases and their settings."
          tiles={[
            {
              icon: "git-branch",
              title: "GitHub repo",
              description: "Deploy on every push",
              onSelect: noop,
            },
            {
              icon: "database",
              title: "Database",
              description: "Postgres, MySQL, Redis",
              onSelect: noop,
            },
            {
              icon: "box",
              title: "Docker image",
              description: "Run a prebuilt image",
              onSelect: noop,
            },
          ]}
          action={{ label: "Empty project", icon: "plus", onClick: noop }}
        />
      ),
    },
    {
      id: "hero",
      title: "Connect your first server (hero)",
      wide: true,
      render: () => (
        <EmptyState
          size="hero"
          icon="server"
          title="Connect your first server"
          description="Paste one command into any Linux VM you own. It shows up here within a minute."
          tiles={[
            { icon: "server", title: "Oracle Cloud", description: "Always-free ARM" },
            { icon: "server", title: "Hetzner", description: "Cloud or dedicated" },
            { icon: "server", title: "AWS, GCP, Azure", description: "Any VM" },
            { icon: "hard-drive", title: "Bare metal", description: "Your own hardware" },
          ]}
          action={{ label: "Connect a server", onClick: noop }}
          secondary={{ label: "What the installer does", href: "#docs-installer" }}
        />
      ),
    },
  ],
};

/** Sample context so every catalog message reads the way users see it. */
const SAMPLE_CONTEXT: ErrorContext = {
  port: 443,
  serverName: "oracle-1",
  memoryMb: 512,
  suggestedMemoryMb: 1024,
  hostname: "api.acme.dev",
  variableKey: "DATABASE_URL",
  cycle: ["API_URL", "WEB_URL", "API_URL"],
  image: "ghcr.io/acme/api:1.4",
  repo: "acme/api",
  volumeName: "pg-data",
  freeDiskGb: 1.2,
  resource: "project",
  roleNeeded: "admin",
  retryAfterS: 30,
};

const J6_COUNT = 20;

function catalogCards(codes: readonly (typeof LUMEN_ERROR_CODES)[number][]) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
      {codes.map((code) => (
        <ErrorCard
          key={code}
          error={makeError(code, SAMPLE_CONTEXT)}
          url="https://lumen.acme.dev/p/shop"
        />
      ))}
    </div>
  );
}

const OOM_WITH_RAW: LumenError = makeError("OOM_KILLED", {
  ...SAMPLE_CONTEXT,
  supportId: "sup_01J9Z4K7QX",
  raw: [
    "container api-7f9c exited: OOMKilled=true, exit code 137",
    "memory.max: 536870912 (512 MB)",
    "memory.peak: 536866816",
    "last log line: FATAL: JavaScript heap out of memory",
  ].join("\n"),
});

const COMMAND_ACTION: LumenError = {
  ...makeError("AGENT_OFFLINE", SAMPLE_CONTEXT),
  action: {
    kind: "command",
    label: "Reinstall command",
    command: "curl -fsSL https://lumen.acme.dev/install.sh | sudo sh -s -- --token lmn_4f2a9c",
  },
};

export const errorCardDoc: ComponentDoc = {
  slug: "error-card",
  name: "Error card",
  group: "Feedback",
  summary:
    "Every failure the user can see, from the error catalog: what happened, why, and the one thing to do about it. Stack traces never appear.",
  components: ["ErrorCard"],
  examples: [
    {
      id: "raw-expanded",
      title: "Raw details open, with a support id",
      wide: true,
      render: () => (
        <ErrorCard error={OOM_WITH_RAW} defaultRawOpen url="https://lumen.acme.dev/p/shop" />
      ),
    },
    {
      id: "command",
      title: "Command action",
      render: () => <ErrorCard error={COMMAND_ACTION} url="https://lumen.acme.dev/servers" />,
    },
    {
      id: "compact",
      title: "Compact, in a deployment row",
      render: () => (
        <div className="border-border bg-surface rounded-card flex w-full flex-col gap-3 border p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body">feat: rate limits</span>
            <StatusTag status="failed" />
          </div>
          <ErrorCard compact error={makeError("CRASH_LOOP", SAMPLE_CONTEXT)} />
        </div>
      ),
    },
    {
      id: "catalog",
      title: "Every J6 catalog entry",
      description: "Rendered from makeError() in @lumen/shared with sample context.",
      wide: true,
      render: () => catalogCards(LUMEN_ERROR_CODES.slice(0, J6_COUNT)),
    },
    {
      id: "catalog-infra",
      title: "Infrastructure errors",
      description: "Validation, access and server errors; some have no action.",
      wide: true,
      render: () => catalogCards(LUMEN_ERROR_CODES.slice(J6_COUNT)),
    },
  ],
};
