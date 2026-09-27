"use client";

import { SegmentedControl, setDensity, useDensity, type Density } from "@lumen/ui";

/** Flips the global density preference that tables, list rows and menus follow. */
export function DensityToggle() {
  const density = useDensity();
  return (
    <SegmentedControl
      size="sm"
      aria-label="Density"
      value={density}
      onValueChange={(next) => {
        setDensity(next as Density);
      }}
      items={[
        { value: "comfortable", label: "Comfortable" },
        { value: "compact", label: "Compact" },
      ]}
    />
  );
}
