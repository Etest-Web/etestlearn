/**
 * Analytics export — the instructor console as a spreadsheet.
 *
 * The page already computes everything; this module only shapes the data for a
 * CSV download. The instructor's next step is a spreadsheet or an accountant,
 * and both speak CSV.
 *
 * Two deliberate choices worth knowing before changing anything:
 *
 * 1. **No formula-injection guard.** The only text fields are the instructor's
 *    own course titles and category/level values — all authored by the person
 *    opening the file. Learner-supplied text (reviews, discussion posts) is not
 *    exported here. If a future export includes learner content, add a guard
 *    that prefixes `'=+@-` with a single quote and document it here.
 * 2. **The at-risk learner list is omitted.** The pulse caps it at the 8 most
 *    stalled learners for display; exporting a capped list would look complete
 *    in a spreadsheet and could mislead an instructor into thinking everyone
 *    else is fine. The summary block carries the total count instead.
 *
 * These types mirror the return shapes of `convex/instructorStats.ts`
 * (`getInstructorPulse` and `listInstructorCoursePerformance`). They are
 * declared here rather than imported because Convex's generated types only
 * expose function references, not their return shapes.
 */
interface InstructorPulse {
  courses: number;
  publishedCourses: number;
  draftCourses: number;
  lessons: number;
  quizCount: number;
  learners: {
    enrolled: number;
    activeThisWeek: number;
    newThisMonth: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    averageProgress: number;
    completionRate: number;
  };
  quizPerformance: {
    attemptedBy: number;
    passedBy: number;
    passRate: number | null;
    passRateByCourse: {
      courseId: string;
      courseTitle: string;
      attemptedBy: number;
      passedBy: number;
      passRate: number | null;
    }[];
  };
  certificates: {
    issued: number;
    revoked: number;
    active: number;
    issuedThisMonth: number;
  };
  engagement: { lessonsCompleted7d: number; lessonsCompleted30d: number };
  atRisk: {
    userId: string;
    learnerName: string | null;
    courseId: string;
    courseTitle: string;
    progressPercent: number;
    lastActiveAt: number;
  }[];
  atRiskCount: number;
}

interface InstructorCoursePerformanceRow {
  courseId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  category: string | null;
  level: string | null;
  published: boolean;
  price: number | undefined;
  currency: string;
  createdAt: number;
  lessons: number;
  enrollmentCount: number;
  activeLearners: number;
  completedCount: number;
  completionRate: number;
  averageProgress: number;
  sales: number;
  grossKobo: number;
  refundedKobo: number;
  netEarningsKobo: number;
  averageOrderKobo: number;
  conversionRate: number;
  certificateCount: number;
  revokedCertificateCount: number;
}

/** RFC 4180: quote a field when it contains a comma, a quote, or a newline. */
export function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return escapeCsvField(value);
}

export function csvRows(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function nairaFromKobo(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined) return "";
  const naira = Math.abs(kobo) / 100;
  const sign = kobo < 0 ? "-" : "";
  return sign + naira.toFixed(2);
}

/** UTC date for a stable, timezone-independent filename. */
export function analyticsFilename(now: number = Date.now()): string {
  const date = new Date(now);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `glypha-analytics-${yyyy}-${mm}-${dd}.csv`;
}

export function buildAnalyticsExport(input: {
  pulse: InstructorPulse;
  performance: InstructorCoursePerformanceRow[];
}): { filename: string; content: string } {
  const { pulse, performance } = input;
  const filename = analyticsFilename();
  const now = Date.now();

  // BOM so Excel opens the UTF-8 file without mojibake on the em-dash in the title.
  const BOM = "\uFEFF";

  const rows: (string | number | null | undefined)[][] = [];

  // ── Title & metadata ─────────────────────────────────────────────────────
  rows.push(["Glypha Learn — instructor analytics"]);
  rows.push(["Generated", new Date(now).toISOString().split("T")[0]]);
  rows.push(["Currency", "NGN"]);
  rows.push([]);

  // ── Summary ──────────────────────────────────────────────────────────────
  rows.push(["Summary"]);
  rows.push(["Metric", "Value"]);
  rows.push(["Courses", pulse.courses]);
  rows.push(["Published", pulse.publishedCourses]);
  rows.push(["Drafts", pulse.draftCourses]);
  rows.push(["Lessons", pulse.lessons]);
  rows.push(["Quizzes", pulse.quizCount]);
  rows.push(["Enrolled learners", pulse.learners.enrolled]);
  rows.push(["Active this week", pulse.learners.activeThisWeek]);
  rows.push(["New this month", pulse.learners.newThisMonth]);
  rows.push(["Completed", pulse.learners.completed]);
  rows.push(["In progress", pulse.learners.inProgress]);
  rows.push(["Not started", pulse.learners.notStarted]);
  rows.push(["Average progress (%)", pulse.learners.averageProgress]);
  rows.push(["Completion rate (%)", pulse.learners.completionRate]);
  rows.push([
    "Quiz pass rate (%)",
    pulse.quizPerformance.passRate ?? "",
  ]);
  rows.push(["Certificates issued", pulse.certificates.issued]);
  rows.push(["Certificates revoked", pulse.certificates.revoked]);
  rows.push(["Certificates active", pulse.certificates.active]);
  rows.push(["Certificates this month", pulse.certificates.issuedThisMonth]);
  rows.push(["Lessons completed (7d)", pulse.engagement.lessonsCompleted7d]);
  rows.push(["Lessons completed (30d)", pulse.engagement.lessonsCompleted30d]);
  rows.push(["At-risk learners (total)", pulse.atRiskCount]);
  rows.push([]);

  // ── Per-course performance ──────────────────────────────────────────────
  rows.push(["Per-course performance"]);
  rows.push([
    "Course",
    "Slug",
    "Status",
    "Category",
    "Level",
    "Price (NGN)",
    "Currency",
    "Lessons",
    "Learners",
    "Active (30d)",
    "Completed",
    "Completion (%)",
    "Average progress (%)",
    "Sales",
    "Gross (NGN)",
    "Refunded (NGN)",
    "Net earnings (NGN)",
    "Average order (NGN)",
    "Certificates",
    "Revoked certificates",
    "Conversion (learners/published month)",
    "Created",
  ]);

  for (const row of performance) {
    const status = row.published ? "Published" : "Draft";
    const priceNaira = nairaFromKobo(row.price);
    rows.push([
      row.title,
      row.slug,
      status,
      row.category ?? "",
      row.level ?? "",
      priceNaira,
      row.currency,
      row.lessons,
      row.enrollmentCount,
      row.activeLearners,
      row.completedCount,
      row.completionRate,
      row.averageProgress,
      row.sales,
      nairaFromKobo(row.grossKobo),
      nairaFromKobo(row.refundedKobo),
      nairaFromKobo(row.netEarningsKobo),
      nairaFromKobo(row.averageOrderKobo),
      row.certificateCount,
      row.revokedCertificateCount,
      row.conversionRate,
      new Date(row.createdAt).toISOString().split("T")[0],
    ]);
  }

  const content = BOM + csvRows(rows);
  return { filename, content };
}