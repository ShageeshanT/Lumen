"use client";

import { useState } from "react";

/**
 * Overlays rendered into a container (gallery previews) that are already open
 * when they mount must not pull focus away from the page. Once closed and
 * reopened they behave normally. Call the returned function from
 * onOpenAutoFocus. The flag clears when `open` is seen false, not on first
 * use, because Strict Mode mounts focus scopes twice.
 */
export function useSkipMountFocus(open: boolean | undefined, contained: boolean): () => boolean {
  const [skip, setSkip] = useState(contained && open === true);
  if (open !== true && skip) {
    setSkip(false);
  }
  return () => skip;
}
