import { describe, expect, test } from "vitest";
import { insertImage, prefixLines, wrapSelection } from "./markdown-editor-insert";

describe("markdown editor inserts", () => {
  test("wrapSelection keeps the selected text and selects it again", () => {
    expect(wrapSelection("hello world", 6, 11, "**", "**", "bold text")).toEqual({
      value: "hello **world**",
      selectionStart: 8,
      selectionEnd: 13,
    });
  });

  test("wrapSelection selects the placeholder when nothing is selected", () => {
    expect(wrapSelection("ab", 1, 1, "*", "*", "italic")).toEqual({
      value: "a*italic*b",
      selectionStart: 2,
      selectionEnd: 8,
    });
  });

  test("prefixLines numbers every touched line and shifts the selection", () => {
    expect(prefixLines("one\ntwo", 0, 7, (index) => `${index + 1}. `)).toEqual({
      value: "1. one\n2. two",
      selectionStart: 3,
      selectionEnd: 13,
    });
  });

  test("prefixLines adds a heading to an empty document", () => {
    expect(prefixLines("", 0, 0, "## ")).toEqual({
      value: "## ",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  test("insertImage leaves the alt text selected for typing", () => {
    expect(insertImage("hi", 1, 1, "https://cdn.example/i.png", "alt")).toEqual({
      value: "h![alt](https://cdn.example/i.png)i",
      selectionStart: 3,
      selectionEnd: 6,
    });
  });
});
