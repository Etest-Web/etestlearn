import { escapeHtml } from "../mail";

/**
 * The email design system. Every template builds on these pieces so a receipt
 * and a reminder read as the same product.
 *
 * Constraints that shaped it, because email HTML is not app HTML:
 *
 * - **Inline styles only.** Gmail and Outlook discard `<style>` blocks in the
 *   places it matters most, so each element carries its own declarations.
 * - **Tables for layout.** Flexbox and grid are not in Outlook's engine.
 * - **A preheader.** The first visible words after the subject become the inbox
 *   preview, so the preview is written deliberately instead of being whatever
 *   the greeting happens to be.
 * - **Dark mode is left to the client.** `color-scheme` tells Apple Mail and
 *   Outlook to invert the chrome; forcing a light background fights that and
 *   ends up as a white card on a grey page in some clients and unreadable dark
 *   text in others.
 * - **Underline on links.** Clients strip link styling more often than any
 *   other, and colour alone is not an accessible signal.
 *
 * Palette values are flattened from the oklch tokens in `app/globals.css`,
 * because oklch has patchy support in mail clients and a dropped colour on a
 * button means an invisible button.
 */

const BRAND = "#945DA3";
const BRAND_INK = "#6C3C78";
const INK = "#1F1B1D";
const MUTED = "#6B6570";
const BORDER = "#E8E3E9";
const SURFACE = "#F7F5F8";
const SUCCESS = "#2F7D52";

const WIDTH = 600;

type Action = { label: string; href: string };

export type EmailLayoutOptions = {
  /** Inbox preview line. Shown by clients that support it, invisible otherwise. */
  preheader: string;
  /** Small label above the heading. Use for the category, e.g. "Enrollment". */
  eyebrow?: string;
  heading: string;
  /** Paragraphs and panels. Already escaped or built from trusted parts. */
  body: string;
  /** The one action we want taken. Rendered as a filled button. */
  action?: Action;
  /** A fallback link, shown under the button. Useful when a URL is long. */
  actionFallbackLink?: boolean;
  /** Lower-emphasis actions. Rendered as plain links on their own row. */
  secondaryActions?: Action[];
  /** Grey note above the legal footer. e.g. "Why you're getting this." */
  footnote?: string;
  /** Rendered only for broadcast and nudge mail, never for a receipt. */
  unsubscribeUrl?: string;
  /** Physical address. Bulk senders are expected to show one. */
  address?: string;
};

/**
 * Primary button.
 *
 * A padded anchor rather than a styled `<div>`, because Outlook only
 * backgrounds an element it recognises as a link. `role="button"` keeps
 * assistive tech announcing it as one.
 */
export function emailButton({ label, href }: Action): string {
  const safeHref = escapeHtml(href);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">` +
    `<tr><td align="center" bgcolor="${BRAND}" style="border-radius:12px;background-color:${BRAND};">` +
    `<a href="${safeHref}" role="button" ` +
    `style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `font-size:15px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:12px;background-color:${BRAND};">` +
    `${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

/** Text link with the underline clients like to forget. */
export function emailLink(label: string, href: string): string {
  return (
    `<a href="${escapeHtml(href)}" ` +
    `style="color:${BRAND_INK};text-decoration:underline;font-weight:600;">` +
    `${escapeHtml(label)}</a>`
  );
}

/** Bordered box for values worth isolating: an amount, a date, a reference. */
export function emailPanel(inner: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;background:${SURFACE};border:1px solid ${BORDER};border-radius:14px;margin:22px 0;">` +
    `<tr><td style="padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `font-size:15px;line-height:1.6;color:${INK};">${inner}</td></tr></table>`
  );
}

/** Label on the left, value on the right. Used for receipts and summaries. */
export function emailKeyValueRows(
  rows: Array<[label: string, value: string]>,
): string {
  const cells = rows
    .map(
      ([label, value], i) =>
        `<tr>` +
        `<td style="padding:9px 0;${i > 0 ? "border-top:1px solid " + BORDER + ";" : ""}` +
        `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;` +
        `color:${MUTED};">${escapeHtml(label)}</td>` +
        `<td align="right" style="padding:9px 0;${i > 0 ? "border-top:1px solid " + BORDER + ";" : ""}` +
        `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;` +
        `font-weight:600;color:${INK};text-align:right;">${escapeHtml(value)}</td>` +
        `</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`;
}

/**
 * A progress readout. The bar is two nested tables with fixed pixel widths,
 * because a percentage width is the one thing every client computes
 * differently. The number is printed next to it so the bar is never the only
 * source of the value.
 */
export function emailProgressBar(percent: number, caption?: string): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((WIDTH - 40) * (clamped / 100));

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">` +
    `<tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;` +
    `color:${MUTED};padding-bottom:8px;">` +
    `${escapeHtml(caption ?? `${clamped}% complete`)}` +
    `<span style="float:right;font-weight:600;color:${INK};">${clamped}%</span></td></tr>` +
    `<tr><td style="background:${BORDER};border-radius:999px;font-size:0;line-height:0;">` +
    `<div style="height:8px;line-height:8px;font-size:0;">` +
    `<div style="width:${filled}px;background:${BRAND};border-radius:999px;font-size:0;line-height:0;">` +
    `&#8203;</div></div></td></tr></table>`
  );
}

/** Numbered or bulleted list. `items` are escaped. */
export function emailList(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td valign="top" style="padding:5px 12px 5px 0;color:${BRAND};font-weight:700;">&bull;</td>` +
        `<td valign="top" style="padding:5px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
        `font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(item)}</td></tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

export function emailParagraph(text: string): string {
  return (
    `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `font-size:15px;line-height:1.65;color:${INK};">${text}</p>`
  );
}

/** Text with a brand-coloured emphasis, for names and course titles. */
export function emailStrong(text: string): string {
  return `<strong style="color:${INK};font-weight:600;">${escapeHtml(text)}</strong>`;
}

export function emailMuted(text: string): string {
  return `<span style="color:${MUTED};">${escapeHtml(text)}</span>`;
}

/** Small caps-ish label used for serials, references and other reference data. */
export function emailReference(label: string, value: string): string {
  return (
    `<p style="margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `font-size:13px;color:${MUTED};">${escapeHtml(label)} ` +
    `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${INK};">${escapeHtml(value)}</span></p>`
  );
}

/** A green-tinted confirmation strip, used where something is genuinely good news. */
export function emailSuccessNote(text: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;background:#EEF7F1;border-left:3px solid ${SUCCESS};border-radius:10px;margin:22px 0;">` +
    `<tr><td style="padding:14px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
    `font-size:14px;line-height:1.6;color:${SUCCESS};">${text}</td></tr></table>`
  );
}

/** Wraps body content in the full document. */
export function emailLayout(options: EmailLayoutOptions): string {
  const {
    preheader,
    eyebrow,
    heading,
    body,
    action,
    actionFallbackLink,
    secondaryActions,
    footnote,
    unsubscribeUrl,
    address,
  } = options;

  const secondary = (secondaryActions ?? []).length
    ? `<tr><td style="padding:20px 32px 0;text-align:center;">` +
      (secondaryActions ?? [])
        .map(
          (a) =>
            emailLink(a.label, a.href) +
            (secondaryActions!.indexOf(a) < secondaryActions!.length - 1
              ? `<span style="color:${BORDER};">&nbsp;&nbsp;&bull;&nbsp;&nbsp;</span>`
              : ""),
        )
        .join("") +
      `</td></tr>`
    : "";

  const fallback =
    action && actionFallbackLink
      ? `<tr><td style="padding:14px 32px 0;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;` +
        `font-size:12px;color:${MUTED};word-break:break-all;">${escapeHtml(action.href)}</td></tr>`
      : "";

  const footnoteBlock = footnote
    ? `<tr><td style="padding:24px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
      `font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(footnote)}</td></tr>`
    : "";

  const addressBlock = address
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">${escapeHtml(address)}</p>`
    : "";

  const unsubscribeBlock = unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">` +
      `You are getting this because you have a Glypha Learn account. ` +
      `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Turn these emails off</a>.` +
      `</p>`
    : "";

  return (
    `<!doctype html>` +
    `<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(heading)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${SURFACE};">` +
    // Preheader: hidden by every client that knows how, and the reason a
    // client that does not know how still shows the right words.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` +
    `<div style="display:none;max-height:0;overflow:hidden;">&#847;&zwnj;&nbsp;` +
    `&#847;&zwnj;&nbsp;`.repeat(40) +
    `</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;background:${SURFACE};">` +
    // Top brand accent bar
    `<tr><td style="height:4px;background:${BRAND};"></td></tr>` +
    `<tr><td align="center" style="padding:28px 16px;">` +

    `<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:${WIDTH}px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:18px;box-shadow:0 2px 8px rgba(31,27,29,0.06);">` +

    // Logo + wordmark. The SVG is inline so it works without external requests.
    `<tr><td style="padding:26px 32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">` +
    `<div style="display:inline-block;vertical-align:middle;">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" style="vertical-align:middle;">` +
    `<rect x="0" y="0" width="40" height="40" rx="8" fill="${BRAND}"/>` +
    `<path d="M22 10c6.5 0 11 4.2 11 10.5S28.5 31 22 31s-11-4.2-11-10.5S15.5 10 22 10z" fill="#FFFFFF"/>` +
    `<path d="M14 12v14h8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `</svg>` +
    `</div>` +
    `<span style="font-size:18px;font-weight:600;letter-spacing:-0.005em;color:${BRAND};"> Glypha Learn</span>` +
    `</td></tr>` +

    (eyebrow
      ? `<tr><td style="padding:22px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
        `font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">` +
        `${escapeHtml(eyebrow)}</td></tr>`
      : "") +

    `<tr><td style="padding:${eyebrow ? "8px 32px 0" : "26px 32px 0"};` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">` +
    `<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.015em;color:${INK};">` +
    `${escapeHtml(heading)}</h1></td></tr>` +

    `<tr><td style="padding:16px 32px 0;">${body}</td></tr>` +

    (action
      ? `<tr><td style="padding:26px 32px 0;" align="left">${emailButton(action)}</td></tr>${fallback}`
      : "") +
    secondary +

    `<tr><td style="padding:28px 32px 0;"><div style="height:1px;background:${BORDER};font-size:0;line-height:0;">&#8203;</div></td></tr>` +
    footnoteBlock +
    `<tr><td style="padding:20px 32px 28px;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">` +
    `<p style="margin:0;">Glypha Learn</p>` +
    addressBlock +
    unsubscribeBlock +
    `</td></tr>` +

    `</table>` +

    `<tr><td style="padding:18px 32px 0;text-align:center;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${MUTED};">` +
    `Sent by Glypha Learn to ${""}` +
    `<a href="{{recipient_email}}" style="color:${MUTED};text-decoration:underline;">your account email</a>.` +
    `</td></tr>` +

    `</td></tr></table></div></body></html>`
  );
}