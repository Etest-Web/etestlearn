import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { analyzeZip } from "./zip-course-import";

async function makeZip(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return await zip.generateAsync({ type: "blob" });
}

describe("analyzeZip", () => {
  it("classifies by extension", async () => {
    const blob = await makeZip({
      "intro.md": "# Intro",
      "lesson2.mp4": new Uint8Array([1, 2, 3]),
      "deck.pptx": new Uint8Array([4, 5]),
      "quiz.json": JSON.stringify({
        title: "Q1",
        passingScore: 80,
        questions: [{ prompt: "2+2?", options: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: false }] }],
      }),
    });
    const res = await analyzeZip(blob);
    expect(res.lessons.map((l) => l.contentType)).toEqual(["article", "video", "presentation", "quiz"]);
    expect(res.warnings).toEqual([]);
  });

  it("sorts by numeric prefix", async () => {
    const blob = await makeZip({
      "03_third.md": "c",
      "01_first.md": "a",
      "02_second.md": "b",
    });
    const res = await analyzeZip(blob);
    expect(res.lessons.map((l) => l.title)).toEqual(["First", "Second", "Third"]);
  });

  it("skips hidden and macosx files", async () => {
    const blob = await makeZip({
      "a.md": "x",
      "__MACOSX/._a.md": "y",
      ".hidden": "z",
    });
    const res = await analyzeZip(blob);
    expect(res.lessons.length).toBe(1);
  });

  it("parses csv quiz", async () => {
    const csv = "prompt,option1,option2,correct\nWhat is 1+1?,2,3,1\n";
    const blob = await makeZip({ "q.csv": csv });
    const res = await analyzeZip(blob);
    expect(res.lessons[0].contentType).toBe("quiz");
    expect(res.lessons[0].quiz?.questions.length).toBe(1);
    expect(res.lessons[0].quiz?.questions[0].options[0].isCorrect).toBe(true);
  });

  it("warns on unparseable quiz", async () => {
    const blob = await makeZip({ "bad.json": "{not json" });
    const res = await analyzeZip(blob);
    expect(res.lessons.length).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("renumbers order contiguously", async () => {
    const blob = await makeZip({ "01_a.md": "a", "03_c.md": "c" });
    const res = await analyzeZip(blob);
    expect(res.lessons.map((l) => l.order)).toEqual([0, 1]);
  });
});
