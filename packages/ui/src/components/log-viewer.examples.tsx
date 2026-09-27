import type { ComponentDoc } from "../examples/types";

import { LogViewer } from "./log-viewer";
import {
  DEPLOY_LINES,
  fiftyThousandLines,
  JSON_LINES,
  LOG_BASE_TIME,
  makeLogLines,
} from "./log-viewer.fixtures";

const ZONE = "UTC";

export const logViewerDoc: ComponentDoc = {
  slug: "log-viewer",
  name: "Log viewer",
  group: "Specialized",
  summary:
    "Virtualized mono log panel: ANSI colors mapped to tokens, level tags, stderr bars, expandable JSON, search, and follow mode that pauses when you scroll up.",
  components: ["LogViewer"],
  examples: [
    {
      id: "deploy",
      title: "Build and runtime output with ANSI colors",
      description: "stderr lines carry a thin danger bar; levels are tagged ERR, WRN, INF, DBG.",
      wide: true,
      render: () => (
        <LogViewer lines={DEPLOY_LINES} timeZone={ZONE} height={300} className="w-full" />
      ),
    },
    {
      id: "json",
      title: "JSON lines, one expanded",
      render: () => (
        <LogViewer
          lines={JSON_LINES}
          timeZone={ZONE}
          height={300}
          defaultExpanded={["j1"]}
          defaultFollowOutput={false}
          className="w-full"
        />
      ),
    },
    {
      id: "paused",
      title: "Paused with the new-lines boundary",
      description: "Scrolled up while live: the accent line marks where new output starts.",
      render: () => (
        <LogViewer
          lines={makeLogLines(60)}
          timeZone={ZONE}
          height={300}
          live
          defaultFollowOutput={false}
          newSinceIndex={44}
          className="w-full"
        />
      ),
    },
    {
      id: "search",
      title: "Search with a match count",
      render: () => (
        <LogViewer
          lines={makeLogLines(40)}
          timeZone={ZONE}
          height={300}
          highlight="ECONNREFUSED"
          defaultFollowOutput={false}
          className="w-full"
        />
      ),
    },
    {
      id: "offline",
      title: "Server offline",
      render: () => (
        <LogViewer
          lines={DEPLOY_LINES.slice(0, 8)}
          timeZone={ZONE}
          height={260}
          offline={{ lastLineAt: LOG_BASE_TIME + 1260 }}
          className="w-full"
        />
      ),
    },
    {
      id: "dense-wrap",
      title: "Dense and wrapped",
      description: "Mono 12 on 18 px rows; long lines wrap instead of scrolling sideways.",
      render: () => (
        <LogViewer
          lines={JSON_LINES.concat(DEPLOY_LINES)}
          timeZone={ZONE}
          height={260}
          dense
          wrap
          defaultFollowOutput={false}
          className="w-full"
        />
      ),
    },
    {
      id: "no-timestamps",
      title: "Timestamps hidden",
      render: () => (
        <LogViewer
          lines={DEPLOY_LINES.slice(0, 6)}
          timeZone={ZONE}
          height={200}
          showTimestamps={false}
          className="w-full"
        />
      ),
    },
    {
      id: "empty",
      title: "Empty",
      render: () => <LogViewer lines={[]} height={200} className="w-full" />,
    },
    {
      id: "loading",
      title: "Loading",
      render: () => <LogViewer lines={[]} loading height={200} className="w-full" />,
    },
    {
      id: "fifty-thousand",
      title: "50,000 lines, following",
      description: "Only the rows in view are in the DOM; scrolling stays at 60 fps.",
      wide: true,
      render: () => (
        <LogViewer
          lines={fiftyThousandLines()}
          timeZone={ZONE}
          height={360}
          live
          label="Logs, 50,000 lines"
          className="w-full"
        />
      ),
    },
  ],
};
