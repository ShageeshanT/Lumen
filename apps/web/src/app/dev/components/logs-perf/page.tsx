import { Text } from "@lumen/ui";

import { LiveLogs } from "./live-logs";

export default function LogsPerfPage() {
  return (
    <div className="flex max-w-[1100px] flex-col gap-6" data-gallery-page="logs-perf">
      <div className="flex max-w-[720px] flex-col gap-2">
        <Text variant="eyebrow">Specialized · performance</Text>
        <Text variant="page-title">Logs · 50,000 lines</Text>
        <Text variant="body" className="text-text-secondary">
          A virtualized log viewer holding 50,000 lines while five more arrive every second. Scroll
          up to pause: new lines collect below the accent boundary until you jump back to live.
          Measured by <code className="text-code">e2e/scripts/perf-logs.mjs</code>.
        </Text>
      </div>
      <LiveLogs />
    </div>
  );
}
