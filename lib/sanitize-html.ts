import DOMPurify from "isomorphic-dompurify";

/**
 * The one place article HTML is made safe to inject.
 *
 * Lesson HTML is author-supplied and lands in the DOM via
 * `dangerouslySetInnerHTML` on both the instructor preview and the learner
 * lesson page. DOMPurify strips scripts, event handlers and `javascript:`
 * URLs by default; the forbid-list below additionally drops active-content
 * and form surfaces an article has no business containing. Inline styles are
 * kept — `style-src` already allows them and authors use them for image
 * sizing.
 */
export function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "link",
      "meta",
    ],
  });
}
