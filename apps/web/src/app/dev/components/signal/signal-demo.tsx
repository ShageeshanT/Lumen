"use client";

import { useEffect, useState } from "react";

import { StatusTag, Text } from "@lumen/ui";

function Example({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" data-gallery-example={title}>
      <div className="flex items-baseline gap-3">
        <Text variant="eyebrow">{title}</Text>
        <Text variant="meta">{note}</Text>
      </div>
      {children}
    </section>
  );
}

const STEPS = ["Queue", "Build", "Pre", "Deploy", "Health", "Live"];

/** Mounts unbooted, then adds .booted on the next frame so the entrance plays. */
function BootRow() {
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setBooted(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className={`flex gap-3 ${booted ? "booted" : ""}`}>
      {STEPS.map((step, index) => (
        <div
          key={step}
          className="boot border-border bg-surface flex h-[64px] flex-1 items-end border p-3"
          style={{ "--i": index } as React.CSSProperties}
        >
          <Text variant="label">
            {String(index + 1).padStart(2, "0")} {step}
          </Text>
        </div>
      ))}
    </div>
  );
}

export function SignalDemo() {
  const [run, setRun] = useState(0);

  return (
    <div className="flex flex-col gap-12">
      <Example title="HUD brackets" note=".hud · .hud-hover · .hud-accent">
        <div className="flex flex-wrap gap-6">
          <div className="hud border-border bg-surface flex h-[96px] w-[224px] items-center justify-center border">
            <Text variant="label">Default</Text>
          </div>
          <div className="hud hud-hover border-border bg-surface flex h-[96px] w-[224px] items-center justify-center border">
            <Text variant="label">Hover me</Text>
          </div>
          <div className="hud hud-accent elevation-selected bg-surface flex h-[96px] w-[224px] items-center justify-center">
            <Text variant="label">Selected</Text>
          </div>
        </div>
      </Example>

      <Example title="Instrument grid and glow" note=".bg-grid · .bg-vignette · .glow-field">
        <div className="bg-grid bg-vignette border-border relative h-[256px] overflow-hidden border">
          <div
            aria-hidden="true"
            className="glow-field absolute top-1/2 left-1/2 h-[224px] w-[384px] -translate-x-1/2 -translate-y-1/2"
          />
          <div className="relative flex h-full flex-col items-center justify-center gap-2">
            <Text variant="display">Signal</Text>
            <Text variant="eyebrow">5 services · 1 building</Text>
          </div>
        </div>
      </Example>

      <Example title="Boot-in" note=".boot with --i order · .booted on an ancestor">
        <div className="flex flex-col gap-3">
          <BootRow key={run} />
          <div>
            <button
              type="button"
              onClick={() => {
                setRun((value) => value + 1);
              }}
              className="text-action border-border hover:border-border-strong hover:bg-surface-hover inline-flex h-8 items-center gap-2 border px-3"
            >
              Replay →
            </button>
          </div>
        </div>
      </Example>

      <Example title="Status markers" note="square markers · .blink for building and deploying">
        <div className="flex flex-wrap gap-6">
          <StatusTag status="active" />
          <StatusTag status="building" />
          <StatusTag status="failed" />
          <StatusTag status="sleeping" />
        </div>
      </Example>
    </div>
  );
}
