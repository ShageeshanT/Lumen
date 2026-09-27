import type { ErrorContext, LumenError, LumenErrorCode } from "./types";

type CatalogEntry = (ctx: ErrorContext) => Omit<LumenError, "code" | "raw" | "supportId">;

function formatMemory(mb: number): string {
  return mb >= 1024 && mb % 1024 === 0 ? `${String(mb / 1024)} GB` : `${String(mb)} MB`;
}

/**
 * The error catalog. Titles follow SPEC J6 word for word; explanations and
 * fixes follow the C9 voice: calm, second person, no blame, no jargon.
 */
export const catalog: Record<LumenErrorCode, CatalogEntry> = {
  PORT_BLOCKED: (ctx) => {
    const port = ctx.port ?? 443;
    return {
      title: `Port ${String(port)} is blocked on your server`,
      explanation: `Traffic can't reach port ${String(port)}. Most cloud providers block it in their firewall until you open it.`,
      fix: "Open the port in your provider's firewall and, if needed, in the server's own firewall. The fix card has the exact steps for your provider.",
      action: { kind: "button", label: "Show the fix", actionId: "open_fix_card" },
    };
  },

  AGENT_OFFLINE: (ctx) => ({
    title: `Server '${ctx.serverName ?? "unknown"}' isn't responding`,
    explanation:
      "The Lumen agent on this server hasn't checked in. Your apps keep running if the machine is up; only the dashboard has lost contact.",
    fix: "Check that the server is powered on and can reach the internet, then follow the troubleshooting steps. Reinstalling the agent is safe.",
    action: { kind: "button", label: "Open troubleshooting", actionId: "open_troubleshooting" },
  }),

  DISK_FULL: (ctx) => ({
    title: "Your server is almost out of disk space",
    explanation:
      ctx.freeDiskGb === undefined
        ? "Builds need free disk to work. Old images and build cache usually take most of the space."
        : `Only ${String(ctx.freeDiskGb)} GB is free. Builds need at least 2 GB. Old images and build cache usually take most of the space.`,
    fix: "Clean up unused images and build cache. If that isn't enough, resize the disk or move services to another server.",
    action: { kind: "button", label: "Clean up images and build cache", actionId: "clean_up_disk" },
  }),

  OOM_KILLED: (ctx) => {
    const current = ctx.memoryMb === undefined ? "its memory limit" : formatMemory(ctx.memoryMb);
    const suggested = formatMemory(ctx.suggestedMemoryMb ?? (ctx.memoryMb ?? 512) * 2);
    return {
      title: "Your app ran out of memory",
      explanation: `Your app used all of ${current} and was stopped. This happens when the limit is lower than the app needs.`,
      fix: `Give it ${suggested} and redeploy. You can also look for memory leaks in the logs.`,
      action: {
        kind: "button",
        label: `Increase memory to ${suggested}`,
        actionId: "increase_memory",
      },
    };
  },

  CRASH_LOOP: () => ({
    title: "Your app keeps crashing on start",
    explanation:
      "The app exited right after starting several times in a row, so Lumen stopped restarting it. The reason is usually in the last log lines.",
    fix: "Read the last error in the logs, fix it, and redeploy. Lumen restarts the app as soon as a new deployment succeeds.",
    action: { kind: "button", label: "Jump to the last error", actionId: "jump_to_logs" },
  }),

  HEALTHCHECK_TIMEOUT: (ctx) => ({
    title: "Your app didn't respond in time",
    explanation: `Lumen waited for the app to accept connections${ctx.port === undefined ? "" : ` on port ${String(ctx.port)}`} and it never did, so the previous version stayed live.`,
    fix: "Check that the app listens on the PORT variable, or set a healthcheck path and a longer timeout in Settings.",
    action: { kind: "button", label: "Set a healthcheck path", actionId: "set_healthcheck" },
  }),

  NO_START_COMMAND: () => ({
    title: "We couldn't figure out how to start your app",
    explanation:
      "No start script, Procfile or Dockerfile CMD was found, so Lumen doesn't know which command runs the app.",
    fix: 'Set a start command in Settings, for example "node server.js" or "python app.py".',
    action: { kind: "button", label: "Set a start command", actionId: "set_start_command" },
  }),

  BUILD_LOCKFILE_MISSING: () => ({
    title: "No lockfile found",
    explanation:
      "The repository has a package manifest but no lockfile, so the build can't install the exact dependency versions you tested with.",
    fix: "Run your package manager once locally, commit the lockfile it creates, and push. The build will pick it up.",
    action: { kind: "link", label: "Open the lockfile guide", href: "/docs/builds/lockfiles" },
  }),

  BUILD_FAILED_GENERIC: () => ({
    title: "Your build failed",
    explanation:
      "The build stopped with an error. The first error line in the build logs usually explains why.",
    fix: "Fix the error the log points at and push again. Builds are retried automatically on every push.",
    action: { kind: "button", label: "Show the first error", actionId: "jump_to_logs" },
  }),

  PRE_DEPLOY_FAILED: () => ({
    title: "Your pre-deploy command failed",
    explanation:
      "Your previous version is still live. The pre-deploy command (for example a migration) exited with an error, so the new version was not started.",
    fix: "Read the command's output in the deploy logs, fix it, and redeploy.",
    action: { kind: "button", label: "View logs", actionId: "view_logs" },
  }),

  VARIABLE_REF_MISSING: (ctx) => ({
    title: "A variable references something that doesn't exist",
    explanation: `${ctx.variableKey === undefined ? "A variable" : `The variable ${ctx.variableKey}`} points to a service or key that isn't in this environment, so the deploy can't resolve it.`,
    fix: "Update the reference to an existing service and key, or add the missing variable, then redeploy.",
    action: { kind: "button", label: "Jump to the variable", actionId: "jump_to_variable" },
  }),

  VARIABLE_REF_CYCLE: (ctx) => ({
    title: "Variables reference each other in a loop",
    explanation:
      ctx.cycle === undefined || ctx.cycle.length === 0
        ? "Two or more variables reference each other, so none of them can be resolved."
        : `${ctx.cycle.join(" → ")} → ${ctx.cycle[0] ?? ""} forms a loop, so none of these variables can be resolved.`,
    fix: "Change one of the variables in the loop to a plain value, then redeploy.",
    action: { kind: "button", label: "Show the cycle", actionId: "show_cycle" },
  }),

  DNS_NOT_POINTED: (ctx) => ({
    title: "Your domain doesn't point here yet",
    explanation: `${ctx.hostname ?? "The domain"} doesn't resolve to this server yet. DNS changes can take a few minutes to spread.`,
    fix: "Add the DNS record shown on the domain card at your DNS provider, wait a few minutes, and check again.",
    action: { kind: "button", label: "Recheck DNS", actionId: "recheck_dns" },
  }),

  TLS_FAILED: (ctx) => ({
    title: "We couldn't get a certificate for your domain",
    explanation: `The certificate authority couldn't verify ${ctx.hostname ?? "the domain"}. ${ctx.detail ?? "This usually means DNS isn't pointed here yet or port 80 is blocked."}`,
    fix: "Check the DNS record and that port 80 is open, then retry. Lumen keeps retrying on its own for 24 hours.",
    action: { kind: "button", label: "Recheck now", actionId: "recheck_tls" },
  }),

  IMAGE_PULL_AUTH: (ctx) => ({
    title: "We couldn't pull this private image",
    explanation: `${ctx.image ?? "The image"} needs credentials to download, and none matched its registry.`,
    fix: "Add credentials for this registry in workspace settings, then redeploy.",
    action: {
      kind: "button",
      label: "Add registry credentials",
      actionId: "add_registry_credentials",
    },
  }),

  GITHUB_ACCESS_REVOKED: (ctx) => ({
    title: "We lost access to this repository",
    explanation: `GitHub no longer lets Lumen read ${ctx.repo ?? "the repository"}. The app installation was removed or the repository was moved.`,
    fix: "Reconnect GitHub and grant access to the repository again. Existing deployments keep running.",
    action: { kind: "button", label: "Reconnect GitHub", actionId: "reconnect_github" },
  }),

  SERVER_CAPACITY: (ctx) => ({
    title: "This server doesn't have enough memory for that",
    explanation: `Server '${ctx.serverName ?? "unknown"}' can't fit the memory this service asks for next to what is already running.`,
    fix: "Lower the memory limit, move the service to another server, or resize this server.",
    action: { kind: "button", label: "Move to another server", actionId: "open_placement" },
  }),

  VOLUME_FULL: (ctx) => ({
    title: "Your volume is almost full",
    explanation: `${ctx.volumeName ?? "The volume"} is close to its size limit. When it fills up, the app may fail to write data.`,
    fix: "Increase the volume's limit, or remove data you no longer need.",
    action: { kind: "button", label: "Increase the limit", actionId: "increase_volume_limit" },
  }),

  BACKUP_FAILED: () => ({
    title: "Your backup didn't complete",
    explanation:
      "The backup stopped before finishing. The destination may be unreachable or its credentials may have changed.",
    fix: "Test the backup destination, fix what it reports, and run the backup again.",
    action: { kind: "button", label: "Test the destination", actionId: "test_backup_destination" },
  }),

  MESH_UNREACHABLE: () => ({
    title: "Your servers can't reach each other privately",
    explanation:
      "The private network between your servers isn't connecting. UDP port 51820 must be open between the servers.",
    fix: "Open UDP 51820 between your servers in each provider's firewall. The guide has the steps per provider.",
    action: { kind: "link", label: "Open the UDP 51820 guide", href: "/docs/networking/private" },
  }),

  CLOCK_SKEW: (ctx) => ({
    title:
      ctx.skewMinutes === undefined
        ? "Your server's clock is off"
        : `Your server's clock is off by ${String(ctx.skewMinutes)} minute${ctx.skewMinutes === 1 ? "" : "s"}`,
    explanation:
      "Lumen rejects messages with timestamps more than five minutes off, so this server can't report in until its clock is right.",
    fix: "Turn on automatic time sync (NTP) on the server. The command below does it on Ubuntu and Debian.",
    action: {
      kind: "command",
      label: "Copy the command",
      command: "sudo timedatectl set-ntp true",
    },
  }),

  AGENT_TIMEOUT: (ctx) => ({
    title: `Server '${ctx.serverName ?? "unknown"}' didn't answer in time`,
    explanation:
      "Lumen asked the agent on this server to do something and got no reply within a minute. The server may be busy or its connection unstable.",
    fix: "Check that the server is online, then try again.",
    action: { kind: "button", label: "Retry", actionId: "retry" },
  }),

  JOIN_TOKEN_INVALID: () => ({
    title: "This join command has expired or was already used",
    explanation:
      "Each join command works once and only for an hour, so a copied command can't be reused to add a server later.",
    fix: "Create a new join command in Servers → Add server and paste it into the server.",
    action: { kind: "button", label: "Create a new join command", actionId: "create_join_token" },
  }),

  SIGNATURE_INVALID: () => ({
    title: "A message from this server couldn't be verified",
    explanation:
      "Every message between Lumen and a server is signed. This one wasn't signed by the key the server registered with, so it was ignored.",
    fix: "If this keeps happening, remove the server and add it again with a new join command.",
    action: { kind: "button", label: "Open troubleshooting", actionId: "open_troubleshooting" },
  }),

  UPDATE_VERIFY_FAILED: (ctx) => ({
    title: "The agent update didn't pass verification",
    explanation: `The download${ctx.version === undefined ? "" : ` for version ${ctx.version}`} didn't match its checksum or signature, so the server kept its current agent.`,
    fix: "Nothing on the server changed. Try the update again; if it fails again, check the release files on the control plane.",
    action: { kind: "button", label: "Retry", actionId: "retry" },
  }),

  UPDATE_ROLLED_BACK: (ctx) => ({
    title: "The agent update was rolled back",
    explanation: `The new agent${ctx.version === undefined ? "" : ` (${ctx.version})`} didn't become healthy, so the server went back to the previous version. Your apps kept running.`,
    fix: "Check the agent log on the server with: journalctl -u lumen-agent -o cat. Then try the update again.",
    action: { kind: "button", label: "Retry", actionId: "retry" },
  }),

  PROTOCOL_UNSUPPORTED: (ctx) => ({
    title: `The agent on '${ctx.serverName ?? "this server"}' is too old for this Lumen`,
    explanation:
      "The control plane talks to agents one protocol version back at most, and this agent is older than that, so it can't connect.",
    fix: "Run the install command on the server again. It updates the agent and keeps the server's settings.",
    action: { kind: "button", label: "Open troubleshooting", actionId: "open_troubleshooting" },
  }),

  VALIDATION_FAILED: (ctx) => ({
    title: "Something in this request isn't valid",
    explanation: ctx.detail ?? "One or more fields have values Lumen can't accept.",
    fix: "Check the highlighted fields and try again.",
    action: { kind: "button", label: "Show fields", actionId: "show_invalid_fields" },
  }),

  NOT_FOUND: (ctx) => ({
    title: `This ${ctx.resource ?? "page"} doesn't exist or you don't have access`,
    explanation: "It may have been deleted, or it belongs to a workspace you're not a member of.",
    fix: "Go back home and open it from there, or ask a teammate for an invite.",
    action: { kind: "link", label: "Open home", href: "/" },
  }),

  FORBIDDEN: (ctx) => ({
    title: "You need a different role for that",
    explanation: `This action needs the ${ctx.roleNeeded ?? "admin"} role in the workspace.`,
    fix: "Ask a workspace admin to change your role. The members list shows who they are.",
    action: { kind: "button", label: "View members", actionId: "view_members" },
  }),

  UNAUTHENTICATED: () => ({
    title: "Sign in to continue",
    explanation: "Your session has ended or this request didn't include a valid token.",
    fix: "Sign in again. Your work is saved.",
    action: { kind: "button", label: "Sign in", actionId: "sign_in" },
  }),

  RATE_LIMITED: (ctx) => ({
    title: "You're sending requests too quickly",
    explanation: `Lumen limits how many requests a token can make. ${ctx.retryAfterS === undefined ? "Wait a moment and try again." : `Wait ${String(ctx.retryAfterS)} seconds and try again.`}`,
    fix: "Slow down the client, or use a separate token per integration.",
    action: {
      kind: "button",
      label: "Retry",
      actionId: "retry",
      ...(ctx.retryAfterS === undefined ? {} : { availableInS: ctx.retryAfterS }),
    },
  }),

  INTERNAL: (ctx) => ({
    title: "Something went wrong on our side",
    explanation: `This wasn't caused by anything you did. The details were logged${ctx.supportId === undefined ? "" : ` with support ID ${ctx.supportId}`}.`,
    fix: "Try again. If it keeps happening, send the support ID to whoever runs this Lumen instance.",
    action: { kind: "button", label: "Retry", actionId: "retry" },
  }),
};
