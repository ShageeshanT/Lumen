import type { ComponentDoc } from "../examples/types";

import { DecodeText } from "./decode-text";

export const decodeTextDoc: ComponentDoc = {
  slug: "decode-text",
  name: "Decode title",
  group: "Foundations",
  summary:
    "A display title that resolves from glyph noise once, in under 360 ms. The final text is the accessible name throughout; under reduced motion it simply appears.",
  components: ["DecodeText"],
  examples: [
    {
      id: "titles",
      title: "Page, section and display titles",
      description: "Screenshots capture the settled title.",
      render: () => (
        <div className="flex flex-col gap-4">
          <DecodeText text="Deployments" variant="display" as="p" />
          <DecodeText text="api · production" as="p" />
          <DecodeText text="Variables" variant="section-title" as="p" />
        </div>
      ),
    },
  ],
};
