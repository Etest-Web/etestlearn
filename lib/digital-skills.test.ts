import { describe, expect, it } from "vitest";
import {
  DIGITAL_SKILLS,
  DIGITAL_SKILL_CATEGORIES,
  findDigitalSkillInText,
  matchDigitalSkills,
} from "./digital-skills";

describe("digital-skills keyword file", () => {
  it("has no duplicate ids or labels", () => {
    const ids = DIGITAL_SKILLS.map((s) => s.id);
    const labels = DIGITAL_SKILLS.map((s) => s.label.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps keywords lowercase and slug ids kebab-case", () => {
    for (const skill of DIGITAL_SKILLS) {
      expect(skill.id).toMatch(/^[a-z0-9-]+$/);
      for (const keyword of skill.keywords) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });

  it("exposes the categories in outline order, unique", () => {
    expect(new Set(DIGITAL_SKILL_CATEGORIES).size).toBe(
      DIGITAL_SKILL_CATEGORIES.length,
    );
  });
});

describe("matchDigitalSkills", () => {
  it("exact label match ranks first", () => {
    const hits = matchDigitalSkills("Data Analysis");
    expect(hits[0]?.skill.label).toBe("Data Analysis");
    expect(hits[0]?.rank).toBe(0);
  });

  it("alias expansion resolves abbreviations to canonical labels", () => {
    expect(matchDigitalSkills("powerbi")[0]?.skill.label).toBe("Power BI");
    expect(matchDigitalSkills("ga4")[0]?.skill.label).toBe("Google Analytics");
    expect(matchDigitalSkills("k8s")[0]?.skill.label).toBe("Kubernetes");
  });

  it("returns nothing for empty input", () => {
    expect(matchDigitalSkills("   ")).toEqual([]);
  });
});

describe("findDigitalSkillInText", () => {
  it("finds a skill inside a natural-language message", () => {
    expect(findDigitalSkillInText("show me data analysis courses")?.label).toBe(
      "Data Analysis",
    );
    expect(
      findDigitalSkillInText("I want to learn machine learning please")?.label,
    ).toBe("Machine Learning");
  });

  it("prefers the most specific match over a short alias", () => {
    expect(findDigitalSkillInText("teach me power bi today")?.label).toBe(
      "Power BI",
    );
  });

  it("matches sigil aliases with non-word edges", () => {
    expect(findDigitalSkillInText("i want to learn c++ programming")).toBeNull();
    expect(findDigitalSkillInText("resources for pentesting")?.label).toBe(
      "Ethical Hacking",
    );
  });

  it("does not match fragments inside other words", () => {
    // "ai" must not fire inside "said" or "again"
    expect(findDigitalSkillInText("well said, again")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findDigitalSkillInText("how do i reset my password")).toBeNull();
  });
});
