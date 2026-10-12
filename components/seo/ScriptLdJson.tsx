"use client";

import Script from "next/script";
import type { SchemaOrg } from "./types";

interface Props {
  schema: SchemaOrg;
  id?: string;
}

/**
 * Renders a JSON-LD <script> inline in the HTML.
 *
 * Uses next/script with strategy="beforeInteractive" so the tag is present in
 * the SSR/SSG HTML (crawlers without JS see it immediately) and stays in sync
 * across client navigations. Each schema uses a unique `id` so multiple
 * schemas on one page don't get deduped.
 */
export default function ScriptLdJson({ schema, id }: Props) {
  const jsonLd = JSON.stringify(schema, null, 2);

  return (
    <Script
      id={id}
      type="application/ld+json"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}