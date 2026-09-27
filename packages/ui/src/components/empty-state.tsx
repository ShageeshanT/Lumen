import { useId, type ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Button } from "./button";

export type EmptyStateAction = { label: string; icon?: IconName } & (
  { onClick: () => void; href?: undefined } | { href: string; onClick?: undefined }
);

export interface EmptyStateTile {
  icon: IconName;
  title: string;
  description?: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  /** A 40 px icon (48 in hero) inside a framed square. */
  icon?: IconName;
  /** Replaces the icon with a custom drawing. */
  illustration?: ReactNode;
  title: string;
  /** One sentence: why it is empty and what happens next. */
  description: string;
  /** The one obvious next step. Omit for roles that cannot act. */
  action?: EmptyStateAction;
  /** A docs link under the action. */
  secondary?: { label: string; href: string };
  /** Option tiles under the description (the empty canvas, first server). */
  tiles?: EmptyStateTile[];
  size?: "md" | "hero";
  className?: string;
}

/**
 * What a screen shows before there is anything in it: an icon, a title, one
 * sentence and one primary action. Centered, never wider than 420 px (560 in
 * hero), so it reads as a single thought.
 */
export function EmptyState({
  icon = "box",
  illustration,
  title,
  description,
  action,
  secondary,
  tiles,
  size = "md",
  className,
}: EmptyStateProps) {
  const titleId = useId();
  const hero = size === "hero";
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "mx-auto flex w-full flex-col items-center text-center",
        hero || (tiles !== undefined && tiles.length > 2) ? "max-w-[560px]" : "max-w-[420px]",
        className,
      )}
    >
      {illustration ?? (
        <span
          aria-hidden="true"
          className={cn(
            "hud bg-surface-raised border-border text-text-secondary inline-flex items-center justify-center border",
            "rounded-card [--hud-offset:3px] [--hud-size:6px]",
            hero ? "size-[80px]" : "size-16",
          )}
        >
          <EmptyIcon name={icon} size={hero ? 48 : 40} />
        </span>
      )}
      <h2
        id={titleId}
        className={cn(
          "mt-4",
          hero ? "text-page-title" : "text-subsection text-16 leading-tight font-semibold",
        )}
      >
        {title}
      </h2>
      <p className={cn("text-body text-text-secondary mt-2", hero && "max-w-[440px]")}>
        {description}
      </p>
      {tiles !== undefined && tiles.length > 0 && (
        <ul
          className={cn(
            "mt-5 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2",
            tiles.length === 3 && "sm:grid-cols-3",
          )}
        >
          {tiles.map((tile) => (
            <li key={tile.title} className="flex">
              <EmptyTile tile={tile} />
            </li>
          ))}
        </ul>
      )}
      {action !== undefined && (
        <div className="mt-5">
          {action.href !== undefined ? (
            <Button asChild variant="primary" size={hero ? "lg" : "md"}>
              <a href={action.href}>
                {action.icon !== undefined && <Icon name={action.icon} size={14} />}
                {action.label}
              </a>
            </Button>
          ) : (
            <Button
              variant="primary"
              size={hero ? "lg" : "md"}
              onClick={action.onClick}
              {...(action.icon === undefined ? {} : { leadingIcon: action.icon })}
            >
              {action.label}
            </Button>
          )}
        </div>
      )}
      {secondary !== undefined && (
        <a
          href={secondary.href}
          className="text-body-secondary text-accent-text mt-3 inline-flex min-h-6 items-center underline-offset-4 hover:underline"
        >
          {secondary.label}
        </a>
      )}
    </section>
  );
}

/** Lucide icons scale cleanly; the allowlist caps sizes at 20, so draw bigger ones here. */
function EmptyIcon({ name, size }: { name: IconName; size: 40 | 48 }) {
  return (
    <span className="inline-flex" style={{ width: size, height: size }}>
      <Icon name={name} size={20} className="size-full" />
    </span>
  );
}

function EmptyTile({ tile }: { tile: EmptyStateTile }) {
  const body = (
    <>
      <span className="text-text-secondary inline-flex shrink-0 pt-[2px]">
        <Icon name={tile.icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-label">{tile.title}</span>
        {tile.description !== undefined && (
          <span className="text-body-secondary">{tile.description}</span>
        )}
      </span>
    </>
  );
  const classes = cn(
    "border-border bg-surface rounded-card flex w-full items-start gap-3 border p-3 text-left",
    "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "is-hover:border-border-strong is-hover:bg-surface-hover",
  );
  if (tile.href !== undefined) {
    return (
      <a href={tile.href} className={classes}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={tile.onClick} className={classes}>
      {body}
    </button>
  );
}
