"use client";

import { useMemo } from "react";
import type { SchemaOrg } from "./types";

interface Props {
  schema: SchemaOrg;
}

export default function SchemaOrg({ schema }: Props) {
  const jsonLd = useMemo(() => {
    try {
      return `<script type="application/ld+json">${JSON.stringify(
        schema,
        null,
        2
      )}</script>`;
    } catch (e) {
      console.error("Failed to serialize schema:", e);
      return "";
    }
  }, [schema]);

  return jsonLd ? <div dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null;
}