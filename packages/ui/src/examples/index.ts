import { buttonDoc, iconButtonDoc, spinnerDoc } from "../components/button.examples";
import {
  chartDoc,
  codeBlockDoc,
  dataTableDoc,
  diffViewerDoc,
  terminalFrameDoc,
} from "../components/data.examples";
import {
  alertDoc,
  emptyStateDoc,
  errorCardDoc,
  progressStepsDoc,
  toastDoc,
} from "../components/feedback.examples";
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
import {
  avatarDoc,
  avatarStackDoc,
  badgeDoc,
  kbdDoc,
  statusTagDoc,
} from "../components/status.examples";
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
  toastDoc,
  alertDoc,
  progressStepsDoc,
  emptyStateDoc,
  errorCardDoc,
  statusTagDoc,
  badgeDoc,
  avatarDoc,
  avatarStackDoc,
  kbdDoc,
  dataTableDoc,
  chartDoc,
  codeBlockDoc,
  terminalFrameDoc,
  diffViewerDoc,
];
