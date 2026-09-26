import Link from "next/link";

import { Text } from "@lumen/ui";

import { GALLERY_GROUPS } from "./_lib/nav";

export default function GalleryIndexPage() {
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Text variant="page-title">Component gallery</Text>
        <Text variant="body" className="text-text-secondary">
          Every token, text style and component of the Lumen kit, in both themes. Pages are
          assembled from these pieces and never invent a color, size or animation.
        </Text>
      </div>
      {GALLERY_GROUPS.map((group) => (
        <section key={group.label} className="flex flex-col gap-2">
          <Text variant="section-title">{group.label}</Text>
          <ul className="flex flex-col gap-1">
            {group.entries.map((entry) => (
              <li key={entry.slug}>
                <Link href={`/dev/components/${entry.slug}`} className="text-accent-text text-body">
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
