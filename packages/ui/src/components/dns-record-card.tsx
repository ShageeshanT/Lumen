"use client";

import { Icon } from "../icons/icon";
import { cn } from "../lib/cn";
import { formatRelativeTime } from "../lib/format";

import { Button } from "./button";
import { CopyField } from "./copy-field";
import { Spinner } from "./spinner";

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";

export interface DnsRecord {
  type: DnsRecordType;
  /** As the user types it at their DNS provider: "apps", "*.apps", "@". */
  name: string;
  value: string;
  ttl?: number;
}

export type DnsCheckStatus = "idle" | "checking" | "ok" | "mismatch" | "missing";

export interface DnsCheck {
  status: DnsCheckStatus;
  /** What the resolver returned, for a mismatch. */
  observed?: string;
  checkedAt?: Date | number;
}

export interface DnsRecordCardProps {
  record: DnsRecord;
  check: DnsCheck;
  onRecheck?: () => void;
  /** The zone, so the accessible name reads "DNS record A for apps.example.com". */
  zone?: string;
  /** Reference time for "checked 20s ago". */
  now?: Date | number;
  className?: string;
}

/** "checked 20s ago", "checked 3 min ago". */
export function checkedAgo(checkedAt: Date | number, now: Date | number): string {
  const at = typeof checkedAt === "number" ? checkedAt : checkedAt.getTime();
  const reference = typeof now === "number" ? now : now.getTime();
  const seconds = Math.max(0, Math.round((reference - at) / 1000));
  return seconds < 60
    ? `checked ${String(seconds)}s ago`
    : `checked ${formatRelativeTime(at, reference)}`;
}

/** The status sentence the card shows and announces. */
export function dnsStatusText(record: DnsRecord, check: DnsCheck): string {
  switch (check.status) {
    case "idle":
      return "Not checked yet";
    case "checking":
      return "Checking…";
    case "ok":
      return "Pointing here";
    case "mismatch":
      return `Points to ${check.observed ?? "another address"}, expected ${record.value}`;
    case "missing":
      return "Not found yet";
  }
}

const TONE: Record<DnsCheckStatus, string> = {
  idle: "text-text-secondary",
  checking: "text-text-secondary",
  ok: "text-success-text",
  mismatch: "text-warning-text",
  missing: "text-text-secondary",
};

function Marker({ status }: { status: DnsCheckStatus }) {
  if (status === "checking") {
    return <Spinner size={14} decorative />;
  }
  if (status === "ok") {
    return <Icon name="circle-check" size={14} className="text-success" />;
  }
  if (status === "mismatch") {
    return <Icon name="triangle-alert" size={14} className="text-warning" />;
  }
  return <span aria-hidden="true" className="border-text-secondary size-[6px] border" />;
}

/**
 * One DNS record the user must add at their provider: type, name and value,
 * each copyable, and a live check underneath that says whether the record is
 * visible yet and what to fix when it points elsewhere.
 */
export function DnsRecordCard({
  record,
  check,
  onRecheck,
  zone,
  now,
  className,
}: DnsRecordCardProps) {
  const fqdn =
    zone === undefined ? record.name : record.name === "@" ? zone : `${record.name}.${zone}`;
  const status = dnsStatusText(record, check);
  return (
    <div
      role="group"
      aria-label={`DNS record ${record.type} for ${fqdn}`}
      data-dns-status={check.status}
      className={cn(
        "border-border bg-surface rounded-card flex w-full max-w-[640px] flex-col gap-4 border p-4",
        className,
      )}
    >
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex flex-col gap-1">
          <span className="text-label text-text-secondary">Type</span>
          <CopyField value={record.type} label="record type" size="sm" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label text-text-secondary">Name</span>
          <CopyField value={record.name} label="record name" size="sm" />
        </div>
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-label text-text-secondary">Value</span>
          <CopyField value={record.value} label="record value" size="sm" truncate="middle" />
        </div>
      </div>
      <div className="flex min-h-[28px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Marker status={check.status} />
          <span
            className={cn("text-body-secondary min-w-0", TONE[check.status])}
            aria-live="polite"
          >
            {status}
          </span>
        </span>
        {check.checkedAt !== undefined && check.status !== "checking" && (
          <span className="text-meta">{checkedAgo(check.checkedAt, now ?? Date.now())}</span>
        )}
        {onRecheck !== undefined && (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon="refresh-cw"
            onClick={onRecheck}
            disabled={check.status === "checking"}
          >
            Recheck
          </Button>
        )}
      </div>
    </div>
  );
}
