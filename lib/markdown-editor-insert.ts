export type MarkdownEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): MarkdownEdit {
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  return {
    value: value.slice(0, start) + before + inner + after + value.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + inner.length,
  };
}

export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string | ((lineIndex: number) => string),
): MarkdownEdit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const prefixes = lines.map((_, index) =>
    typeof prefix === "function" ? prefix(index) : prefix,
  );
  const replaced = lines.map((line, index) => prefixes[index] + line).join("\n");
  const endLineIndex = value.slice(lineStart, end).split("\n").length - 1;
  const addedBeforeEnd = prefixes
    .slice(0, endLineIndex + 1)
    .reduce((total, item) => total + item.length, 0);

  return {
    value: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
    selectionStart: start + prefixes[0].length,
    selectionEnd: end + addedBeforeEnd,
  };
}

export function insertImage(
  value: string,
  start: number,
  end: number,
  url: string,
  alt = "image",
): MarkdownEdit {
  const markdown = `![${alt}](${url})`;
  return {
    value: value.slice(0, start) + markdown + value.slice(end),
    selectionStart: start + 2,
    selectionEnd: start + 2 + alt.length,
  };
}
