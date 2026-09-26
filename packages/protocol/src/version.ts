/**
 * The agent protocol version this build speaks. The single source of truth is
 * the PROTOCOL_VERSION file next to this package; a test keeps them equal.
 * The control plane accepts agents at this version and the one before it
 * (SPEC B5).
 */
export const PROTOCOL_VERSION = 1;
