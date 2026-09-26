import { COMPONENT_DOCS } from "@lumen/ui/examples";

/** The gallery registry for Playwright: every page and example id. Dev only. */
export function GET() {
  if (process.env.NODE_ENV === "production" && process.env.LUMEN_ENABLE_GALLERY !== "true") {
    return new Response(null, { status: 404 });
  }
  return Response.json({
    pages: ["tokens", "typography", "signal", ...COMPONENT_DOCS.map((doc) => doc.slug)],
    examples: COMPONENT_DOCS.flatMap((doc) =>
      doc.examples.map((example) => `${doc.slug}/${example.id}`),
    ),
  });
}
