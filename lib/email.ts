import { DISPOSABLE_EMAIL_DOMAINS } from "./disposable-domains";

const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const LABEL_MAX_LENGTH = 63;

const DOMAIN_SUGGESTIONS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmal.com": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "ymail.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "aol.cm": "aol.com",
  "iclod.com": "icloud.com",
  "icloud.cm": "icloud.com",
  "protonmail.cm": "protonmail.com",
  "proton.me": "proton.me",
};

const LOCAL_PART_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_{|}~-]+$/;

function stripControlChars(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127 || (c >= 0x7f && c <= 0x9f)) continue;
    out += s[i];
  }
  return out;
}

export function normalizeEmail(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const stripped = stripControlChars(trimmed);
  return stripped.toLowerCase();
}

function isValidDomainLabel(label: string): boolean {
  if (!label || label.length > LABEL_MAX_LENGTH) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  // allow alphanumeric and hyphens
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    const code = ch.charCodeAt(0);
    const isLower = code >= 97 && code <= 122;
    const isUpper = code >= 65 && code <= 90;
    const isDigit = code >= 48 && code <= 57;
    const isHyphen = ch === "-";
    if (!isLower && !isUpper && !isDigit && !isHyphen) return false;
  }
  return true;
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email) return false;
  if (email.length > EMAIL_MAX_LENGTH) return false;
  if (email.includes(" ")) return false;
  // exactly one @
  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length < 1 || local.length > LOCAL_MAX_LENGTH) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return false;
  if (!LOCAL_PART_RE.test(local)) return false;
  // domain validation
  if (domain.includes(" ") || domain.startsWith(".") || domain.endsWith("."))
    return false;
  if (domain.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (tld.length < 2) return false;
  for (let i = 0; i < labels.length; i++) {
    if (!isValidDomainLabel(labels[i])) return false;
  }
  // reject IP literals like [127.0.0.1]
  if (domain.startsWith("[") && domain.endsWith("]")) return false;
  return true;
}

export function validateEmail(
  raw: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(raw);
  if (!email) {
    return { ok: false, error: "Please provide a valid email address." };
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: "Email address is too long." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "Please provide a valid email address." };
  }
  return { ok: true, email };
}

export function getEmailDomain(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return null;
  const [, domain] = email.split("@");
  return domain || null;
}

export function suggestEmailDomain(raw: string): string | null {
  const domain = getEmailDomain(raw);
  if (!domain) return null;
  if (DOMAIN_SUGGESTIONS[domain]) {
    return DOMAIN_SUGGESTIONS[domain];
  }
  return null;
}

export function isDisposableEmail(raw: string): boolean {
  const domain = getEmailDomain(raw);
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
