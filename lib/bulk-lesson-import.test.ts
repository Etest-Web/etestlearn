import { describe, expect, test } from "vitest";
import { validateLessonCsv } from "./bulk-lesson-import";

describe("validateLessonCsv", () => {
  test("valid rows pass through", () => {
    const result = validateLessonCsv([
      { title: "Intro", contentType: "video", order: "0" },
      { title: "Chapter 1", contentType: "article", order: "1" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      { title: "Intro", contentType: "video", order: 0 },
      { title: "Chapter 1", contentType: "article", order: 1 },
    ]);
  });

  test("missing title reported", () => {
    const result = validateLessonCsv([
      { title: "", contentType: "video" },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors).toContain("title is required");
  });

  test("invalid contentType reported", () => {
    const result = validateLessonCsv([
      { title: "Lesson", contentType: "podcast" },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0]).toContain("must be one of");
  });

  test("missing column header reported", () => {
    const result = validateLessonCsv([{ name: "Lesson" }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0]).toContain("Missing required column");
  });

  test("order defaults to row position when absent", () => {
    const result = validateLessonCsv([
      { title: "A", contentType: "video" },
      { title: "B", contentType: "article" },
    ]);
    expect(result.valid[0].order).toBe(0);
    expect(result.valid[1].order).toBe(1);
  });

  test("invalid order reported", () => {
    const result = validateLessonCsv([
      { title: "Lesson", contentType: "video", order: "abc" },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0]).toContain("order must be");
  });

  test("empty input returns empty", () => {
    const result = validateLessonCsv([]);
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("contentType is case-insensitive", () => {
    const result = validateLessonCsv([
      { title: "Lesson", contentType: "Video" },
    ]);
    expect(result.valid[0].contentType).toBe("video");
  });

  test("rows sorted by order", () => {
    const result = validateLessonCsv([
      { title: "Last", contentType: "quiz", order: "5" },
      { title: "First", contentType: "video", order: "1" },
    ]);
    expect(result.valid[0].title).toBe("First");
    expect(result.valid[1].title).toBe("Last");
  });
});
