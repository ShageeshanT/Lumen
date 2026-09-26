import type { ComponentDoc } from "../examples/types";

import { Button } from "./button";
import { Tooltip } from "./tooltip";

export const tooltipDoc: ComponentDoc = {
  slug: "tooltip",
  name: "Tooltip",
  group: "Overlays",
  summary: "One sentence on hover or focus, with an optional shortcut. Never interactive.",
  components: ["Tooltip", "TooltipProvider"],
  examples: [
    {
      id: "open",
      title: "Open, with and without a shortcut",
      render: () => (
        <div className="flex w-full items-center justify-around py-16">
          <Tooltip content="Search projects, services and commands" shortcut={["mod", "K"]} open>
            <Button leadingIcon="search">Search</Button>
          </Tooltip>
          <Tooltip content="Projects" shortcut={["G", "then", "P"]} side="right" open>
            <Button variant="ghost" leadingIcon="layout-grid">
              Rail item
            </Button>
          </Tooltip>
        </div>
      ),
    },
    {
      id: "disabled-reason",
      title: "Explaining a disabled button",
      description: "Wrap the disabled button in a focusable span so the reason is reachable.",
      render: () => (
        <div className="py-12">
          <Tooltip content="Viewers can't deploy. Ask an admin for the member role" open>
            <span tabIndex={0} className="inline-flex">
              <Button variant="primary" disabled>
                Deploy
              </Button>
            </span>
          </Tooltip>
        </div>
      ),
    },
  ],
};
