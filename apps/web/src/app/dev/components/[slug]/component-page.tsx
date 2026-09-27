"use client";

import { DecodeText, Text } from "@lumen/ui";
import { COMPONENT_DOCS } from "@lumen/ui/examples";

/** Renders one registry page: title, summary, and every example in its own frame. */
export function ComponentPage({ slug }: { slug: string }) {
  const doc = COMPONENT_DOCS.find((entry) => entry.slug === slug);
  if (doc === undefined) {
    return null;
  }
  return (
    <div className="flex max-w-[1100px] flex-col gap-8" data-gallery-page={doc.slug}>
      <div className="flex flex-col gap-2">
        <Text variant="eyebrow">{doc.group}</Text>
        <DecodeText text={doc.name} replayKey={doc.slug} />
        <Text variant="body" className="text-text-secondary max-w-[720px]">
          {doc.summary}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {doc.examples.map((example, index) => (
          <section
            key={example.id}
            aria-labelledby={`example-${example.id}`}
            className={`flex flex-col gap-3 ${example.wide === true ? "xl:col-span-2" : ""}`}
          >
            <div className="flex items-baseline gap-3">
              <Text variant="eyebrow">{String(index + 1).padStart(2, "0")}</Text>
              <Text variant="label" as="h2" id={`example-${example.id}`}>
                {example.title}
              </Text>
            </div>
            {example.description !== undefined && (
              <Text variant="body-secondary">{example.description}</Text>
            )}
            <div
              data-gallery-example={`${doc.slug}/${example.id}`}
              className="border-border bg-bg flex min-h-[96px] items-center border p-6"
            >
              {example.render()}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
