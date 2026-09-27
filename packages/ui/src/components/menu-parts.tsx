import type { ReactNode } from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";

import { Kbd, type KbdKey } from "./kbd";

/** What every menu row can carry besides its label. */
export interface MenuRowProps {
  /** 16 px icon before the label. */
  icon?: IconName | undefined;
  /** Keyboard hint, right-aligned: ["mod", "D"]. */
  shortcut?: KbdKey[] | undefined;
  /** Destructive actions render in danger text with a danger tint on hover. */
  destructive?: boolean | undefined;
}

/** The inside of a row: icon, label, then the shortcut pushed to the right. */
export function MenuRowContent({
  icon,
  shortcut,
  destructive = false,
  children,
  trailing,
}: MenuRowProps & { children: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      {icon !== undefined && (
        <Icon
          name={icon}
          size={16}
          className={cn("shrink-0", destructive ? "text-danger" : "text-text-secondary")}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut !== undefined && <Kbd keys={shortcut} size="sm" className="ml-4" />}
      {trailing}
    </>
  );
}
