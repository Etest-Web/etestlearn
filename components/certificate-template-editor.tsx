"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CERTIFICATE_FIELDS,
  DEFAULT_LAYOUT,
  TEMPLATE_DEFAULTS,
  effectiveAnchor,
  formatAnchor,
  parseAnchor,
  type CertificateLayout,
} from "@/lib/certificate-layout";

/**
 * The single certificate design, on the admin Certificates page.
 *
 * There is one template, so this is upload-and-replace rather than a list to
 * pick from: no gallery, no activate/deactivate, no per-template pages. Field
 * placement is the part that genuinely needs controls, so it stays explicit.
 */
export function CertificateTemplateEditor() {
  const template = useQuery(api.certificateTemplates.getTemplate);
  const save = useMutation(api.certificateTemplates.saveTemplate);
  const updateLayout = useMutation(api.certificateTemplates.updateTemplateLayout);
  const remove = useMutation(api.certificateTemplates.deleteTemplate);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const prepareUpload = useAction(
    api.certificateTemplateActions.prepareTemplateUpload,
  );
  const preview = useAction(api.certificateTemplateActions.previewTemplate);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // With no template installed the renderer uses the plain-artwork defaults, so
  // that is what the editor has to show and validate against.
  const defaults = useMemo(
    () => (template ? TEMPLATE_DEFAULTS : DEFAULT_LAYOUT),
    [template],
  );

  if (template === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /**
   * Upload → validate server-side → save. The file goes to storage first via a
   * signed URL (as avatars and thumbnails do), then the action checks the bytes
   * really are a parseable PDF before the design is installed.
   */
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const validated = await prepareUpload({ storageId });

      await save({
        name: file.name.replace(/\.pdf$/i, "") || "Certificate design",
        pdfStorageId: validated.storageId,
        pageWidth: validated.pageWidth,
        pageHeight: validated.pageHeight,
      });

      // Positions were tuned for the previous artwork; keeping them would print
      // the new design's fields in the old one's places.
      setDrafts({});
      setPreviewUrl(null);
      toast.success(
        template
          ? "Design replaced — check the field positions still line up"
          : "Design uploaded",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Blank means "use the default", `off` keeps the field off the page. */
  function parseDrafts(): CertificateLayout {
    const parsed: CertificateLayout = {};
    for (const field of CERTIFICATE_FIELDS) {
      const raw = drafts[field.key];
      if (raw === undefined) continue;
      const anchor = parseAnchor(raw);
      if (anchor !== undefined) parsed[field.key] = anchor;
    }
    return parsed;
  }

  async function handlePreview() {
    try {
      const result = await preview({ layout: parseDrafts() });
      setPreviewUrl(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function handleSaveLayout() {
    if (!template) return;
    setSaving(true);
    try {
      await updateLayout({ layout: parseDrafts() });
      setDrafts({});
      toast.success("Field positions saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save positions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate design</CardTitle>
        <CardDescription>
          One background PDF for every certificate. Uploading replaces it —
          certificates already issued keep the design they were rendered with.
          Only page 1 is used.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Styled to the `outline` button so the file picker and the real
              buttons below read as the same control. */}
          <label className="inline-flex h-9.5 cursor-pointer items-center gap-1.5 rounded-md border border-rule-strong px-3.5 text-sm font-medium transition-colors hover:bg-surface-sunken has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45">
            <FileUp className="h-4 w-4" />
            {uploading
              ? "Uploading…"
              : template
                ? "Replace design (PDF)"
                : "Upload design (PDF)"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          {template && (
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() =>
                run(
                  () => remove({}),
                  "Design removed — new certificates use the built-in artwork",
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {template ? (
            <>
              Using{" "}
              <span className="font-medium text-foreground">{template.name}</span>{" "}
              <span className="tabular">
                ({Math.round(template.pageWidth)} ×{" "}
                {Math.round(template.pageHeight)} pt)
              </span>
              .{" "}
              <a
                href={template.previewUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="link-quiet text-primary"
              >
                Open the background PDF
              </a>
            </>
          ) : (
            "No design uploaded — certificates use the built-in bordered artwork."
          )}
        </p>

        <div className="space-y-1.5 border-t border-rule pt-5">
          <Label htmlFor="cert-field-recipient" className="eyebrow">
            Field positions
          </Label>
          <p className="text-sm text-muted-foreground">
            Positions are fractions of the page — <code>0.5,0.5</code> is the
            centre — so they hold for any design size. Format is{" "}
            <code>x,y</code> or <code>x,y,size</code>. An empty box means the
            default in grey applies; type <code>off</code> to keep a field off the
            certificate, which is useful when the artwork already prints its own
            title. Saving replaces the stored positions with the boxes you have
            filled in here.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CERTIFICATE_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`cert-field-${field.key}`} className="eyebrow">
                {field.label}
              </Label>
              <Input
                id={`cert-field-${field.key}`}
                value={drafts[field.key] ?? ""}
                placeholder={formatAnchor(
                  effectiveAnchor(field.key, template?.layout, defaults),
                )}
                onChange={(e) =>
                  setDrafts((prev) => {
                    const next = { ...prev };
                    // An empty box means "leave this field alone", so it must
                    // not be sent as "reset to the default" by accident.
                    if (e.target.value === "") delete next[field.key];
                    else next[field.key] = e.target.value;
                    return next;
                  })
                }
                className="tabular"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={handlePreview}>
            Preview with sample data
          </Button>
          {template && (
            <Button
              size="sm"
              disabled={saving || Object.keys(drafts).length === 0}
              onClick={handleSaveLayout}
            >
              Save positions
            </Button>
          )}
        </div>

        {previewUrl && (
          <object
            data={previewUrl}
            type="application/pdf"
            className="h-[480px] w-full border border-rule"
          >
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              Open preview
            </a>
          </object>
        )}
      </CardContent>
    </Card>
  );
}
