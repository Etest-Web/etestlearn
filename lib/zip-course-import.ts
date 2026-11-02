/**
 * Client-side analysis of a course-setup zip.
 *
 * Pure-ish: takes a File/Blob, returns drafts. No network, no Convex calls.
 * JSZip is a browser-capable library; it is imported lazily so this module
 * stays tree-shakeable and never runs during SSR.
 */

import JSZip from "jszip";

export type LessonContentType = "video" | "article" | "quiz" | "presentation";

export type QuizOptionDraft = { text: string; isCorrect: boolean };
export type QuizQuestionDraft = { prompt: string; options: QuizOptionDraft[] };
export type QuizDraft = { title: string; passingScore: number; questions: QuizQuestionDraft[] };

export type ZipLessonDraft = {
  tempId: string;
  title: string;
  contentType: LessonContentType;
  order: number;
  sourcePath: string;
  section?: string;
  fileBlob?: Blob;
  textContent?: string;
  quiz?: QuizDraft;
  needsInput: string[];
};

export type ZipAnalysis = {
  lessons: ZipLessonDraft[];
  warnings: string[];
};

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);
const ARTICLE_EXT = new Set(["md", "html", "htm", "txt"]);
const PRESENTATION_EXT = new Set(["pptx", "pdf"]);
const QUIZ_EXT = new Set(["json", "csv"]);

const NUM_PREFIX = /^(\d+)[_\-\s.]/;

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function titleFromPath(path: string): string {
  const name = baseName(path);
  const noExt = name.replace(/\.[^.]+$/, "");
  return noExt
    .replace(NUM_PREFIX, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function numericPrefix(path: string): number | null {
  const name = baseName(path);
  const noDir = name;
  const m = noDir.match(NUM_PREFIX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function isSkipped(path: string): boolean {
  if (path.endsWith("/")) return true; // directory entry
  const parts = path.split("/");
  if (parts.some((p) => p.startsWith(".") || p === "__MACOSX" || p === "Thumbs.db")) return true;
  if (path.includes("..")) return true; // zip-slip guard
  return false;
}

function parseCsvQuiz(text: string, title: string): QuizDraft | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  // simple CSV split (no quoted commas) — documented limitation
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  if (!header.includes("prompt")) return null;
  const optCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^option\d*$/.test(h) || h.startsWith("option"));
  const correctIdx = header.indexOf("correct");
  const questions: QuizQuestionDraft[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const prompt = (cols[header.indexOf("prompt")] ?? "").trim();
    if (!prompt) continue;
    const options: QuizOptionDraft[] = optCols
      .map(({ i: ci }) => ({ text: (cols[ci] ?? "").trim(), isCorrect: false }))
      .filter((o) => o.text.length > 0);
    if (options.length < 2) continue;
    if (correctIdx >= 0) {
      const ci = parseInt(cols[correctIdx], 10);
      if (Number.isFinite(ci) && ci >= 1 && ci <= options.length) {
        options[ci - 1].isCorrect = true;
      } else {
        options[0].isCorrect = true;
      }
    } else {
      options[0].isCorrect = true;
    }
    questions.push({ prompt, options });
  }
  if (questions.length === 0) return null;
  return { title, passingScore: 70, questions };
}

function parseJsonQuiz(text: string, title: string): QuizDraft | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const questionsRaw = Array.isArray(obj.questions) ? obj.questions : null;
  if (!questionsRaw) return null;
  const questions: QuizQuestionDraft[] = [];
  for (const q of questionsRaw) {
    if (!q || typeof q !== "object") continue;
    const qo = q as Record<string, unknown>;
    const prompt = typeof qo.prompt === "string" ? qo.prompt.trim() : "";
    if (!prompt) continue;
    const optsRaw = Array.isArray(qo.options) ? qo.options : [];
    const options: QuizOptionDraft[] = optsRaw
      .map((o) => {
        if (!o || typeof o !== "object") return null;
        const oo = o as Record<string, unknown>;
        const text = typeof oo.text === "string" ? oo.text.trim() : "";
        if (!text) return null;
        return { text, isCorrect: oo.isCorrect === true };
      })
      .filter((o): o is QuizOptionDraft => o !== null);
    if (options.length < 2) continue;
    if (!options.some((o) => o.isCorrect)) options[0].isCorrect = true;
    questions.push({ prompt, options });
  }
  if (questions.length === 0) return null;
  const passingScore =
    typeof obj.passingScore === "number" && Number.isFinite(obj.passingScore)
      ? Math.max(0, Math.min(100, Math.round(obj.passingScore)))
      : 70;
  const titleOut = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : title;
  return { title: titleOut, passingScore, questions };
}

export async function analyzeZip(file: Blob): Promise<ZipAnalysis> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.keys(zip.files)
    .filter((p) => !isSkipped(p))
    .map((p) => ({ path: p, obj: zip.files[p] }))
    .filter((e) => !e.obj.dir);

  const warnings: string[] = [];
  type Raw = { path: string; order: number | null; zipIndex: number };
  const raws: Raw[] = entries.map((e, i) => ({
    path: e.path,
    order: numericPrefix(e.path),
    zipIndex: i,
  }));

  const hasNumeric = raws.some((r) => r.order !== null);

  // sort
  const sorted = [...raws].sort((a, b) => {
    if (hasNumeric) {
      const ao = a.order ?? 9999;
      const bo = b.order ?? 9999;
      if (ao !== bo) return ao - bo;
    }
    return a.zipIndex - b.zipIndex;
  });

  const lessons: ZipLessonDraft[] = [];
  let idx = 0;
  for (const r of sorted) {
    const entry = zip.files[r.path];
    const e = extOf(r.path);
    const title = titleFromPath(r.path);
    const tempId = `draft-${idx}`;
    const section = r.path.includes("/")
      ? r.path.split("/")[0].replace(/[_-]+/g, " ").trim() || undefined
      : undefined;

    if (VIDEO_EXT.has(e)) {
      const blob = await entry.async("blob");
      lessons.push({
        tempId,
        title,
        contentType: "video",
        order: idx,
        sourcePath: r.path,
        section,
        fileBlob: blob,
        needsInput: title ? [] : ["title"],
      });
      idx++;
      continue;
    }

    if (PRESENTATION_EXT.has(e)) {
      const blob = await entry.async("blob");
      lessons.push({
        tempId,
        title,
        contentType: "presentation",
        order: idx,
        sourcePath: r.path,
        section,
        fileBlob: blob,
        needsInput: [],
      });
      idx++;
      continue;
    }

    if (ARTICLE_EXT.has(e)) {
      const text = await entry.async("text");
      lessons.push({
        tempId,
        title,
        contentType: "article",
        order: idx,
        sourcePath: r.path,
        section,
        textContent: text,
        needsInput: [],
      });
      idx++;
      continue;
    }

    if (QUIZ_EXT.has(e)) {
      const text = await entry.async("text");
      let quiz: QuizDraft | null = null;
      if (e === "json") {
        quiz = parseJsonQuiz(text, title);
      } else {
        quiz = parseCsvQuiz(text, title);
      }
      if (!quiz) {
        warnings.push(`Could not parse quiz file: ${r.path}`);
        continue;
      }
      const needsInput: string[] = [];
      if (quiz.passingScore === 70 && !text.includes("passingScore")) {
        // default applied; flag as needing confirmation
        needsInput.push("passingScore");
      }
      lessons.push({
        tempId,
        title: quiz.title,
        contentType: "quiz",
        order: idx,
        sourcePath: r.path,
        section,
        quiz,
        needsInput,
      });
      idx++;
      continue;
    }

    warnings.push(`Skipped unrecognized file: ${r.path}`);
  }

  // renumber order contiguously
  lessons.forEach((l, i) => (l.order = i));

  return { lessons, warnings };
}
