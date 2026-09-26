import type { ComponentDoc } from "../examples/types";

import { Icon, ICON_NAMES } from "./icon";
import { LumenMark } from "./lumen-mark";

export const iconsDoc: ComponentDoc = {
  slug: "icons",
  name: "Icons",
  group: "Foundations",
  summary:
    "Lucide at 1.5 px with square caps, from an explicit allowlist. Decorative by default; icon-only controls carry their own label.",
  components: ["Icon", "LumenMark"],
  examples: [
    {
      id: "mark",
      title: "Lumen mark",
      render: () => (
        <div className="flex items-center gap-6">
          <LumenMark size={24} />
          <LumenMark size={40} />
          <LumenMark size={40} monochrome />
          <span className="text-text-secondary">
            <LumenMark size={24} monochrome />
          </span>
        </div>
      ),
    },
    {
      id: "set",
      title: "The allowlist",
      wide: true,
      render: () => (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {ICON_NAMES.map((name) => (
            <li
              key={name}
              className="border-border text-text-secondary flex items-center gap-3 border px-3 py-2"
            >
              <Icon name={name} size={16} className="text-text" />
              <span className="text-meta truncate">{name}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "sizes",
      title: "Sizes 12 · 14 · 16 · 20",
      render: () => (
        <div className="text-text flex items-end gap-4">
          {([12, 14, 16, 20] as const).map((size) => (
            <Icon key={size} name="server" size={size} />
          ))}
        </div>
      ),
    },
  ],
};
