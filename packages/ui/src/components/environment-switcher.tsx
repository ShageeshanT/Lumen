"use client";

import { useRef } from "react";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";

import { Badge } from "./badge";
import { buttonVariants } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export type EnvironmentKind = "production" | "staging" | "preview" | "custom";

export interface Environment {
  id: string;
  name: string;
  kind: EnvironmentKind;
  /** Override the marker color set by the kind. */
  color?: "success" | "info" | "warning" | "accent";
}

const MARKER: Record<NonNullable<Environment["color"]>, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  accent: "bg-accent",
};

const KIND_COLOR: Record<EnvironmentKind, NonNullable<Environment["color"]>> = {
  production: "success",
  staging: "info",
  preview: "warning",
  custom: "accent",
};

function EnvironmentMarker({
  environment,
  pulse = false,
}: {
  environment: Environment;
  pulse?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-env-marker={environment.kind}
      className={cn(
        "inline-block size-[6px] shrink-0",
        MARKER[environment.color ?? KIND_COLOR[environment.kind]],
        pulse && "animate-[lumen-pulse_var(--dur-pulse)_ease-in-out_1]",
      )}
    />
  );
}

export interface EnvironmentSwitcherProps {
  environments: Environment[];
  value: string;
  onValueChange: (id: string) => void;
  onCreate?: () => void;
  onManage?: () => void;
  size?: "sm" | "md";
  /** Force the menu open, for gallery screenshots. */
  open?: boolean;
  className?: string;
}

/**
 * Switches the environment the whole project view shows. The trigger carries a
 * square marker in the environment's color (production green, staging blue,
 * previews amber); the marker pulses once after a switch. The list scrolls
 * after eight environments.
 */
export function EnvironmentSwitcher({
  environments,
  value,
  onValueChange,
  onCreate,
  onManage,
  size = "md",
  open,
  className,
}: EnvironmentSwitcherProps) {
  const current = environments.find((environment) => environment.id === value);
  // Pulse only after the value changes, never on first render.
  const initial = useRef(value);
  const switched = value !== initial.current;

  return (
    <DropdownMenu {...(open === undefined ? {} : { open, modal: false })}>
      <DropdownMenuTrigger
        aria-label={`Environment: ${current?.name ?? "none"}`}
        className={cn(buttonVariants({ variant: "secondary", size }), "max-w-[240px]", className)}
      >
        {current !== undefined && (
          <EnvironmentMarker key={value} environment={current} pulse={switched} />
        )}
        <span className="min-w-0 truncate">{current?.name ?? "Choose environment"}</span>
        <Icon name="chevron-down" size={14} className="text-text-secondary shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        // Forced open (screenshots): full height, fixed side, whatever the scroll position.
        className={cn("w-[260px]", open === true && "max-h-none")}
        avoidCollisions={open !== true}
      >
        <DropdownMenuLabel>Environments</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onValueChange}
          className="max-h-[256px] overflow-y-auto"
          // A scrolling list must be reachable by keyboard (WCAG 2.1.1).
          tabIndex={environments.length > 8 ? 0 : undefined}
        >
          {environments.map((environment) => (
            <DropdownMenuRadioItem key={environment.id} value={environment.id} indicator="check">
              <EnvironmentMarker environment={environment} />
              <span className="min-w-0 flex-1 truncate font-mono">{environment.name}</span>
              {environment.kind === "production" && (
                <Badge size="sm" variant="success">
                  Production
                </Badge>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {(onCreate !== undefined || onManage !== undefined) && <DropdownMenuSeparator />}
        {onCreate !== undefined && (
          <DropdownMenuItem icon="plus" onSelect={onCreate}>
            New environment
          </DropdownMenuItem>
        )}
        {onManage !== undefined && (
          <DropdownMenuItem icon="settings" onSelect={onManage}>
            Manage environments
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
