import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider selection and the send path. The interesting cases are the ones
 * that fail silently if written carelessly: a half-set-up Resend key, and an
 * API error returned in a 200 response body.
 */

const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const smtpSendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: smtpSendMail }),
  },
}));

const { activeMailProvider, isMailConfigured, isResendConfigured, sendMail } =
  await import("@/lib/mail");

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "MAIL_FROM_COURSES",
  "MAIL_FROM_BILLING",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  resendSend.mockReset();
  smtpSendMail.mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const RESEND_ENV = {
  RESEND_API_KEY: "re_test",
  RESEND_FROM: "Glypha Learn <no-reply@glypha.com.ng>",
};

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user",
  SMTP_PASS: "pass",
};

const MESSAGE = {
  group: "courses",
  to: "learner@example.com",
  subject: "Your certificate",
  text: "plain",
  html: "<p>html</p>",
} as const;

describe("mail provider selection", () => {
  it("reports nothing configured when the environment is empty", () => {
    expect(activeMailProvider()).toBeNull();
    expect(isMailConfigured()).toBe(false);
  });

  it("prefers Resend when it is fully configured", () => {
    Object.assign(process.env, RESEND_ENV, SMTP_ENV);

    expect(activeMailProvider()).toBe("resend");
    expect(isMailConfigured()).toBe(true);
  });

  it("uses SMTP alone when Resend is absent", () => {
    Object.assign(process.env, SMTP_ENV);

    expect(activeMailProvider()).toBe("smtp");
    expect(isResendConfigured()).toBe(false);
  });

  it("treats a Resend key with no sender as not configured", () => {
    process.env.RESEND_API_KEY = "re_test";

    // Otherwise the notify route would pass its gate and every send would throw.
    expect(isResendConfigured()).toBe(false);
    expect(activeMailProvider()).toBeNull();
  });

  it("falls back to SMTP when Resend is only half configured", () => {
    process.env.RESEND_API_KEY = "re_test";
    Object.assign(process.env, SMTP_ENV);

    expect(activeMailProvider()).toBe("smtp");
  });
});

describe("sendMail", () => {
  it("throws when no provider is configured", async () => {
    await expect(sendMail(MESSAGE)).rejects.toThrow(/No mail provider/);
    expect(resendSend).not.toHaveBeenCalled();
    expect(smtpSendMail).not.toHaveBeenCalled();
  });

  it("sends through Resend, forwarding replyTo", async () => {
    Object.assign(process.env, RESEND_ENV);
    resendSend.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    await sendMail({ ...MESSAGE, replyTo: "applicant@example.com" });

    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(resendSend).toHaveBeenCalledWith({
      from: RESEND_ENV.RESEND_FROM,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
      replyTo: "applicant@example.com",
    });
    expect(smtpSendMail).not.toHaveBeenCalled();
  });

  it("omits replyTo when the caller did not set one", async () => {
    Object.assign(process.env, RESEND_ENV);
    resendSend.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    await sendMail(MESSAGE);

    expect(resendSend.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("throws when Resend reports an error in a successful response", async () => {
    Object.assign(process.env, RESEND_ENV);
    // Resend resolves with an error body rather than throwing, so an
    // unchecked call would look delivered to the caller.
    resendSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid `to` address", name: "validation_error" },
    });

    await expect(sendMail(MESSAGE)).rejects.toThrow(/validation_error/);
  });

  it("sends through SMTP when Resend is not configured", async () => {
    Object.assign(process.env, SMTP_ENV, { SMTP_FROM: "Glypha <mail@glypha.com.ng>" });
    smtpSendMail.mockResolvedValueOnce(undefined);

    await sendMail(MESSAGE);

    expect(smtpSendMail).toHaveBeenCalledTimes(1);
    expect(smtpSendMail).toHaveBeenCalledWith({
      // No per-group address set, so it falls back to the global SMTP_FROM.
      // `group` is our routing concept, not an SMTP field, so it is not passed on.
      from: "Glypha <mail@glypha.com.ng>",
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("prefers the per-group address over the global default", async () => {
    Object.assign(process.env, RESEND_ENV, {
      MAIL_FROM_COURSES: "Glypha Courses <courses@glypha.com.ng>",
    });
    resendSend.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    await sendMail(MESSAGE);

    expect(resendSend.mock.calls[0][0].from).toBe(
      "Glypha Courses <courses@glypha.com.ng>",
    );
  });

  it("uses the address belonging to the group it was sent as", async () => {
    Object.assign(process.env, RESEND_ENV, {
      MAIL_FROM_COURSES: "Glypha Courses <courses@glypha.com.ng>",
      MAIL_FROM_BILLING: "Glypha Billing <billing@glypha.com.ng>",
    });
    resendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    await sendMail(MESSAGE);
    await sendMail({ ...MESSAGE, group: "billing" });

    expect(resendSend.mock.calls[0][0].from).toBe(
      "Glypha Courses <courses@glypha.com.ng>",
    );
    expect(resendSend.mock.calls[1][0].from).toBe(
      "Glypha Billing <billing@glypha.com.ng>",
    );
  });
});