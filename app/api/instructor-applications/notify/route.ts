import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type InstructorApplicationPayload = {
  fullName: string;
  email: string;
  expertise: string;
  bio: string;
  portfolioUrl?: string;
  motivation: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function POST(request: Request) {
  const destinationEmail = process.env.INSTRUCTOR_APPLICATION_EMAIL;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!destinationEmail) {
    return NextResponse.json(
      { error: "INSTRUCTOR_APPLICATION_EMAIL is not set." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const application: InstructorApplicationPayload = {
    fullName:
      typeof data.fullName === "string" ? data.fullName.trim() : "",
    email: typeof data.email === "string" ? data.email.trim() : "",
    expertise:
      typeof data.expertise === "string" ? data.expertise.trim() : "",
    bio: typeof data.bio === "string" ? data.bio.trim() : "",
    portfolioUrl:
      typeof data.portfolioUrl === "string" && data.portfolioUrl.trim()
        ? data.portfolioUrl.trim()
        : undefined,
    motivation:
      typeof data.motivation === "string" ? data.motivation.trim() : "",
  };

  if (
    !application.fullName ||
    !application.email ||
    !application.expertise ||
    !application.bio ||
    !application.motivation
  ) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json(
      { error: "SMTP settings are not configured." },
      { status: 500 }
    );
  }

  const fields: Array<[string, string]> = [
    ["Full Name", application.fullName],
    ["Email", application.email],
    ["Expertise", application.expertise],
    ["Bio", application.bio],
    ["Portfolio / Website", application.portfolioUrl ?? "Not provided"],
    ["Motivation", application.motivation],
  ];

  const tableRows = fields
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 12px;border:1px solid #e5e7eb;">${escapeHtml(value)}</td>` +
        `</tr>`
    )
    .join("");

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || smtpUser,
      to: destinationEmail,
      replyTo: application.email,
      subject: `New Instructor Application — ${application.fullName}`,
      text: fields
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n"),
      html:
        `<p>A new instructor application was submitted on Etest Learning:</p>` +
        `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">${tableRows}</table>`,
    });
  } catch (error) {
    console.error(
      "Failed to send instructor application notification:",
      error
    );
    return NextResponse.json(
      { error: "Failed to send notification email." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
