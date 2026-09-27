import { VendoredMark } from "./framework-icon";
import type { IconSize } from "./icon";

export const DATABASES = ["postgres", "mysql", "redis", "mongodb"] as const;

export type DatabaseEngine = (typeof DATABASES)[number];

export const DATABASE_NAMES: Record<DatabaseEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  redis: "Redis",
  mongodb: "MongoDB",
};

export interface DatabaseIconProps {
  engine: DatabaseEngine;
  size?: IconSize;
  /** A brand tint. Monochrome (the current text color) when omitted. */
  color?: string;
  className?: string;
  /** Accessible name; omit when the engine's name is written next to it. */
  label?: string;
}

/** The database engine a service runs, as its Devicon mark. */
export function DatabaseIcon({ engine, size = 20, color, className, label }: DatabaseIconProps) {
  return (
    <VendoredMark icon={engine} size={size} color={color} className={className} label={label} />
  );
}
