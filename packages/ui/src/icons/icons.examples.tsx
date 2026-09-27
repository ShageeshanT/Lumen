import type { ComponentDoc } from "../examples/types";

import { DATABASE_NAMES, DATABASES, DatabaseIcon } from "./database-icon";
import { FRAMEWORK_NAMES, FrameworkIcon, FRAMEWORKS } from "./framework-icon";
import { Icon, ICON_NAMES } from "./icon";
import { LumenMark } from "./lumen-mark";
import { ProviderMark, PROVIDERS } from "./provider-mark";

export const iconsDoc: ComponentDoc = {
  slug: "icons",
  name: "Icons",
  group: "Foundations",
  summary:
    "Lucide at 1.5 px with square caps, from an explicit allowlist. Decorative by default; icon-only controls carry their own label.",
  components: ["Icon", "LumenMark", "FrameworkIcon", "DatabaseIcon", "ProviderMark"],
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
    {
      id: "frameworks",
      title: "Frameworks and languages",
      description: "Devicon marks, monochrome; static sites and unknown builds use Lucide.",
      wide: true,
      render: () => (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {FRAMEWORKS.map((framework) => (
            <li
              key={framework}
              className="border-border text-text-secondary flex items-center gap-3 border px-3 py-2"
            >
              <FrameworkIcon framework={framework} size={20} className="text-text" />
              <span className="text-meta truncate">{FRAMEWORK_NAMES[framework]}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "databases",
      title: "Databases",
      render: () => (
        <ul className="grid grid-cols-2 gap-2">
          {DATABASES.map((engine) => (
            <li
              key={engine}
              className="border-border text-text-secondary flex items-center gap-3 border px-3 py-2"
            >
              <DatabaseIcon engine={engine} size={20} className="text-text" />
              <span className="text-meta truncate">{DATABASE_NAMES[engine]}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "mark-sizes",
      title: "Marks at 14 · 16 · 20, secondary and accent",
      render: () => (
        <div className="flex items-end gap-4">
          {([14, 16, 20] as const).map((size) => (
            <FrameworkIcon key={size} framework="go" size={size} className="text-text-secondary" />
          ))}
          <DatabaseIcon engine="postgres" size={20} className="text-accent" />
          <FrameworkIcon framework="static" size={20} className="text-accent" />
        </div>
      ),
    },
    {
      id: "providers",
      title: "Provider tiles",
      description:
        "Monograms in Lumen's type; no trademark artwork until a guideline review is recorded.",
      render: () => (
        <div className="flex flex-col gap-4">
          {([20, 24, 32] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              {PROVIDERS.map((provider) => (
                <ProviderMark key={provider} provider={provider} size={size} label />
              ))}
            </div>
          ))}
        </div>
      ),
    },
  ],
};
