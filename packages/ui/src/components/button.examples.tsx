import type { ComponentDoc } from "../examples/types";

import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Spinner } from "./spinner";

const VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export const buttonDoc: ComponentDoc = {
  slug: "button",
  name: "Button",
  group: "Buttons",
  summary:
    "Uppercase mono labels in thin frames. One primary per view: the full-ink frame with brackets that spread on hover.",
  components: ["Button"],
  examples: [
    {
      id: "variants-sizes",
      title: "Variants × sizes",
      wide: true,
      render: () => (
        <div className="flex flex-col gap-4">
          {SIZES.map((size) => (
            <Row key={size}>
              {VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant === "danger" ? "Delete" : variant === "primary" ? "Deploy" : "View logs"}
                </Button>
              ))}
            </Row>
          ))}
        </div>
      ),
    },
    {
      id: "icons-arrow",
      title: "With icons and the arrow",
      render: () => (
        <Row>
          <Button variant="primary" leadingIcon="rotate-cw" arrow>
            Redeploy
          </Button>
          <Button leadingIcon="file-text">View logs</Button>
          <Button variant="ghost" leadingIcon="terminal">
            Open shell
          </Button>
          <Button trailingIcon="chevron-down">Production</Button>
        </Row>
      ),
    },
    {
      id: "hover",
      title: "Hover",
      description: "Forced with data-force for the screenshot.",
      render: () => (
        <Row>
          {VARIANTS.map((variant) => (
            <Button
              key={variant}
              variant={variant}
              data-force="hover"
              arrow={variant === "primary"}
            >
              {variant === "danger" ? "Delete" : "Deploy"}
            </Button>
          ))}
        </Row>
      ),
    },
    {
      id: "focus",
      title: "Keyboard focus",
      render: () => (
        <Row>
          <Button variant="primary" data-force="focus">
            Deploy
          </Button>
          <Button data-force="focus">View logs</Button>
        </Row>
      ),
    },
    {
      id: "pressed",
      title: "Pressed",
      render: () => (
        <Row>
          <Button variant="primary" data-force="active">
            Deploy
          </Button>
          <Button data-force="active">View logs</Button>
        </Row>
      ),
    },
    {
      id: "loading",
      title: "Loading",
      description: "Spinner replaces the leading icon; the width holds and clicks are blocked.",
      render: () => (
        <Row>
          <Button variant="primary" loading leadingIcon="rotate-cw">
            Redeploy
          </Button>
          <Button loading>Saving</Button>
          <Button variant="danger" loading>
            Deleting
          </Button>
        </Row>
      ),
    },
    {
      id: "disabled",
      title: "Disabled",
      render: () => (
        <Row>
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} disabled>
              {variant === "danger" ? "Delete" : "Deploy"}
            </Button>
          ))}
        </Row>
      ),
    },
    {
      id: "danger-solid",
      title: "Destructive confirm",
      description: "The solid danger button appears only inside a confirm dialog.",
      render: () => (
        <Row>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger-solid" leadingIcon="trash-2">
            Delete service
          </Button>
        </Row>
      ),
    },
    {
      id: "full-width-link",
      title: "Full width and as a link",
      render: () => (
        <div className="flex w-[320px] flex-col gap-3">
          <Button variant="primary" fullWidth arrow>
            Deploy your first app
          </Button>
          <Button asChild>
            <a href="#docs">Read the docs</a>
          </Button>
        </div>
      ),
    },
  ],
};

export const iconButtonDoc: ComponentDoc = {
  slug: "icon-button",
  name: "Icon button",
  group: "Buttons",
  summary: "Icon-only actions. Always labelled, always with a tooltip that also shows on focus.",
  components: ["IconButton"],
  examples: [
    {
      id: "variants",
      title: "Sizes × variants",
      render: () => (
        <div className="flex flex-col gap-3">
          {(["sm", "md"] as const).map((size) => (
            <Row key={size}>
              <IconButton icon="ellipsis" label="More actions" size={size} />
              <IconButton icon="copy" label="Copy URL" size={size} variant="secondary" />
              <IconButton icon="trash-2" label="Delete variable" size={size} variant="danger" />
              <IconButton icon="x" label="Close" size={size} disabled />
            </Row>
          ))}
        </div>
      ),
    },
    {
      id: "toggle",
      title: "Toggle",
      render: () => (
        <Row>
          <IconButton icon="sun" label="Light theme" pressed={false} variant="secondary" />
          <IconButton icon="moon" label="Dark theme" pressed variant="secondary" />
        </Row>
      ),
    },
    {
      id: "hover-focus",
      title: "Hover and focus",
      render: () => (
        <Row>
          <IconButton icon="bell" label="Notifications" data-force="hover" />
          <IconButton icon="search" label="Search" data-force="focus" />
        </Row>
      ),
    },
  ],
};

export const spinnerDoc: ComponentDoc = {
  slug: "spinner",
  name: "Spinner",
  group: "Buttons",
  summary: "A turning arc for work in progress. It keeps turning under reduced motion.",
  components: ["Spinner"],
  examples: [
    {
      id: "sizes",
      title: "Sizes",
      render: () => (
        <Row>
          <Spinner size={12} />
          <Spinner size={14} />
          <Spinner size={16} />
          <Spinner size={20} />
          <span className="text-accent-text inline-flex items-center gap-2">
            <Spinner size={14} decorative />
            <span className="text-action">Connecting</span>
          </span>
        </Row>
      ),
    },
  ],
};
