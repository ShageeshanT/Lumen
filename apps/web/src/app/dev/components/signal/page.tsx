import { Text } from "@lumen/ui";

import { SignalDemo } from "./signal-demo";

export default function SignalPage() {
  return (
    <div className="flex max-w-[1100px] flex-col gap-8" data-gallery-page="signal">
      <div className="flex flex-col gap-2">
        <Text variant="page-title">Signal surfaces</Text>
        <Text variant="body" className="text-text-secondary">
          The surface language of Direction D: HUD corner brackets, the instrument grid, the glow
          field, the boot-in entrance and the blink marker. Components compose these utilities;
          pages never re-create them. Every animation stops under reduced motion.
        </Text>
      </div>
      <SignalDemo />
    </div>
  );
}
