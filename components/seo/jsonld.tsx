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
 * This component is deliberately **synchronous** and carries no `nonce`. An
 * `<script type="application/ld+json">` element is an inert data block, not an
 * executable script: the browser parses its text content and never runs it, so
 * CSP's `script-src` (the directive that would require a nonce) does not apply
 * to it. Reading `headers()` to thread a nonce here would opt every route that
 * renders a schema — the root layout, the landing page, the course and
 * instructor pages — into per-request dynamic rendering, which is exactly what
 * keeps them from being statically prerendered. Structured data must ship in
 * the initial HTML, so these pages need to stay static; a nonce on an inert
 * data block would cost that for nothing.
 */
export default function JsonLd({
  schema,
  id,
}: {
  schema: SchemaOrg | SchemaOrg[];
  id?: string;
}) {
  const documents = Array.isArray(schema) ? schema : [schema];

  return (
    <>
      {documents.map((doc, index) => (
        <script
          key={id ? `${id}-${index}` : index}
          type="application/ld+json"
          id={id && documents.length === 1 ? id : undefined}
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
