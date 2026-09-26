import { buttonDoc, iconButtonDoc, spinnerDoc } from "../components/button.examples";
import { avatarDoc, badgeDoc, kbdDoc, statusTagDoc } from "../components/status.examples";
import { tooltipDoc } from "../components/tooltip.examples";
import { iconsDoc } from "../icons/icons.examples";

import type { ComponentDoc } from "./types";

export type { ComponentDoc, ComponentGroup, Example } from "./types";

/** Every gallery page, in navigation order. The registry test checks coverage. */
export const COMPONENT_DOCS: readonly ComponentDoc[] = [
  iconsDoc,
  buttonDoc,
  iconButtonDoc,
  spinnerDoc,
  tooltipDoc,
  statusTagDoc,
  badgeDoc,
  avatarDoc,
  kbdDoc,
];
