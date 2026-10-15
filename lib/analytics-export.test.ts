import { describe, expect, test } from "vitest";
import {
  escapeCsvField,
  csvCell,
  csvRows,
  nairaFromKobo,
  analyticsFilename,
  buildAnalyticsExport,
} from "./analytics-export";

describe("analytics-export", () => {
  test("escapeCsvField leaves plain text alone", () => {
    expect(escapeCsvField("Hello")).toBe("Hello");
  });

  test("escapeCsvField quotes when a comma is present", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  test("escapeCsvField quotes and doubles quotes", () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  test("escapeCsvField quotes on newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  test("csvCell handles null, undefined, numbers, strings", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(123)).toBe("123");
    expect(csvCell(-45)).toBe("-45");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(Infinity)).toBe("");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("with,comma")).toBe('"with,comma"');
  });

  test("csvRows joins with CRLF", () => {
    expect(csvRows([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  test("nairaFromKobo formats kobo to NGN with two decimals", () => {
    expect(nairaFromKobo(500000)).toBe("5000.00");
    expect(nairaFromKobo(-2500)).toBe("-25.00");
    expect(nairaFromKobo(0)).toBe("0.00");
    expect(nairaFromKobo(null)).toBe("");
    expect(nairaFromKobo(undefined)).toBe("");
  });

  test("analyticsFilename is deterministic and UTC", () => {
    // 2026-10-16T04:30:45.000Z
    expect(analyticsFilename(1792125045000)).toBe("glypha-analytics-2026-10-16.csv");
  });

  test("buildAnalyticsExport produces a valid CSV with BOM and two sections", () => {
    const mockPulse = {
      courses: 2,
      publishedCourses: 1,
      draftCourses: 1,
      lessons: 5,
      quizCount: 2,
      learners: {
        enrolled: 10,
        activeThisWeek: 2,
        newThisMonth: 1,
        completed: 3,
        inProgress: 4,
        notStarted: 3,
        averageProgress: 42,
        completionRate: 30,
      },
      quizPerformance: {
        attemptedBy: 8,
        passedBy: 6,
        passRate: 75,
        passRateByCourse: [],
      },
      certificates: {
        issued: 3,
        revoked: 0,
        active: 3,
        issuedThisMonth: 1,
      },
      engagement: { lessonsCompleted7d: 12, lessonsCompleted30d: 35 },
      atRisk: [],
      atRiskCount: 2,
    };

    const mockPerformance = [
      {
        courseId: "c1" as const,
        title: "Course One",
        slug: "course-one",
        thumbnailUrl: null,
        category: "Design",
        level: "Beginner",
        published: true,
        price: 500_000,
        currency: "NGN",
        createdAt: 1700000000000,
        lessons: 3,
        enrollmentCount: 8,
        activeLearners: 2,
        completedCount: 3,
        completionRate: 38,
        averageProgress: 45,
        sales: 8,
        grossKobo: 4_000_000,
        refundedKobo: 0,
        netEarningsKobo: 3_200_000,
        averageOrderKobo: 400_000,
        conversionRate: 1.3,
        certificateCount: 3,
        revokedCertificateCount: 0,
      },
      {
        courseId: "c2" as const,
        title: "Course Two",
        slug: "course-two",
        thumbnailUrl: null,
        category: null,
        level: null,
        published: false,
        price: 0,
        currency: "NGN",
        createdAt: 1710000000000,
        lessons: 2,
        enrollmentCount: 2,
        activeLearners: 0,
        completedCount: 0,
        completionRate: 0,
        averageProgress: 30,
        sales: 0,
        grossKobo: 0,
        refundedKobo: 0,
        netEarningsKobo: 0,
        averageOrderKobo: 0,
        conversionRate: 0,
        certificateCount: 0,
        revokedCertificateCount: 0,
      },
    ];

    const { filename, content } = buildAnalyticsExport({
      pulse: mockPulse,
      performance: mockPerformance,
    });

    // Filename is stable and has the date
    expect(filename).toMatch(/^glypha-analytics-\d{4}-\d{2}-\d{2}\.csv$/);

    // Content starts with BOM
    expect(content.charCodeAt(0)).toBe(0xfeff);

    // Has both section headers
    expect(content).toContain("Summary");
    expect(content).toContain("Per-course performance");

    // Has the right columns for the first course row
    const lines = content.split("\r\n");
    const headerLine = lines.find((l) => l.startsWith("Course,Slug"));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain("Net earnings (NGN)");

    // First data row has correct values
    const dataLine1 = lines.find((l) => l.startsWith("Course One"));
    expect(dataLine1).toContain("5000.00"); // Price
    expect(dataLine1).toContain("32000.00"); // Net earnings

    // Second data row
    const dataLine2 = lines.find((l) => l.startsWith("Course Two"));
    expect(dataLine2).toContain("0.00"); // Price (free)
    expect(dataLine2).toContain("Draft");
  });
});