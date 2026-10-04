"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileUp, Loader2, FileStack, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";

type FieldKey =
  | "heading"
  | "recipient"
  | "course"
  | "issuedOn"
  | "issuer"
  | "serial";

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: "heading", label: "Heading" },
  { key: "recipient", label: "Learner name" },
  { key: "course", label: "Course title" },
  { key: "issuedOn", label: "Completion date" },
  { key: "issuer", label: "Issuer name" },
  { key: "serial", label: "Certificate ID / verify link" },
];

/**
 * Admin screen for certificate backgrounds. An admin uploads a designed PDF, it
 * becomes the template every new certificate is stamped onto, and individual
 * text fields can be nudged if the artwork crowds them.
 */
export default function CertificateTemplatesPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const templates = useQuery(api.certificateTemplates.listTemplates);
  const createTemplate = useMutation(api.certificateTemplates.createTemplate);
  const activate = useMutation(api.certificateTemplates.activateTemplate);
  const deactivate = useMutation(api.certificateTemplates.deactivateTemplate);
  const updateLayout = useMutation(api.certificateTemplates.updateTemplateLayout);
  const remove = useMutation(api.certificateTemplates.deleteTemplate);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const prepareUpload = useAction(api.certificateTemplateActions.prepareTemplateUpload);
  const preview = useAction(api.certificateTemplateActions.previewTemplate);

  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<Id<"certificateTemplates"> | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (pendingId) setPreviewUrl(null);
  }, [pendingId]);

  // Hooks must run before the loading / not-admin early returns below.
  const selected = useMemo(
    () => (templates ?? []).find((t) => t._id === pendingId) ?? null,
    [templates, pendingId],
  );

  if (
    currentUser === undefined ||
    (templates === undefined && currentUser?.role === "admin")
  ) {
    return (
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="mx-auto mt-16 w-full max-w-md">
        <EmptyState
          icon={FileStack}
          title="Access denied"
          description="This console is for administrators. Your account does not have access to it."
          tone="warning"
        />
      </div>
    );
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
   * really are a parseable PDF before a row is created.
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
      const templateName = name.trim() || file.name.replace(/\.pdf$/i, "");

      const id = await createTemplate({
        name: templateName,
        pdfStorageId: validated.storageId,
        pageWidth: validated.pageWidth,
        pageHeight: validated.pageHeight,
        activate: true,
      });

      setName("");
      setPendingId(id);
      toast.success("Template uploaded and activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Turns the position inputs into a layout. `off` means "do not draw this
   * field" (null) — the escape hatch for a template that already prints its own
   * title. Anything unparseable is left out so it keeps its current value.
   */
  function parseDrafts(): Partial<Record<FieldKey, { x: number; y: number; size?: number } | null>> {
    const parsed: Partial<
      Record<FieldKey, { x: number; y: number; size?: number } | null>
    > = {};
    for (const field of FIELDS) {
      const raw = drafts[field.key]?.trim();
      if (!raw) continue;
      if (raw.toLowerCase() === "off") {
        parsed[field.key] = null;
        continue;
      }
      const [x, y, size] = raw.split(",").map((n) => Number(n.trim()));
      if ([x, y].some((n) => Number.isNaN(n))) continue;
      parsed[field.key] = { x, y, size: Number.isNaN(size) ? undefined : size };
    }
    return parsed;
  }

  async function handlePreview() {
    if (!selected) return;
    try {
      const result = await preview({
        templateId: selected._id,
        layout: parseDrafts(),
      });
      setPreviewUrl(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function handleSaveLayout() {
    if (!selected) return;
    const parsed = parseDrafts();

    await run(
      () => updateLayout({ templateId: selected._id, layout: parsed as never }),
      "Field positions saved",
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8">
      <PageHeader
        title="Certificate templates"
        description="Upload a designed PDF background. Every new certificate is stamped onto it with the learner&apos;s name, course, date, and certificate ID. Only page 1 is used."
      />

      <Card>
        <CardHeader>
          <CardTitle>Upload a template</CardTitle>
          <CardDescription>
            PDF only, up to 20 MB. Uploading activates it immediately and
            deactivates the previous template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="template-name" className="eyebrow">
              Template name
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the file name"
            />
          </div>
          <div className="flex items-center gap-3">
            {/* Styled to the `outline` button so the file picker and the real
                buttons on this page read as the same control. */}
            <label className="inline-flex h-9.5 cursor-pointer items-center gap-1.5 rounded-md border border-rule-strong px-3.5 text-sm font-medium transition-colors hover:bg-surface-sunken has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45">
              <FileUp className="h-4 w-4" />
              {uploading ? "Uploading…" : "Choose PDF"}
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Templates (<span className="tabular">{(templates ?? []).length}</span>)
          </CardTitle>
          <CardDescription>
            The active template is used for all newly issued certificates.
            Existing certificates keep the template they were issued with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(templates ?? []).length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No templates uploaded"
              description="Certificates will use the built-in plain layout until you add one."
              tone="brand"
            />
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {(templates ?? []).map((template) => (
                <li
                  key={template._id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {template.name}
                      {template.active && (
                        <Badge variant="default">active</Badge>
                      )}
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      {Math.round(template.pageWidth)} ×{" "}
                      {Math.round(template.pageHeight)} pt
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPendingId(template._id);
                        setDrafts({});
                        setPreviewUrl(null);
                      }}
                    >
                      Edit placement
                    </Button>
                    {template.active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendingId === template._id && previewUrl !== null}
                        onClick={() =>
                          run(
                            () => deactivate({ templateId: template._id }),
                            "Template deactivated",
                          )
                        }
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(
                            () => activate({ templateId: template._id }),
                            "Template activated",
                          )
                        }
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete template ${template.name}`}
                      onClick={() =>
                        run(
                          () => remove({ templateId: template._id }),
                          "Template deleted",
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Field placement — {selected.name}</CardTitle>
            <CardDescription>
              Positions are fractions of the page: 0.5,0.5 is the centre. Format is{" "}
              <code>x,y</code> or <code>x,y,size</code>. Leave a field blank to
              keep its current value, or type <code>off</code> to keep that field
              off the certificate entirely — useful when the template already
              prints its own title.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`anchor-${field.key}`} className="eyebrow">
                    {field.label}
                  </Label>
                  <Input
                    id={`anchor-${field.key}`}
                    value={drafts[field.key] ?? ""}
                    placeholder="default"
                    onChange={(e) =>
                      setDrafts((prev) => {
                        const next = { ...prev };
                        // Clearing the box means "fall back to the stored
                        // value", not "set it to 0,0".
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
              <Button size="sm" onClick={handleSaveLayout}>
                Save positions
              </Button>
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
      )}
    </div>
  );
}