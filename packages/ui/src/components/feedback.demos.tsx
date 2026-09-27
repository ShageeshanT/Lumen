"use client";

import { useEffect, useState } from "react";

import { Button } from "./button";
import { ProgressSteps, type ProgressStep, type StepState } from "./progress-steps";
import { Toaster, toast } from "./toast";

/** Stateful gallery demos. Client-only so the registry can be imported on the server. */

/** Fires real toasts into a real Toaster: stacking, timers, F8 and Escape. */
export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => {
          toast({ title: "Variables saved", variant: "success" });
        }}
      >
        Save variables
      </Button>
      <Button
        onClick={() => {
          toast({
            title: "Variable deleted",
            description: "DATABASE_URL was removed from production.",
            undo: () => {
              toast({ title: "DATABASE_URL restored", variant: "info" });
            },
          });
        }}
      >
        Delete a variable
      </Button>
      <Button
        onClick={() => {
          toast({
            title: "Deploy failed",
            description: "api · build exited with code 1.",
            variant: "danger",
            action: { label: "View logs", onClick: () => undefined },
          });
        }}
      >
        Fail a deploy
      </Button>
      <Button
        onClick={() => {
          toast({
            title: "Server is running low on disk",
            description: "oracle-1 has 1.2 GB free.",
            variant: "warning",
          });
        }}
      >
        Warn
      </Button>
      <Toaster />
    </div>
  );
}

const STAGES = ["Queued", "Building", "Pre-deploy", "Deploying", "Health check", "Live"];

/** Plays a deploy through every stage, a few seconds each, ticking live. */
export function LiveStepsDemo() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stage, setStage] = useState(-1);
  const [marks, setMarks] = useState<number[]>([]);

  useEffect(() => {
    if (startedAt === null || stage >= STAGES.length) {
      return;
    }
    const id = setTimeout(
      () => {
        setMarks((previous) => [...previous, Date.now()]);
        setStage((previous) => previous + 1);
      },
      stage === STAGES.length - 1 ? 0 : 2500,
    );
    return () => {
      clearTimeout(id);
    };
  }, [startedAt, stage]);

  const steps: ProgressStep[] = STAGES.map((label, index) => {
    const state: StepState =
      stage < 0 || index > stage
        ? "pending"
        : index < stage || stage === STAGES.length
          ? "done"
          : index === STAGES.length - 1
            ? "done"
            : "active";
    const start = index === 0 ? startedAt : marks[index - 1];
    const end = marks[index];
    return {
      id: label,
      label,
      state,
      ...(start === null || start === undefined ? {} : { startedAt: start }),
      ...(end === undefined ? {} : { finishedAt: end }),
    };
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <ProgressSteps steps={steps} />
      <div>
        <Button
          size="sm"
          leadingIcon="play"
          onClick={() => {
            setMarks([]);
            setStage(0);
            setStartedAt(Date.now());
          }}
        >
          {stage < 0 ? "Run a deploy" : "Run again"}
        </Button>
      </div>
    </div>
  );
}
