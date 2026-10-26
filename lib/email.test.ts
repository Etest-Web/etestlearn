import { describe, expect, it } from "vitest";
import {
  getEmailDomain,
  isDisposableEmail,
  isValidEmail,
  normalizeEmail,
  suggestEmailDomain,
  validateEmail,
} from "./email";

describe("email validation", () => {
  it("normalizes by trimming, stripping control chars, lowercasing", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
    expect(normalizeEmail("test@example.com\r\nbcc:evil@test.com")).toBe(
      "test@example.combcc:evil@test.com",
    );
    expect(normalizeEmail("test@\x00example.com")).toBe("test@example.com");
  });

  it("validates common addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name+tag@example.co.uk")).toBe(true);
    expect(isValidEmail("user_name@example-domain.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects invalid forms", () => {
    expect(isValidEmail("a@.com")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@@example.com")).toBe(false);
    expect(isValidEmail("user example.com")).toBe(false);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("user@-example.com")).toBe(false);
    expect(isValidEmail("user@example-.com")).toBe(false);
    expect(isValidEmail("user@ex..ample.com")).toBe(false);
    expect(isValidEmail(".user@example.com")).toBe(false);
    expect(isValidEmail("user.@example.com")).toBe(false);
    expect(isValidEmail("user..name@example.com")).toBe(false);
  });

  it("rejects header injection payloads", () => {
    expect(isValidEmail("test@example.com\r\nbcc:attacker@evil.com")).toBe(
      false,
    );
    expect(isValidEmail("test@example.com\nCc:attacker@evil.com")).toBe(false);
  });

  it("enforces length limits", () => {
    const longLocal = "a".repeat(65) + "@example.com";
    expect(isValidEmail(longLocal)).toBe(false);
    const longTotal = "a".repeat(245) + "@example.com"; // > 254
    expect(isValidEmail(longTotal)).toBe(false);
  });

  it("validateEmail returns normalized email", () => {
    expect(validateEmail("  User@Example.COM  ")).toEqual({
      ok: true,
      email: "user@example.com",
    });
    expect(validateEmail("bad")).toEqual({
      ok: false,
      error: "Please provide a valid email address.",
    });
  });

  it("suggests common typos", () => {
    expect(suggestEmailDomain("user@gmial.com")).toBe("gmail.com");
    expect(suggestEmailDomain("user@yahooo.com")).toBe("yahoo.com");
    expect(suggestEmailDomain("user@hotmail.co")).toBe("hotmail.com");
    expect(suggestEmailDomain("user@gmail.com")).toBe(null);
  });

  it("detects disposable domains", () => {
    expect(isDisposableEmail("user@mailinator.com")).toBe(true);
    expect(isDisposableEmail("user@yopmail.com")).toBe(true);
    expect(isDisposableEmail("user@tempmail.org")).toBe(true);
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
  });

  it("getEmailDomain returns domain or null", () => {
    expect(getEmailDomain("user@example.com")).toBe("example.com");
    expect(getEmailDomain("bad")).toBe(null);
  });
});
