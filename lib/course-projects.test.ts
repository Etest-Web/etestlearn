import { describe, expect, test } from "vitest";
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_OUTCOME_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
  TECH_STACK_MAX_TAGS,
  normalizeOptionalText,
  normalizeTechStack,
  projectDraftError,
} from "./course-projects";

describe("normalizeTechStack", () => {
  test("trims each tag", () => {
    expect(normalizeTechStack(["  React  ", " Postgres"])).toEqual(["React", "Postgres"]);
  });

  test("drops blanks", () => {
    expect(normalizeTechStack(["React", "   ", "", "\n"])).toEqual(["React"]);
  });

  test("de-duplicates case-insensitively but keeps the first spelling", () => {
    // Flipping a badge to lowercase every time a list is saved twice would be a
    // visible, pointless change to the instructor's wording.
    expect(normalizeTechStack(["React", "react", "REACT"])).toEqual(["React"]);
  });

  test("caps the count", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tool-${i}`);
    expect(normalizeTechStack(many)).toHaveLength(TECH_STACK_MAX_TAGS);
  });

  test("truncates a single over-long tag rather than storing it whole", () => {
    const result = normalizeTechStack(["x".repeat(80)]);
    expect(result?.[0]).toHaveLength(30);
  });

  test("an all-blank list is absent rather than an empty array", () => {
    // "No stack listed" and "an empty stack" are the same fact; the row should
    // not carry the difference.
    expect(normalizeTechStack(["  ", ""])).toBeUndefined();
  });

  test("null and undefined are absent", () => {
    expect(normalizeTechStack(null)).toBeUndefined();
    expect(normalizeTechStack(undefined)).toBeUndefined();
  });
});

describe("normalizeOptionalText", () => {
  test("trims, and turns blank into absent", () => {
    expect(normalizeOptionalText("  a sentence ")).toBe("a sentence");
    expect(normalizeOptionalText("   ")).toBeUndefined();
    expect(normalizeOptionalText(null)).toBeUndefined();
    expect(normalizeOptionalText(undefined)).toBeUndefined();
  });
});

describe("projectDraftError", () => {
  const valid = { title: "A portfolio site", description: "A one-pager." };

  test("accepts a complete draft", () => {
    expect(projectDraftError(valid)).toBeNull();
  });

  test("a blank title is refused", () => {
    expect(projectDraftError({ ...valid, title: "   " })).toBe(
      "Give the project a title.",
    );
  });

  test("a blank description is refused", () => {
    expect(projectDraftError({ ...valid, description: "\n\t" })).toBe(
      "Describe what the learner will have built.",
    );
  });

  test("a title exactly at the cap is fine; one over is not", () => {
    expect(projectDraftError({ ...valid, title: "x".repeat(PROJECT_TITLE_MAX_LENGTH) })).toBeNull();
    expect(projectDraftError({ ...valid, title: "x".repeat(PROJECT_TITLE_MAX_LENGTH + 1) })).toBe(
      `Keep the title under ${PROJECT_TITLE_MAX_LENGTH} characters.`,
    );
  });

  test("a description exactly at the cap is fine; one over is not", () => {
    expect(
      projectDraftError({ ...valid, description: "x".repeat(PROJECT_DESCRIPTION_MAX_LENGTH) }),
    ).toBeNull();
    expect(
      projectDraftError({ ...valid, description: "x".repeat(PROJECT_DESCRIPTION_MAX_LENGTH + 1) }),
    ).toBe(`Keep the description under ${PROJECT_DESCRIPTION_MAX_LENGTH} characters.`);
  });

  test("outcome is optional, but capped when present", () => {
    expect(projectDraftError({ ...valid, outcome: undefined })).toBeNull();
    expect(projectDraftError({ ...valid, outcome: "" })).toBeNull();
    expect(
      projectDraftError({ ...valid, outcome: "x".repeat(PROJECT_OUTCOME_MAX_LENGTH) }),
    ).toBeNull();
    expect(
      projectDraftError({ ...valid, outcome: "x".repeat(PROJECT_OUTCOME_MAX_LENGTH + 1) }),
    ).toBe(`Keep the outcome under ${PROJECT_OUTCOME_MAX_LENGTH} characters.`);
  });

  test("an over-long outcome is measured after trimming, so padding does not save it", () => {
    expect(
      projectDraftError({
        ...valid,
        outcome: `  ${"x".repeat(PROJECT_OUTCOME_MAX_LENGTH + 1)}  `,
      }),
    ).toBe(`Keep the outcome under ${PROJECT_OUTCOME_MAX_LENGTH} characters.`);
  });

  test("reports the title before the description, so a blank form reads top-down", () => {
    expect(projectDraftError({ title: "", description: "" })).toBe(
      "Give the project a title.",
    );
  });
});