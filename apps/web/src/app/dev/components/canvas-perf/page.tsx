import { Text } from "@lumen/ui";

import { HundredNodeCanvas } from "./hundred-node-canvas";

export default function CanvasPerfPage() {
  return (
    <div className="flex flex-col gap-6" data-gallery-page="canvas-perf">
      <div className="flex max-w-[720px] flex-col gap-2">
        <Text variant="eyebrow">Specialized · performance</Text>
        <Text variant="page-title">Canvas · 100 services</Text>
        <Text variant="body" className="text-text-secondary">
          A 10 × 10 grid of services with 90 references in a static React Flow instance. Drag to pan
          and scroll to zoom; only the nodes in view are rendered, so panning stays at 60 fps.
          Measured by <code className="text-code">e2e/scripts/perf-canvas.mjs</code>.
        </Text>
      </div>
      <HundredNodeCanvas />
    </div>
  );
}
