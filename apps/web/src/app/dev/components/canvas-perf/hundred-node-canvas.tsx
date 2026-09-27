"use client";

import { useMemo } from "react";

import { CanvasFlow } from "@lumen/ui";
import { hundredNodeScene } from "@lumen/ui/fixtures";

/** Built in the browser so the 100-node scene is not serialized into the page payload. */
export function HundredNodeCanvas() {
  const scene = useMemo(() => hundredNodeScene(), []);
  return (
    <CanvasFlow
      nodes={scene.nodes}
      edges={scene.edges}
      height={640}
      label="Project canvas, 100 services"
    />
  );
}
