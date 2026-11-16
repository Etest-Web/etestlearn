import { describe, expect, test } from "vitest";
import { sanitizeArticleHtml } from "./sanitize-html";

describe("sanitizeArticleHtml", () => {
  test("strips scripts and inline event handlers", () => {
    const out = sanitizeArticleHtml(
      '<p onclick="steal()">hi<script>alert(1)</script></p>',
    );
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
  });

  test("strips the img onerror bypass", () => {
    const out = sanitizeArticleHtml(
      '<img src="https://cdn.example.com/a.png" onerror="alert(1)">',
    );
    expect(out).toContain("<img");
    expect(out).not.toContain("onerror");
  });

  test("strips javascript: URLs", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  test("drops forms, inputs and frames entirely", () => {
    const out = sanitizeArticleHtml(
      '<form action="https://evil.example.com"><input name="card"></form><iframe src="https://evil.example.com"></iframe><p>ok</p>',
    );
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("<p>ok</p>");
  });

  test("keeps ordinary article markup intact", () => {
    const input =
      '<h2>Title</h2><p>Some <strong>bold</strong> text and <a href="https://example.com">a link</a></p><ul><li>one</li></ul><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table><img src="https://cdn.example.com/a.png" alt="a" style="max-width: 100%; height: auto;">';
    const out = sanitizeArticleHtml(input);
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<table>");
    expect(out).toContain('src="https://cdn.example.com/a.png"');
    expect(out).toContain("max-width: 100%");
  });
});
