"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

const ChartSyncContext = createContext<string | undefined>(undefined);

export interface ChartSyncGroupProps {
  /** A stable key; charts in the same group share one crosshair. Generated when omitted. */
  id?: string;
  children: ReactNode;
}

/**
 * Charts inside a group move their crosshairs together: hover CPU at 12:04
 * and Memory, Network and Requests show 12:04 too.
 */
export function ChartSyncGroup({ id, children }: ChartSyncGroupProps) {
  const generated = useId();
  return (
    <ChartSyncContext.Provider value={id ?? `chart-sync-${generated}`}>
      {children}
    </ChartSyncContext.Provider>
  );
}

/** The sync key of the nearest ChartSyncGroup, if any. */
export function useChartSyncId(): string | undefined {
  return useContext(ChartSyncContext);
}
