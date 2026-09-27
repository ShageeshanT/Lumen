import { cn } from "../lib/cn";

import { Avatar } from "./avatar";
import { Tooltip } from "./tooltip";

export interface AvatarStackPerson {
  name: string;
  src?: string;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  /** How many avatars to show before "+N". Default 4. */
  max?: number;
  size?: 20 | 24;
  /** Each avatar becomes focusable and shows its name in a tooltip on focus. */
  interactive?: boolean;
  className?: string;
}

/** "Members: Ana, Ben, +2 more". */
export function avatarStackLabel(people: AvatarStackPerson[], max: number): string {
  const shown = people.slice(0, max).map((person) => person.name);
  const rest = people.length - shown.length;
  return `Members: ${[...shown, ...(rest > 0 ? [`+${String(rest)} more`] : [])].join(", ")}`;
}

/**
 * Overlapping avatars for the people on a project. Each wears a ring in the
 * surface color so overlaps read cleanly; hovering one lifts it to the top.
 * Renders nothing for zero people; the parent says "No members".
 */
export function AvatarStack({
  people,
  max = 4,
  size = 24,
  interactive = false,
  className,
}: AvatarStackProps) {
  if (people.length === 0) {
    return null;
  }
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const overlap = size === 20 ? "-ml-[6px]" : "-ml-2";
  const ring = "rounded-full ring-2 ring-surface";
  return (
    <div
      role="group"
      aria-label={avatarStackLabel(people, max)}
      className={cn("isolate inline-flex items-center", className)}
    >
      {shown.map((person, index) => {
        const avatar = (
          <Avatar
            name={person.name}
            size={size}
            {...(person.src === undefined ? {} : { src: person.src })}
          />
        );
        const itemClasses = cn(
          "relative inline-flex transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)]",
          ring,
          index > 0 && overlap,
          // Stack order stays inside the group's own stacking context (isolate).
          "hover:z-[var(--z-sticky)] hover:-translate-y-px focus-visible:z-[var(--z-sticky)]",
        );
        return interactive ? (
          <Tooltip key={`${person.name}-${String(index)}`} content={person.name}>
            <span tabIndex={0} className={itemClasses}>
              {avatar}
            </span>
          </Tooltip>
        ) : (
          <span key={`${person.name}-${String(index)}`} aria-hidden="true" className={itemClasses}>
            {avatar}
          </span>
        );
      })}
      {rest > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "bg-surface-raised text-text-secondary border-border tabular relative inline-flex items-center justify-center border font-mono font-medium",
            ring,
            overlap,
            size === 20 ? "text-11 h-5 min-w-5 px-1" : "text-11 h-6 min-w-6 px-1",
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
