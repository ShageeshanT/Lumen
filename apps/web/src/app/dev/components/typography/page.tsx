import { Text, TEXT_STYLES } from "@lumen/ui";

const SAMPLES: Record<string, string> = {
  display: "Deploy your first app",
  "page-title": "Projects",
  "section-title": "Recent deploys",
  "card-title": "api-production",
  subsection: "Networking",
  body: "Your app ran out of memory (512 MB). Give it 1 GB?",
  "body-secondary": "Sleep after 10 minutes without requests. The first request wakes it.",
  label: "Start command",
  action: "Redeploy →",
  meta: "Deployed 3 min ago · 42s · oracle-1",
  eyebrow: "01 · Active deployment",
  code: "DATABASE_URL",
  log: '12:04:07.318 INF listening on :3000 {"port":3000}',
  kbd: "⌘K",
};

export default function TypographyPage() {
  return (
    <div className="flex max-w-[1100px] flex-col gap-8" data-gallery-page="typography">
      <div className="flex flex-col gap-2">
        <Text variant="page-title">Typography</Text>
        <Text variant="body" className="text-text-secondary">
          Three voices: Geist Pixel for titles, Geist Mono in uppercase for chrome and as-is for
          identifiers and logs, Geist Sans for anything read as a sentence. Every style below is a
          named class; pages never set a raw size.
        </Text>
      </div>
      <ul className="flex flex-col">
        {TEXT_STYLES.map((style) => (
          <li
            key={style.name}
            className="border-border grid grid-cols-1 gap-2 border-b py-4 md:grid-cols-[1fr_280px] md:items-center md:gap-6"
          >
            <Text variant={style.name} as="div" data-text-style={style.name}>
              {SAMPLES[style.name] ?? style.use}
            </Text>
            <div className="flex flex-col gap-1">
              <span className="text-code" style={{ background: "transparent", padding: 0 }}>
                .text-{style.name}
              </span>
              <Text variant="meta" tabular>
                {String(style.size)} / {String(style.weight)} / {String(style.lineHeight)} /{" "}
                {style.tracking === 0 ? "0" : `${String(style.tracking)}em`} / {style.family} /{" "}
                {style.color}
              </Text>
              <Text variant="meta">{style.use}</Text>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
