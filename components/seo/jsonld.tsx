import { headers } from "next/headers";
import type { SchemaOrg } from "./types";

/**
 * Renders one or more schema.org documents as real `<script type="application/ld+json">`
 * tags in the **server-rendered HTML**.
 *
 * Why this exists rather than a `useEffect` that appends to `document.head`:
 * a crawler reads the bytes the server sent. A schema injected after hydration
 * is invisible to anything that does not run JavaScript, and Google explicitly
 * documents that structured data must be present in the initial response.
 *
 * The nonce comes from the request header rather than from the caller. It has
 * to: `script-src` here carries no `'unsafe-inline'` (see `lib/csp.ts`), so an
 * inline `<script>` without the per-request nonce is blocked by the browser.
 * Threading a nonce through every call site would put that obligation on
 * whoever adds the next schema, and the failure mode is silent — the tag is in
 * the HTML but the browser refuses it.
 */
export default async function JsonLd({
  schema,
  id,
}: {
  schema: SchemaOrg | SchemaOrg[];
  id?: string;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const documents = Array.isArray(schema) ? schema : [schema];

  return (
    <>
      {documents.map((doc, index) => (
        <script
          key={id ? `${id}-${index}` : index}
          type="application/ld+json"
          id={id && documents.length === 1 ? id : undefined}
          nonce={nonce}
          // `</script>` inside a course description would close the tag early
          // and let the rest of that description be parsed as markup. Escaping
          // the sequence keeps the JSON valid and the document inert.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(doc).replace(/<\/script/gi, "<\\/script"),
          }}
        />
      ))}
    </>
  );
}
