/**
 * Course "style" — a label-only grouping the instructor picks at course
 * creation (e.g. a course delivered as Presentations/PPTX rather than
 * video or articles). It does NOT restrict lesson content types; lessons
 * may still be any type. Kept as one list so the create and edit forms
 * cannot drift apart.
 */
export const COURSE_STYLES = [
  { value: "presentations", label: "Presentations (PPTX)" },
  { value: "video", label: "Video" },
  { value: "articles", label: "Articles" },
  { value: "mixed", label: "Mixed" },
] as const;