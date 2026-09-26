import { notFound } from "next/navigation";

/** Component gallery route. Phase 01 fills it; until then it only proves the guard works. */
export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === "production" && process.env.LUMEN_ENABLE_GALLERY !== "true") {
    notFound();
  }
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">Component gallery</h1>
      <p className="mt-2 font-mono text-sm">Phase 01 fills this page.</p>
    </main>
  );
}
