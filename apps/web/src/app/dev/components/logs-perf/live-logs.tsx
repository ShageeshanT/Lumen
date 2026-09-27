"use client";

import { useEffect, useState } from "react";

import { Button, LogViewer, formatCount, type LogLine } from "@lumen/ui";
import { fiftyThousandLines, makeLogLines } from "@lumen/ui/fixtures";

const STREAM_EVERY_MS = 200;

/**
 * 50,000 lines plus a live stream (five lines a second) so follow mode, the
 * pause on scroll-up, the new-lines boundary and "Jump to live" can be
 * exercised against a realistic backlog.
 */
export function LiveLogs() {
  const [lines, setLines] = useState<readonly LogLine[]>(() => fiftyThousandLines());
  const [streaming, setStreaming] = useState(true);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!streaming) {
      return;
    }
    const timer = setInterval(() => {
      setLines((previous) => previous.concat(makeLogLines(1, previous.length)));
    }, STREAM_EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [streaming]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          leadingIcon={streaming ? "pause" : "play"}
          onClick={() => {
            setStreaming((value) => !value);
          }}
          data-stream-toggle=""
        >
          {streaming ? "Pause stream" : "Resume stream"}
        </Button>
        <span className="text-meta" data-line-count={lines.length}>
          {formatCount(lines.length)} lines · {following ? "following" : "paused"}
        </span>
      </div>
      <LogViewer
        lines={lines}
        live={streaming}
        timeZone="UTC"
        height={560}
        label="Live logs"
        onFollowOutputChange={setFollowing}
      />
    </div>
  );
}
