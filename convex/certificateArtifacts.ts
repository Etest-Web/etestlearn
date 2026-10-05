"use node";

/**
 * PDF rendering and certificate email. Both are node-runtime work, so they live
 * in a `"use node"` action instead of the issuing mutation: a failed render or
 * SMTP outage must never roll back an issued certificate, and must not block
 * the learner from seeing it.
 */
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { renderCertificatePdf } from "../lib/certificate-pdf";
import {
  button,
  emailShell,
  escapeHtml,
  isSmtpConfigured,
  sendMail,
  siteUrl,
} from "../lib/mail";
import { formatCertificateDate } from "../lib/certificates";

export const issueCertificateArtifacts = internalAction({
  args: {
    certificateId: v.id("certificates"),
    serial: v.string(),
    holderName: v.string(),
    holderEmail: v.optional(v.string()),
    courseTitle: v.string(),
    issuerName: v.string(),
    issuedAt: v.number(),
    templateId: v.optional(v.id("certificateTemplates")),
  },
  handler: async (ctx, args) => {
    const verifyUrl = `${siteUrl()}/verify/${encodeURIComponent(args.serial)}`;

    try {
      // The certificate records the template it was issued against. Template
      // ids are stable (uploads patch the one row in place), so the only way
      // this check fails is the design being removed in the moment between
      // issuance and render — and plain artwork is the honest answer there.
      let templateBytes: Uint8Array | undefined;
      let layout = undefined;

      if (args.templateId) {
        const template = await ctx.runQuery(
          internal.certificateTemplates.getActiveTemplate,
          {},
        );
        if (template && template._id === args.templateId) {
          layout = template.layout ?? undefined;
          const blob = await ctx.storage.get(template.storageId);
          if (blob) templateBytes = new Uint8Array(await blob.arrayBuffer());
        }
      }

      const bytes = await renderCertificatePdf(
        {
          serial: args.serial,
          holderName: args.holderName,
          courseTitle: args.courseTitle,
          issuerName: args.issuerName,
          issuedAt: args.issuedAt,
          verifyUrl,
        },
        { templateBytes, layout },
      );
      const storageId = await ctx.storage.store(
        new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
      );
      await ctx.runMutation(internal.certificates.recordPdfArtifact, {
        certificateId: args.certificateId,
        pdfStorageId: storageId,
      });
    } catch (error) {
      console.error("Failed to render certificate PDF:", error);
    }

    if (!args.holderEmail) return;
    if (!isSmtpConfigured()) {
      console.warn(
        "SMTP is not configured — skipping certificate email for",
        args.holderEmail,
      );
      return;
    }

    try {
      await sendMail({
        to: args.holderEmail,
        subject: `Your certificate for ${args.courseTitle}`,
        text: [
          `Congratulations ${args.holderName},`,
          ``,
          `You completed ${args.courseTitle} on Glypha Learn.`,
          `Certificate ID: ${args.serial}`,
          `Completed on: ${formatCertificateDate(args.issuedAt)}`,
          ``,
          `View and verify your certificate: ${verifyUrl}`,
        ].join("\n"),
        html: emailShell(
          `<p>Congratulations ${escapeHtml(args.holderName)},</p>` +
            `<p>You have completed <strong>${escapeHtml(args.courseTitle)}</strong> ` +
            `on ${escapeHtml(formatCertificateDate(args.issuedAt))}. Your certificate is ready to view, download, and share.</p>` +
            `<p style="margin:24px 0;">${button("View my certificate", verifyUrl)}</p>` +
            `<p style="font-size:13px;color:#6B6570;">Certificate ID ${escapeHtml(args.serial)}</p>`,
        ),
      });
    } catch (error) {
      console.error("Failed to send certificate email:", error);
    }
  },
});

/**
 * Removes a throwaway preview PDF after the admin has looked at it. Previews
 * are stored in the same bucket as real certificates, so they need cleaning up
 * or they accumulate forever.
 */
export const deletePreviewFile = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    try {
      await ctx.storage.delete(args.storageId);
    } catch (error) {
      console.error("Failed to clean up certificate preview:", error);
    }
  },
});