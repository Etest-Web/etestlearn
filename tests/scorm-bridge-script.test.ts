import { describe, it, expect } from "vitest";
import { injectScormBridge, scormBridgeSource } from "../lib/scorm/bridge-script";

const SRC = "/*bridge*/";

describe("injectScormBridge", () => {
  it("injects right after <head> when present", () => {
    const out = injectScormBridge("<html><head><title>x</title></head><body></body></html>", SRC);
    expect(out).toContain(`<head><script data-glypha-scorm="bridge">${SRC}</script>`);
  });

  it("falls back to <html> when there is no head", () => {
    const out = injectScormBridge("<html><body>hi</body></html>", SRC);
    expect(out).toContain(`<html><script data-glypha-scorm="bridge">${SRC}</script>`);
  });

  it("prefixes the document when there is neither", () => {
    const out = injectScormBridge("plain text", SRC);
    expect(out.startsWith(`<script data-glypha-scorm="bridge">${SRC}</script>`)).toBe(true);
  });

  it("default source is a self-invoking function", () => {
    const src = scormBridgeSource();
    expect(src.startsWith("(")).toBe(true);
    expect(src.endsWith(")();")).toBe(true);
  });
});