"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import {
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Icon, type IconName } from "../icons/icon";
import { cn } from "../lib/cn";
import { useDensity } from "../lib/use-density";
import { useMediaQuery } from "../lib/use-media-query";

import { Alert } from "./alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Skeleton } from "./skeleton";

export type { SortingState } from "@tanstack/react-table";

type CellValue = string | number | null | undefined;

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** The raw value: used for sorting, and rendered when there is no `cell`. */
  value?: (row: T) => CellValue;
  cell?: (row: T) => ReactNode;
  /** Width in px. Columns without a size share the remaining width. */
  size?: number;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Identifiers and hashes. */
  mono?: boolean;
  /** Numbers, durations, timestamps. */
  tabular?: boolean;
  /** Leave this column out of the stacked card layout. */
  hideInCards?: boolean;
}

export interface DataTableRowAction {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DataTableProps<T> {
  /** Names the table: "Deployments". */
  label: string;
  columns: DataTableColumn<T>[];
  data: readonly T[];
  rowKey: (row: T) => string;
  /** A short name per row for checkbox and menu labels: "deployment a1b2c3d". */
  rowLabel?: (row: T) => string;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  defaultSorting?: SortingState;
  /** Adds a checkbox column. */
  selectable?: boolean;
  selectedKeys?: readonly string[];
  onSelectionChange?: (keys: string[]) => void;
  rowActions?: (row: T) => DataTableRowAction[];
  /** Makes rows keyboard-navigable (arrows, Enter). */
  onRowClick?: (row: T) => void;
  /** Renders eight skeleton rows and marks the table busy. */
  loading?: boolean;
  /** Shown inside the body when there are no rows, usually an EmptyState. */
  empty?: ReactNode;
  /** A failed load: an inline alert row with Retry. */
  error?: { message: string; onRetry?: () => void };
  /** 32 px rows. Defaults to the global density preference (useDensity). */
  dense?: boolean;
  /** Render only the rows in view. Defaults to on above 100 rows. */
  virtualize?: boolean;
  /** Height of the scrolling body when virtualized. Default 480. */
  maxHeight?: number;
  stickyHeader?: boolean;
  /**
   * Under 640 px: stack each row as a card (default; a sideways-scrolling
   * table gives no hint that columns are hidden) or keep the table and scroll.
   */
  responsive?: "scroll" | "cards";
  className?: string;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowSelectionFeature,
});

type Features = typeof features;

const NO_SORTING: SortingState = [];
const NO_KEYS: readonly string[] = [];
const LOADING_ROWS = 8;

function compareValues(a: CellValue, b: CellValue): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function resolve<V>(updater: Updater<V>, previous: V): V {
  return typeof updater === "function" ? (updater as (old: V) => V)(previous) : updater;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;
const JUSTIFY = { left: "justify-start", right: "justify-end", center: "justify-center" } as const;

const checkboxClasses = cn(
  "rounded-kbd inline-flex size-4 shrink-0 items-center justify-center border align-middle",
  "border-border-strong bg-surface text-accent-ink is-hover:border-text-secondary",
  "data-[state=checked]:border-accent-fill data-[state=checked]:bg-accent-fill",
  "data-[state=indeterminate]:border-accent-fill data-[state=indeterminate]:bg-accent-fill",
  // A 24 px hit area around the 16 px box (WCAG 2.5.8).
  "relative before:absolute before:-inset-1 before:content-['']",
);

function SelectBox({
  checked,
  label,
  onChange,
}: {
  checked: boolean | "indeterminate";
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      aria-label={label}
      onCheckedChange={(value) => {
        onChange(value === true);
      }}
      className={checkboxClasses}
    >
      <RadixCheckbox.Indicator className="inline-flex">
        {checked === "indeterminate" ? (
          <span className="bg-accent-ink block h-[2px] w-2" />
        ) : (
          <Icon name="check" size={12} />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

function RowActionsMenu({
  actions,
  label,
  open,
  onOpenChange,
}: {
  actions: DataTableRowAction[];
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-row-actions
          className={cn(
            "rounded-control text-text-secondary inline-flex size-[28px] items-center justify-center opacity-40",
            "transition-[opacity,background-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
            "group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
            "is-hover:bg-surface-hover is-hover:text-text data-[state=open]:bg-surface-hover",
          )}
        >
          <Icon name="ellipsis" size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            icon={action.icon}
            destructive={action.danger === true}
            disabled={action.disabled === true}
            onSelect={action.onSelect}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The data table: sortable headers, row selection, a row actions menu, sticky
 * header, skeleton loading, empty and error rows, dense mode, and row
 * virtualization (5,000 rows stay at 60 fps). Under 640 px it can stack rows
 * into cards. Built on TanStack Table and TanStack Virtual; callers describe
 * columns with plain functions and never touch the TanStack types.
 */
export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  rowKey,
  rowLabel,
  sorting: controlledSorting,
  onSortingChange,
  defaultSorting = NO_SORTING,
  selectable = false,
  selectedKeys = NO_KEYS,
  onSelectionChange,
  rowActions,
  onRowClick,
  loading = false,
  empty,
  error,
  dense: denseProp,
  virtualize: virtualizeProp,
  maxHeight = 480,
  stickyHeader = true,
  responsive = "cards",
  className,
}: DataTableProps<T>) {
  const [innerSorting, setInnerSorting] = useState<SortingState>(defaultSorting);
  const sorting = controlledSorting ?? innerSorting;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const pendingFocus = useRef<number | null>(null);
  // Cards render every row, so large (virtualized) tables keep the scrolling
  // table on phones rather than mount thousands of cards.
  const phone = useMediaQuery("(max-width: 639px)");

  const density = useDensity();
  const dense = denseProp ?? density === "compact";
  const rowHeight = dense ? 32 : 40;
  const virtualize = virtualizeProp ?? data.length > 100;
  const narrow = responsive === "cards" && !virtualize && phone;

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries(selectedKeys.map((key) => [key, true])),
    [selectedKeys],
  );

  const tableColumns = useMemo<ColumnDef<Features, T>[]>(
    () =>
      columns.map((column) => {
        const read = column.value;
        return {
          id: column.id,
          header: column.header,
          accessorFn: (row: T) => (read === undefined ? null : read(row)),
          enableSorting: column.sortable === true,
          sortFn: (a: Row<Features, T>, b: Row<Features, T>) =>
            compareValues(read?.(a.original), read?.(b.original)),
        };
      }),
    [columns],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data: data,
    getRowId: (row: T) => rowKey(row),
    state: { sorting, rowSelection },
    enableRowSelection: selectable,
    enableSortingRemoval: false,
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = resolve(updater, sorting);
      if (controlledSorting === undefined) {
        setInnerSorting(next);
      }
      onSortingChange?.(next);
    },
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => {
      const next = resolve(updater, rowSelection);
      onSelectionChange?.(Object.keys(next).filter((key) => next[key] === true));
    },
  });

  const rows = table.getRowModel().rows;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns mutable functions by design; this component is not memoized by the compiler.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: virtualize && !loading,
    initialRect: { width: 1024, height: maxHeight },
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  // After a keyboard move, focus the row once it has rendered.
  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) {
      return;
    }
    const element = bodyRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${String(index)}"]`,
    );
    if (element !== null && element !== undefined) {
      element.focus();
      pendingFocus.current = null;
    }
  });

  const columnById = new Map(columns.map((column) => [column.id, column]));
  const nameOf = (row: T) => rowLabel?.(row) ?? rowKey(row);
  const allSelected = rows.length > 0 && rows.every((row) => rowSelection[row.id] === true);
  const someSelected = rows.some((row) => rowSelection[row.id] === true);
  // Narrow screens scroll sideways instead of crushing columns; state rows (empty, error) fit the screen.
  const minTableWidth =
    columns.reduce((sum, column) => sum + (column.size ?? 160), 0) +
    (selectable ? 40 : 0) +
    (rowActions === undefined ? 0 : 48);
  const showRows = loading || (error === undefined && rows.length > 0);
  const colCount = columns.length + (selectable ? 1 : 0) + (rowActions === undefined ? 0 : 1);
  const navigable = onRowClick !== undefined;

  const moveFocus = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(next);
    pendingFocus.current = next;
    if (virtualize) {
      virtualizer.scrollToIndex(next, { align: "auto" });
    }
  };

  const onBodyKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    const rowElement = target.closest<HTMLElement>("[data-row-index]");
    if (rowElement === null || rowElement !== target) {
      return;
    }
    const index = Number(rowElement.dataset["rowIndex"]);
    const row = rows[index];
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(rows.length - 1);
        break;
      case "Enter":
        if (row !== undefined) {
          event.preventDefault();
          onRowClick?.(row.original);
        }
        break;
      case "F10":
        if (event.shiftKey && row !== undefined && rowActions !== undefined) {
          event.preventDefault();
          setMenuFor(row.id);
        }
        break;
      default:
        break;
    }
  };

  const onRowMouseClick = (event: MouseEvent<HTMLTableRowElement>, row: T, index: number) => {
    const interactive = (event.target as HTMLElement).closest("button, a, input, [role=checkbox]");
    if (interactive !== null) {
      return;
    }
    setFocusIndex(index);
    onRowClick?.(row);
  };

  const cellClasses = (column: DataTableColumn<T> | undefined) =>
    cn(
      "px-3 first:pl-4 last:pr-4 text-13 text-text truncate",
      ALIGN[column?.align ?? "left"],
      column?.mono === true && "font-mono",
      column?.tabular === true && "tabular",
    );

  const renderCell = (column: DataTableColumn<T> | undefined, row: T): ReactNode => {
    if (column === undefined) {
      return null;
    }
    if (column.cell !== undefined) {
      return column.cell(row);
    }
    const value = column.value?.(row);
    return value === null || value === undefined ? "" : String(value);
  };

  if (narrow) {
    return (
      <DataTableCards
        label={label}
        columns={columns}
        rows={rows.map((row) => row.original)}
        rowKey={rowKey}
        nameOf={nameOf}
        renderCell={renderCell}
        {...(rowActions === undefined ? {} : { rowActions })}
        {...(selectable
          ? {
              selection: {
                isSelected: (key: string) => rowSelection[key] === true,
                toggle: (key: string, checked: boolean) => {
                  table.getRow(key).toggleSelected(checked);
                },
              },
            }
          : {})}
        loading={loading}
        empty={empty}
        error={error}
        className={className}
      />
    );
  }

  const virtualItems = virtualize && !loading ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom = virtualize
    ? virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
    : 0;
  const visible: { row: Row<Features, T>; index: number }[] = virtualize
    ? virtualItems.flatMap((item) => {
        const row = rows[item.index];
        return row === undefined ? [] : [{ row, index: item.index }];
      })
    : rows.map((row, index) => ({ row, index }));

  const scrollStyle: CSSProperties | undefined = virtualize ? { maxHeight } : undefined;

  return (
    <div
      ref={scrollRef}
      data-dense={dense || undefined}
      className={cn(
        "border-border bg-surface rounded-card relative min-w-0 overflow-auto border",
        className,
      )}
      style={scrollStyle}
    >
      <table
        aria-label={label}
        aria-rowcount={loading ? -1 : rows.length + 1}
        aria-busy={loading || undefined}
        className="w-full table-fixed border-separate border-spacing-0"
        style={{ minWidth: showRows ? minTableWidth : undefined }}
      >
        <colgroup>
          {selectable && <col style={{ width: 40 }} />}
          {columns.map((column) => (
            <col
              key={column.id}
              style={column.size === undefined ? undefined : { width: column.size }}
            />
          ))}
          {rowActions !== undefined && <col style={{ width: 48 }} />}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            {selectable && (
              <th
                scope="col"
                className={cn(
                  "bg-surface border-border h-[36px] border-b pl-4",
                  stickyHeader && "sticky top-0 z-[var(--z-sticky)]",
                )}
              >
                <SelectBox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  label="Select all rows"
                  onChange={(checked) => {
                    table.toggleAllRowsSelected(checked);
                  }}
                />
              </th>
            )}
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const column = columnById.get(header.column.id);
              const sortable = header.column.getCanSort();
              const direction = header.column.getIsSorted();
              const ariaSort = !sortable
                ? undefined
                : direction === "asc"
                  ? "ascending"
                  : direction === "desc"
                    ? "descending"
                    : "none";
              return (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    "bg-surface border-border text-eyebrow h-[36px] border-b px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4",
                    ALIGN[column?.align ?? "left"],
                    stickyHeader && "sticky top-0 z-[var(--z-sticky)]",
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "text-eyebrow rounded-kbd -mx-1 inline-flex h-6 max-w-full items-center gap-1 px-1",
                        "is-hover:text-text transition-colors duration-[var(--dur-fast)]",
                        direction !== false && "text-text",
                        JUSTIFY[column?.align ?? "left"],
                      )}
                    >
                      <span className="truncate">{column?.header}</span>
                      <Icon
                        name={direction === false ? "chevrons-up-down" : "chevron-down"}
                        size={14}
                        className={cn(
                          direction === false && "opacity-60",
                          direction === "asc" && "rotate-180",
                        )}
                      />
                    </button>
                  ) : (
                    column?.header
                  )}
                </th>
              );
            })}
            {rowActions !== undefined && (
              <th
                scope="col"
                className={cn(
                  "bg-surface border-border h-[36px] border-b pr-4",
                  stickyHeader && "sticky top-0 z-[var(--z-sticky)]",
                )}
              >
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody ref={bodyRef} onKeyDown={onBodyKeyDown}>
          {loading ? (
            Array.from({ length: LOADING_ROWS }, (_, index) => (
              <tr key={`loading-${String(index)}`} style={{ height: rowHeight }}>
                {Array.from({ length: colCount }, (__, cellIndex) => (
                  <td key={cellIndex} className="border-border border-b px-3 first:pl-4 last:pr-4">
                    <Skeleton height={12} width={cellIndex === 0 ? "70%" : "50%"} />
                  </td>
                ))}
              </tr>
            ))
          ) : error !== undefined ? (
            <tr>
              <td colSpan={colCount} className="p-3">
                <Alert
                  variant="danger"
                  announce
                  {...(error.onRetry === undefined
                    ? {}
                    : { action: { label: "Retry", onClick: error.onRetry } })}
                >
                  {error.message}
                </Alert>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-12">
                {empty}
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={colCount} style={{ height: paddingTop, padding: 0 }} />
                </tr>
              )}
              {visible.map(({ row, index }) => {
                const original = row.original;
                const selected = rowSelection[row.id] === true;
                const actions = rowActions?.(original);
                return (
                  <tr
                    key={row.id}
                    data-row-index={index}
                    aria-rowindex={index + 2}
                    aria-selected={selectable ? selected : undefined}
                    tabIndex={navigable ? (index === focusIndex ? 0 : -1) : undefined}
                    onClick={
                      navigable
                        ? (event) => {
                            onRowMouseClick(event, original, index);
                          }
                        : undefined
                    }
                    style={{ height: rowHeight }}
                    className={cn(
                      "group/row -outline-offset-2 transition-colors duration-[var(--dur-fast)]",
                      "hover:bg-surface-hover",
                      selected && "bg-accent-subtle hover:bg-accent-subtle",
                      navigable && "cursor-pointer",
                    )}
                  >
                    {selectable && (
                      <td className="border-border border-b pl-4">
                        <SelectBox
                          checked={selected}
                          label={`Select ${nameOf(original)}`}
                          onChange={(checked) => {
                            row.toggleSelected(checked);
                          }}
                        />
                      </td>
                    )}
                    {row.getAllCells().map((cell) => {
                      const column = columnById.get(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className={cn("border-border border-b", cellClasses(column))}
                        >
                          {renderCell(column, original)}
                        </td>
                      );
                    })}
                    {actions !== undefined && (
                      <td className="border-border border-b pr-4 text-right">
                        <RowActionsMenu
                          actions={actions}
                          label={`Actions for ${nameOf(original)}`}
                          open={menuFor === row.id}
                          onOpenChange={(open) => {
                            setMenuFor(open ? row.id : null);
                          }}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={colCount} style={{ height: paddingBottom, padding: 0 }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DataTableCards<T extends RowData>({
  label,
  columns,
  rows,
  rowKey,
  nameOf,
  renderCell,
  rowActions,
  selection,
  loading,
  empty,
  error,
  className,
}: {
  label: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  nameOf: (row: T) => string;
  renderCell: (column: DataTableColumn<T> | undefined, row: T) => ReactNode;
  rowActions?: (row: T) => DataTableRowAction[];
  selection?: {
    isSelected: (key: string) => boolean;
    toggle: (key: string, checked: boolean) => void;
  };
  loading: boolean;
  empty: ReactNode;
  error: { message: string; onRetry?: () => void } | undefined;
  className: string | undefined;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [first, ...rest] = columns.filter((column) => column.hideInCards !== true);
  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label={label}
        role="list"
        className={cn("flex flex-col gap-2", className)}
      >
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            role="listitem"
            className="border-border bg-surface rounded-card border p-3"
          >
            <Skeleton variant="text" lines={3} />
          </div>
        ))}
      </div>
    );
  }
  if (error !== undefined) {
    return (
      <Alert
        variant="danger"
        announce
        {...(className === undefined ? {} : { className })}
        {...(error.onRetry === undefined
          ? {}
          : { action: { label: "Retry", onClick: error.onRetry } })}
      >
        {error.message}
      </Alert>
    );
  }
  if (rows.length === 0) {
    return <div className={className}>{empty}</div>;
  }
  return (
    <ul aria-label={label} role="list" className={cn("flex flex-col gap-2", className)}>
      {rows.map((row) => {
        const key = rowKey(row);
        const actions = rowActions?.(row);
        const selected = selection?.isSelected(key) === true;
        return (
          <li
            key={key}
            className={cn(
              "border-border bg-surface rounded-card flex flex-col gap-2 border p-3",
              selected && "bg-accent-subtle border-accent",
            )}
          >
            <div className="flex items-start gap-2">
              {selection !== undefined && (
                <span className="flex h-5 shrink-0 items-center">
                  <SelectBox
                    checked={selected}
                    label={`Select ${nameOf(row)}`}
                    onChange={(checked) => {
                      selection.toggle(key, checked);
                    }}
                  />
                </span>
              )}
              <div className="text-13 min-w-0 flex-1">{renderCell(first, row)}</div>
              {actions !== undefined && (
                <RowActionsMenu
                  actions={actions}
                  label={`Actions for ${nameOf(row)}`}
                  open={menuFor === key}
                  onOpenChange={(open) => {
                    setMenuFor(open ? key : null);
                  }}
                />
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {rest.map((column) => (
                <div key={column.id} className="contents">
                  <dt className="text-eyebrow self-center">{column.header}</dt>
                  <dd
                    className={cn(
                      "text-13 min-w-0 truncate",
                      column.mono === true && "font-mono",
                      column.tabular === true && "tabular",
                    )}
                  >
                    {renderCell(column, row)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
