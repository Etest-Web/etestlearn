/**
 * Validates parsed CSV rows for bulk lesson import.
 * Client-side only — each valid row becomes a `createLesson` call.
 */

const VALID_CONTENT_TYPES = ["video", "article", "quiz"] as const;
type ContentType = (typeof VALID_CONTENT_TYPES)[number];

export type ValidLessonRow = {
  title: string;
  contentType: ContentType;
  order: number;
};

export type ImportRowError = {
  row: number;
  errors: string[];
};

export type ValidationResult = {
  valid: ValidLessonRow[];
  errors: ImportRowError[];
};

export function validateLessonCsv(
  rows: Record<string, string | undefined>[],
): ValidationResult {
  const valid: ValidLessonRow[] = [];
  const errors: ImportRowError[] = [];

  if (rows.length === 0) return { valid, errors };

  const keys = Object.keys(rows[0]);
  if (!keys.includes("title")) {
    errors.push({ row: 1, errors: ["Missing required column: title"] });
    return { valid, errors };
  }
  if (!keys.includes("contentType")) {
    errors.push({ row: 1, errors: ["Missing required column: contentType"] });
    return { valid, errors };
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineErrors: string[] = [];
    const lineNum = i + 2; // header = 1

    const title = r.title?.trim();
    if (!title) lineErrors.push("title is required");

    const ct = r.contentType?.trim().toLowerCase();
    if (!ct) {
      lineErrors.push("contentType is required");
    } else if (!VALID_CONTENT_TYPES.includes(ct as ContentType)) {
      lineErrors.push(
        `contentType must be one of: ${VALID_CONTENT_TYPES.join(", ")}`,
      );
    }

    let order = i; // default: row position
    if (r.order !== undefined) {
      const n = parseInt(r.order, 10);
      if (Number.isNaN(n) || n < 0) {
        lineErrors.push("order must be a non-negative integer");
      } else {
        order = n;
      }
    }

    if (lineErrors.length > 0) {
      errors.push({ row: lineNum, errors: lineErrors });
    } else {
      valid.push({ title: title!, contentType: ct as ContentType, order });
    }
  }

  valid.sort((a, b) => a.order - b.order);
  return { valid, errors };
}
