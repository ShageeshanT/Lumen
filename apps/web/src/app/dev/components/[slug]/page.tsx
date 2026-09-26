import { notFound } from "next/navigation";

import { COMPONENT_DOCS } from "@lumen/ui/examples";

import { ComponentPage } from "./component-page";

export function generateStaticParams() {
  return COMPONENT_DOCS.map((doc) => ({ slug: doc.slug }));
}

export default async function GalleryComponentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!COMPONENT_DOCS.some((doc) => doc.slug === slug)) {
    notFound();
  }
  return <ComponentPage slug={slug} />;
}
