import { buttonDoc, iconButtonDoc, spinnerDoc } from "../components/button.examples";
import {
  canvasEdgeDoc,
  canvasFlowDoc,
  canvasGroupDoc,
  canvasNodeDoc,
  volumeChipDoc,
} from "../components/canvas.examples";
import { decodeTextDoc } from "../components/decode-text.examples";
import {
  checkboxDoc,
  comboboxDoc,
  copyFieldDoc,
  inputDoc,
  keyValueDoc,
  radioDoc,
  segmentedDoc,
  selectDoc,
  skeletonDoc,
  sliderDoc,
  switchDoc,
  textareaDoc,
} from "../components/form.examples";
import { logViewerDoc } from "../components/log-viewer.examples";
import { dnsRecordDoc, portCheckDoc, stepperDoc } from "../components/setup.examples";
import { avatarDoc, badgeDoc, kbdDoc, statusTagDoc } from "../components/status.examples";
import { tooltipDoc } from "../components/tooltip.examples";
import { iconsDoc } from "../icons/icons.examples";

import type { ComponentDoc } from "./types";

export type { ComponentDoc, ComponentGroup, Example } from "./types";

/** Every gallery page, in navigation order. The registry test checks coverage. */
export const COMPONENT_DOCS: readonly ComponentDoc[] = [
  iconsDoc,
  decodeTextDoc,
  buttonDoc,
  iconButtonDoc,
  spinnerDoc,
  inputDoc,
  textareaDoc,
  selectDoc,
  comboboxDoc,
  switchDoc,
  checkboxDoc,
  radioDoc,
  segmentedDoc,
  sliderDoc,
  keyValueDoc,
  copyFieldDoc,
  tooltipDoc,
  skeletonDoc,
  statusTagDoc,
  badgeDoc,
  avatarDoc,
  kbdDoc,
  // Specialized
  logViewerDoc,
  canvasFlowDoc,
  canvasNodeDoc,
  volumeChipDoc,
  canvasGroupDoc,
  canvasEdgeDoc,
  stepperDoc,
  dnsRecordDoc,
  portCheckDoc,
];
