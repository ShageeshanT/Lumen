import { COMPONENT_DOCS } from "@lumen/ui/examples";

import { BESPOKE_PAGES } from "../_lib/nav";

/** The gallery registry for Playwright: every page and example id. Dev only. */
export function GET() {
  if (process.env.NODE_ENV === "production" && process.env.LUMEN_ENABLE_GALLERY !== "true") {
    return new Response(null, { status: 404 });
  }
  return Response.json({
    pages: [...BESPOKE_PAGES, ...COMPONENT_DOCS.map((doc) => doc.slug)],
    modalPages: COMPONENT_DOCS.filter((doc) =>
      doc.examples.some((example) => example.forcesModal === true),
    ).map((doc) => doc.slug),
    examples: COMPONENT_DOCS.flatMap((doc) =>
      doc.examples.map((example) => `${doc.slug}/${example.id}`),
    ),
  });
}
