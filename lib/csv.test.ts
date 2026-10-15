import { describe, expect, test } from "vitest";
import { parseCsv } from "./csv";

describe("lib/csv", () => {
  test("parses a simple CSV", () => {
    const result = parseCsv("title,contentType\nLesson 1,video\nLesson 2,article");
    expect(result).toEqual([
      { title: "Lesson 1", contentType: "video" },
      { title: "Lesson 2", contentType: "article" },
    ]);
  });

  test("handles quoted fields with commas", () => {
    const result = parseCsv('title,contentType\n"Lesson, with comma",video');
    expect(result).toEqual([{ title: "Lesson, with comma", contentType: "video" }]);
  });

  test("handles quoted fields with newlines", () => {
    const result = parseCsv('title,contentType\n"Lesson\nwith newline",video');
    expect(result).toEqual([{ title: "Lesson\nwith newline", contentType: "video" }]);
  });

  test("handles escaped quotes", () => {
    const result = parseCsv('title,contentType\n"Lesson with ""quotes""",video');
    expect(result).toEqual([{ title: 'Lesson with "quotes"', contentType: "video" }]);
  });

  test("skips empty lines", () => {
    const result = parseCsv("title,contentType\nLesson 1,video\n\nLesson 2,article");
    expect(result).toEqual([
      { title: "Lesson 1", contentType: "video" },
      { title: "Lesson 2", contentType: "article" },
    ]);
  });

  test("returns undefined for missing columns", () => {
    const result = parseCsv("title,contentType,durationMinutes\nLesson 1,video,\nLesson 2,article,30");
    expect(result).toEqual([
      { title: "Lesson 1", contentType: "video", durationMinutes: undefined },
      { title: "Lesson 2", contentType: "article", durationMinutes: "30" },
    ]);
  });

  test("handles CRLF line endings", () => {
    const result = parseCsv("title,contentType\r\nLesson 1,video\r\nLesson 2,article");
    expect(result).toEqual([
      { title: "Lesson 1", contentType: "video" },
      { title: "Lesson 2", contentType: "article" },
    ]);
  });

  test("empty input returns empty array", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("   ")).toEqual([]);
  });

  test("header only returns empty array", () => {
    expect(parseCsv("title,contentType")).toEqual([]);
  });
});