"use client";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { initials } from "../lib/text";

import { Avatar, tintFor } from "./avatar";
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

export interface Workspace {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface WorkspaceAccount {
  name: string;
  email: string;
  avatarUrl?: string;
  /** Account settings. */
  href: string;
}

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  value: string;
  onValueChange: (id: string) => void;
  onCreate?: () => void;
  account: WorkspaceAccount;
  /** Collapsed rail: only the tile shows. */
  collapsed?: boolean;
  /** Force the menu open, for gallery screenshots. */
  open?: boolean;
  className?: string;
}

/** The 32 px workspace tile: the avatar, or the initial on the workspace's stable tint. */
function WorkspaceTile({ workspace }: { workspace: Workspace | undefined }) {
  const name = workspace?.name ?? "?";
  if (workspace?.avatarUrl !== undefined) {
    return (
      <span aria-hidden="true" className="inline-flex">
        <Avatar name={name} src={workspace.avatarUrl} size={32} shape="square" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "border-border rounded-control text-16 inline-flex size-8 shrink-0 items-center justify-center border font-mono font-semibold",
        tintFor(name),
      )}
    >
      {initials(name, 1)}
    </span>
  );
}

/**
 * The workspace tile at the top of the rail. Opens a 240 px menu listing
 * workspaces (the current one checked), "Create workspace", and the signed-in
 * account, which links to account settings.
 */
export function WorkspaceSwitcher({
  workspaces,
  value,
  onValueChange,
  onCreate,
  account,
  collapsed = false,
  open,
  className,
}: WorkspaceSwitcherProps) {
  const current = workspaces.find((workspace) => workspace.id === value);
  const several = workspaces.length > 1;

  return (
    <DropdownMenu {...(open === undefined ? {} : { open, modal: false })}>
      <DropdownMenuTrigger
        aria-label={`Workspace: ${current?.name ?? "none"}`}
        className={cn(
          "rounded-control text-text flex min-w-0 items-center gap-3 p-1 text-left",
          "is-hover:bg-surface-hover data-[state=open]:bg-surface-hover transition-colors duration-[var(--dur-fast)]",
          collapsed ? "size-[40px] justify-center" : "h-[40px] w-full pr-2",
          className,
        )}
      >
        <WorkspaceTile workspace={current} />
        {!collapsed && (
          <>
            <span className="text-label min-w-0 flex-1 truncate">{current?.name}</span>
            <Icon name="chevrons-up-down" size={14} className="text-text-secondary shrink-0" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn("w-[240px]", open === true && "max-h-none")}
        side="bottom"
        align="start"
        avoidCollisions={open !== true}
      >
        {several && (
          <>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
              {workspaces.map((workspace) => (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id} indicator="check">
                  <span aria-hidden="true" className="inline-flex">
                    <Avatar
                      name={workspace.name}
                      size={24}
                      shape="square"
                      {...(workspace.avatarUrl === undefined ? {} : { src: workspace.avatarUrl })}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {onCreate !== undefined && (
          <DropdownMenuItem icon="plus" onSelect={onCreate}>
            Create workspace
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="h-auto py-2">
          <a href={account.href}>
            <span aria-hidden="true" className="inline-flex">
              <Avatar
                name={account.name}
                size={24}
                {...(account.avatarUrl === undefined ? {} : { src: account.avatarUrl })}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-13 text-text truncate">{account.name}</span>
              <span className="text-meta truncate">{account.email}</span>
            </span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
