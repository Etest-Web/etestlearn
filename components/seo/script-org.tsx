"use client";

import { useLayoutEffect } from "react";
import type { SchemaOrg } from "./types";

interface Props {
  organization: SchemaOrg;
}

export default function ScriptOrg({ organization }: Props) {
  useLayoutEffect(() => {
    // Remove any existing schema script to avoid duplicates
    const existing = document.head.querySelector(
      'script[type="application/ld+json"][data-schema="Organization"]'
    );
    if (existing) {
      existing.remove();
    }

    // Add Organization schema
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-schema", "Organization");
    script.textContent = JSON.stringify(organization);
    document.head.appendChild(script);

    // Add SEO meta tags
    const metaLanguage = document.querySelector('meta[name="language"]');
    if (!metaLanguage) {
      const langMeta = document.createElement("meta");
      langMeta.name = "language";
      langMeta.content = "en";
      document.head.appendChild(langMeta);
    }

    const metaAuthor = document.querySelector('meta[name="author"]');
    if (!metaAuthor) {
      const authorMeta = document.createElement("meta");
      authorMeta.name = "author";
      authorMeta.content = "Glypha Learn";
      document.head.appendChild(authorMeta);
    }

    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      const keywordsMeta = document.createElement("meta");
      keywordsMeta.name = "keywords";
      keywordsMeta.content =
        "online learning, LMS, courses, certification, Python training, data science, web development, Nigeria";
      document.head.appendChild(keywordsMeta);
    }
  }, [organization]);

  return null;
}