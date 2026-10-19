"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Check,
  Crosshair,
  Eye,
  EyeOff,
  FileUp,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CERTIFICATE_COLOR_PRESETS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_FONT_LIST,
  CERTIFICATE_TEXT_DEFAULTS,
  DEFAULT_LAYOUT,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_RATIO,
  MAX_FIELD_SIZE,
  MAX_TEXT_WORDING,
  MIN_FIELD_SIZE,
  TEMPLATE_DEFAULTS,
  certificateField,
  certificateFont,
  effectiveAnchor,
  formatAnchor,
  isValidColor,
  parseAnchor,
  resolveColor,
  rgbToCss,
  type CertificateFieldKey,
  type CertificateLayout,
  type CertificateTexts,
  type FieldAnchor,
  type TextCase,
} from "@/lib/certificate-layout";
import { CertificateCanvas } from "@/components/certificate-canvas";

/**
 * The letter cases a field can be set in, with the label that shows the effect
 * rather than naming it — "UPPER" in the picker is a sample, not a caption.
 */
const TEXT_CASE_OPTIONS: ReadonlyArray<{ value: TextCase; label: string }> = [
  { value: "none", label: "As typed" },
  { value: "upper", label: "UPPER" },
  { value: "lower", label: "lower" },
  { value: "title", label: "Title Case" },
];

/**
 * Narrows whatever the toggle group reports to a case the renderer knows.
 *
 * The group speaks in strings and the renderer speaks in a union, so the
 * conversion has to happen once, here, rather than as a cast at the call site.
 */
function normalizeTextCase(value: string | undefined): TextCase {
  switch (value) {
    case "upper":
    case "lower":
    case "title":
      return value;
    default:
      return "none";
  }
}

/**
 * The single certificate design, on the admin Certificates page.
 *
 * There is one template, so this is upload-and-replace rather than a list to
 * pick from: no gallery, no activate/deactivate, no per-template pages.
 *
 * Placement is edited on a live canvas — drag the fields over the real
 * artwork — with a precision panel beside it for the times a nudge to the
 * exact percentage is faster than a nudge with the mouse.
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
  const [previewing, setPreviewing] = useState(false);
  const [draft, setDraft] = useState<Required<CertificateLayout> | null>(null);
  /**
   * The working wording — heading, date prefix, verify prefix.
   *
   * Kept as its own piece of state rather than folded into `draft` because the
   * two are different jobs with different "reset" meanings: placement is reset
   * per field against what is saved, wording is one block, and a discard of
   * one should not quietly eat the other.
   */
  const [textsDraft, setTextsDraft] = useState<Required<CertificateTexts> | null>(
    null,
  );
  const [selected, setSelected] = useState<CertificateFieldKey | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [entryEpoch, setEntryEpoch] = useState(0);
  /**
   * Whether the installed artwork is a PDF or an image.
   *
   * Reported by the canvas once it has read the bytes — asking the server
   * would mean loading the whole file into a query on every render, and the
   * canvas has already fetched it to draw it. Used only to name the artefact
   * in the links and toasts, never to decide how to render it.
   */
  const [assetKind, setAssetKind] = useState<"pdf" | "image" | null>(null);

  /**
   * Where each field was the last time it was visible.
   *
   * Hiding a field writes `null` over its working position, so without this
   * switching it back on would drop it back to the saved default and throw away
   * the placement the admin just spent time on. A ref rather than state: it is
   * only read inside handlers, so it never has to cause a render — and it must
   * be declared before the loading return below, like every other hook here.
   */
  const lastPositions = useRef<Partial<Record<CertificateFieldKey, FieldAnchor>>>({});

  // With no template installed the renderer uses the plain-artwork defaults,
  // so that is what the editor has to show and validate against.
  const defaults = useMemo(
    () => (template ? TEMPLATE_DEFAULTS : DEFAULT_LAYOUT),
    [template],
  );

  /**
   * The saved placement, with every field resolved — including the ones that
   * fall back to a default, and the ones deliberately switched off. The canvas
   * needs a value for each field rather than a sparse override map, which is
   * also what makes "reset" mean "back to what is saved" instead of "delete".
   */
  const saved = useMemo<Required<CertificateLayout>>(() => {
    const resolved = {} as Required<CertificateLayout>;
    for (const field of CERTIFICATE_FIELDS) {
      resolved[field.key] = effectiveAnchor(
        field.key,
        template?.layout ?? null,
        defaults,
      );
    }
    return resolved;
  }, [template, defaults]);

  /**
   * Saved wording, with anything the template never recorded filled in from the
   * same defaults the renderer falls back to — so the box shows the sentence a
   * certificate would actually print, not an empty field pretending otherwise.
   */
  const savedTexts = useMemo<Required<CertificateTexts>>(
    () => ({ ...CERTIFICATE_TEXT_DEFAULTS, ...template?.texts }),
    [template],
  );

  const working = draft ?? saved;
  const workingTexts = textsDraft ?? savedTexts;
  const dirty = draft !== null || textsDraft !== null;

  if (template === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  /**
   * Removes the artwork. The page it goes back to is the built-in one, so the
   * working placement and everything remembered about the old artwork goes with
   * it rather than being carried onto a page of a different shape.
   */
  async function handleRemove() {
    try {
      await remove({});
      setDraft(null);
      setTextsDraft(null);
      setSelected(null);
      lastPositions.current = {};
      setPreviewUrl(null);
      toast.success("Design removed — new certificates use the built-in artwork");
    } catch (err) {
      toast.error(getErrorMessage(err, "Something went wrong"));
    }
  }

  /** Rewordings one piece of copy in the working copy, like `moveField` does for a position. */
  function setText(key: keyof CertificateTexts, value: string) {
    setTextsDraft((prev) => ({ ...(prev ?? savedTexts), [key]: value }));
  }

  /** Moves one field in the working copy, without touching what is saved. */
  function moveField(key: CertificateFieldKey, anchor: FieldAnchor | null) {
    if (anchor) lastPositions.current[key] = anchor;
    // Functional form: a drag emits several updates between renders, and the
    // spread has to see the previous one rather than the value this render
    // started with, or every field but the dragged one would snap back.
    setDraft((prev) => ({ ...(prev ?? saved), [key]: anchor }));
  }

  /** Switches a field on (where it last was) or off the page. */
  function toggleField(key: CertificateFieldKey, visible: boolean) {
    if (visible) {
      // Last place it was drawn, else the saved place, else where it belongs on
      // a page we own outright. A bare centre would land a heading on top of
      // the learner's name, which is the opposite of helpful.
      moveField(
        key,
        lastPositions.current[key] ?? saved[key] ?? DEFAULT_LAYOUT[key],
      );
    } else {
      moveField(key, null);
    }
    setSelected(key);
  }

  function resetField(key: CertificateFieldKey) {
    moveField(key, saved[key]);
  }

  /**
   * Upload → validate server-side → save. The file goes to storage first via a
   * signed URL (as avatars and thumbnails do), then the action checks the bytes
   * really are a PDF, PNG or JPEG before the design is installed.
   */
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        // The declared type is what the picker guessed; the action reads the
        // magic bytes and rejects anything that is not artwork on its own
        // terms, so this is a hint rather than an assertion.
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const validated = await prepareUpload({ storageId });

      await save({
        name: file.name.replace(/\.(pdf|png|jpe?g)$/i, "") || "Certificate design",
        pdfStorageId: validated.storageId,
        pageWidth: validated.pageWidth,
        pageHeight: validated.pageHeight,
      });

      // Positions were tuned for the previous artwork; keeping them would print
      // the new design's fields in the old one's places. The unsaved wording
      // goes with them — it was being judged against a page that is no longer
      // there — but the saved wording stays, because copy does not depend on
      // the border.
      setDraft(null);
      setTextsDraft(null);
      setSelected(null);
      lastPositions.current = {};
      setPreviewUrl(null);
      setAssetKind(validated.assetKind === "image" ? "image" : "pdf");
      toast.success(
        template
          ? `Design replaced (${validated.assetKind === "image" ? "image" : "PDF"}) — drag the fields back into place`
          : `Design uploaded (${validated.assetKind === "image" ? "image" : "PDF"})`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  /** Renders a throwaway sample PDF from the working placement. */
  async function handlePreview() {
    setPreviewing(true);
    try {
      const result = await preview({ layout: working, texts: workingTexts });
      setPreviewUrl(result.url);
    } catch (err) {
      toast.error(getErrorMessage(err, "Preview failed"));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSaveLayout() {
    if (!template) return;
    setSaving(true);
    try {
      // The whole placement and the whole wording, not a patch: an admin has
      // been looking at the finished page, so what they save is what they saw —
      // fields left off included, rather than quietly reverting to a default.
      await updateLayout({ layout: working, texts: workingTexts });
      setDraft(null);
      setTextsDraft(null);
      toast.success("Placement and wording saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save the placement"));
    } finally {
      setSaving(false);
    }
  }

  const selectedAnchor = selected ? working[selected] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate design</CardTitle>
        <CardDescription>
          One background for every certificate — a PDF or an image. Uploading
          replaces it; certificates already issued keep the design they were
          rendered with. Only page 1 of a PDF is used.
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
                ? "Replace design"
                : "Upload design"}
            <input
              type="file"
              // SVG is deliberately absent: it can carry script. GIF and WebP
              // are absent because pdf-lib cannot embed them, and a background
              // that renders differently in the finished PDF than it did in the
              // editor is worse than one that has to be converted first.
              accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
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
              onClick={handleRemove}
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
                Open the background {assetKind === "image" ? "image" : "PDF"}
              </a>
            </>
          ) : (
            "No design uploaded — certificates use the built-in bordered artwork."
          )}
        </p>

        <div className="grid gap-6 border-t border-rule pt-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <CertificateCanvas
              pageWidth={template?.pageWidth ?? 841.89}
              pageHeight={template?.pageHeight ?? 595.28}
              backgroundUrl={template?.previewUrl ?? null}
              onAssetKind={setAssetKind}
              layout={working}
              selected={selected}
              onSelect={setSelected}
              onChange={moveField}
              showGuides={showGuides}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label className="eyebrow">Fields</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  size="sm"
                  checked={showGuides}
                  onCheckedChange={setShowGuides}
                  aria-label="Show page guides"
                />
                Guides
              </label>
            </div>

            <ul className="divide-y divide-rule rounded-md border border-rule">
              {CERTIFICATE_FIELDS.map((field) => {
                const anchor = working[field.key];
                const isHidden = anchor === null;
                const isSelected = selected === field.key;
                return (
                  <li key={field.key}>
                    <div
                      className={
                        isSelected
                          ? "bg-surface-sunken"
                          : "transition-colors hover:bg-surface-sunken/60"
                      }
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelected(field.key)}
                          className="min-w-0 flex-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex items-center gap-1.5">
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                            <span className="truncate font-medium">
                              {field.label}
                            </span>
                          </span>
                          <span className="tabular block truncate text-xs text-muted-foreground">
                            {isHidden
                              ? "Hidden — not printed"
                              : `${Math.round(anchor.x * 100)}% across · ${Math.round(
                                  anchor.y * 100,
                                )}% down · ${Math.round(anchor.size ?? 14)}pt`}
                          </span>
                        </button>
                        <Switch
                          size="sm"
                          checked={!isHidden}
                          onCheckedChange={(next) => toggleField(field.key, next)}
                          aria-label={`${isHidden ? "Show" : "Hide"} ${field.label}`}
                        />
                      </div>

                      {isSelected && (
                        <div className="space-y-3 border-t border-rule px-3 py-3">
                          {isHidden ? (
                            <p className="text-xs text-muted-foreground">
                              Switch it back on to place it. It stays off the
                              certificate until you do.
                            </p>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <NumberField
                                  id={`cert-x-${field.key}`}
                                  label="X"
                                  suffix="%"
                                  step={0.1}
                                  max={100}
                                  value={(anchor.x ?? 0) * 100}
                                  onChange={(next) =>
                                    moveField(field.key, {
                                      ...anchor,
                                      // Clamped here rather than left for the
                                      // server: a percentage past the page edge
                                      // would fail the whole save, and the box
                                      // is the wrong place to learn that.
                                      x: Math.min(1, Math.max(0, next / 100)),
                                    })
                                  }
                                />
                                <NumberField
                                  id={`cert-y-${field.key}`}
                                  label="Y"
                                  suffix="%"
                                  step={0.1}
                                  max={100}
                                  value={(anchor.y ?? 0) * 100}
                                  onChange={(next) =>
                                    moveField(field.key, {
                                      ...anchor,
                                      y: Math.min(1, Math.max(0, next / 100)),
                                    })
                                  }
                                />
                                <NumberField
                                  id={`cert-size-${field.key}`}
                                  label="Size"
                                  suffix="pt"
                                  step={1}
                                  min={MIN_FIELD_SIZE}
                                  max={MAX_FIELD_SIZE}
                                  value={anchor.size ?? 14}
                                  onChange={(next) =>
                                    moveField(field.key, {
                                      ...anchor,
                                      // Same clamp the drag handle applies, so
                                      // a typed size cannot outgrow the range
                                      // the canvas will draw at.
                                      size: Math.min(
                                        MAX_FIELD_SIZE,
                                        Math.max(MIN_FIELD_SIZE, next),
                                      ),
                                    })
                                  }
                                />
                              </div>

                              {/*
                                Typography — how this one field is set, kept
                                apart from X/Y/Size because it is a choice
                                about the type rather than about where the
                                line sits: nudging a heading must not restyle
                                it, and restyling it must not move it.
                              */}
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`cert-font-${field.key}`}
                                    className="eyebrow"
                                  >
                                    Font
                                  </Label>
                                  <Select
                                    value={certificateFont(anchor.font ?? field.font).id}
                                    onValueChange={(next) => {
                                      // Null would mean the selection was
                                      // cleared; a field always has a face.
                                      if (!next) return;
                                      moveField(field.key, { ...anchor, font: next });
                                    }}
                                  >
                                    <SelectTrigger
                                      id={`cert-font-${field.key}`}
                                      className="h-8 w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CERTIFICATE_FONT_LIST.map((face) => (
                                        <SelectItem key={face.id} value={face.id}>
                                          <span
                                            style={{
                                              fontFamily: face.css,
                                              fontWeight: face.weight,
                                              fontStyle: face.style,
                                            }}
                                          >
                                            {face.label}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="eyebrow">Case</Label>
                                  <ToggleGroup
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-between"
                                    value={[anchor.case ?? "none"]}
                                    onValueChange={(values) => {
                                      // An empty list means the pressed item
                                      // was released. That is not a request for
                                      // "as typed" — it is a click on the
                                      // button that is already on.
                                      const next = values.at(-1);
                                      if (!next) return;
                                      moveField(field.key, {
                                        ...anchor,
                                        case: normalizeTextCase(next),
                                      });
                                    }}
                                  >
                                    {TEXT_CASE_OPTIONS.map((option) => (
                                      <ToggleGroupItem
                                        key={option.value}
                                        value={option.value}
                                        className="flex-1 text-xs"
                                      >
                                        {option.label}
                                      </ToggleGroupItem>
                                    ))}
                                  </ToggleGroup>
                                </div>

                                <NumberField
                                  id={`cert-leading-${field.key}`}
                                  label="Line height"
                                  suffix="×"
                                  step={0.05}
                                  min={LINE_HEIGHT_MIN}
                                  max={LINE_HEIGHT_MAX}
                                  value={anchor.lineHeight ?? LINE_HEIGHT_RATIO}
                                  onChange={(next) =>
                                    moveField(field.key, {
                                      ...anchor,
                                      // Clamped to the range the server will
                                      // accept, so a typed value cannot fail
                                      // the whole save over one field.
                                      lineHeight: Math.min(
                                        LINE_HEIGHT_MAX,
                                        Math.max(LINE_HEIGHT_MIN, next),
                                      ),
                                    })
                                  }
                                />

                                <div className="space-y-1">
                                  <Label
                                    htmlFor={`cert-colour-${field.key}`}
                                    className="eyebrow"
                                  >
                                    Colour
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex shrink-0 items-center gap-1">
                                      {CERTIFICATE_COLOR_PRESETS.map((preset) => {
                                        const active =
                                          (anchor.color ?? field.color) === preset.id;
                                        return (
                                          <button
                                            key={preset.id}
                                            type="button"
                                            title={preset.label}
                                            aria-label={`${preset.label} text`}
                                            aria-pressed={active}
                                            onClick={() =>
                                              moveField(field.key, {
                                                ...anchor,
                                                color: preset.id,
                                              })
                                            }
                                            className={`h-6 w-6 rounded border ${
                                              active
                                                ? "border-primary ring-1 ring-ring"
                                                : "border-rule"
                                            }`}
                                            style={{
                                              backgroundColor: rgbToCss(
                                                resolveColor(preset.id),
                                              ),
                                            }}
                                          />
                                        );
                                      })}
                                    </div>
                                    <Input
                                      id={`cert-colour-${field.key}`}
                                      // Keyed on the value and the epoch, so a
                                      // rejected entry is cleared rather than
                                      // left sitting there looking accepted.
                                      key={`${field.key}-colour-${entryEpoch}-${anchor.color ?? field.color}`}
                                      defaultValue={anchor.color ?? field.color}
                                      onBlur={(e) => {
                                        const value =
                                          e.target.value.trim() || field.color;
                                        if (!isValidColor(value)) {
                                          setEntryEpoch((n) => n + 1);
                                          toast.error(
                                            `“${e.target.value}” is not a colour — use a preset name or #rrggbb`,
                                          );
                                          return;
                                        }
                                        moveField(field.key, {
                                          ...anchor,
                                          color: value,
                                        });
                                      }}
                                      className="tabular h-8 min-w-0 flex-1 font-mono text-xs"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() =>
                                    moveField(field.key, { ...anchor, x: 0.5 })
                                  }
                                >
                                  <Crosshair className="h-3.5 w-3.5" /> Centre
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() => resetField(field.key)}
                                >
                                  Reset field
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {selectedAnchor === null && selected && (
              <p className="text-xs text-muted-foreground">
                <EyeOff className="mr-1 inline h-3 w-3" />
                {certificateField(selected).label} is off the page.
              </p>
            )}
            {selectedAnchor && (
              <p className="text-xs text-muted-foreground">
                <Eye className="mr-1 inline h-3 w-3" />
                Drag it on the page, or type an exact position above.
              </p>
            )}

            {/*
              Wording — the lines on the certificate that are not learner data.
              Everything else (name, course, date) prints from the certificate
              itself and cannot be reworded here, because a certificate saying
              something other than what the learner earned is not a
              certificate.
            */}
            <div className="space-y-3 border-t border-rule pt-4">
              <Label className="eyebrow">Wording</Label>
              <div className="space-y-1.5">
                <Label htmlFor="cert-text-heading">Heading</Label>
                <Input
                  id="cert-text-heading"
                  maxLength={MAX_TEXT_WORDING}
                  value={workingTexts.heading}
                  onChange={(e) => setText("heading", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert-text-issued">Before the date</Label>
                <Input
                  id="cert-text-issued"
                  maxLength={MAX_TEXT_WORDING}
                  value={workingTexts.issuedOnPrefix}
                  onChange={(e) => setText("issuedOnPrefix", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cert-text-serial">Before the link</Label>
                <Input
                  id="cert-text-serial"
                  maxLength={MAX_TEXT_WORDING}
                  value={workingTexts.serialPrefix}
                  onChange={(e) => setText("serialPrefix", e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The heading prints only while the Heading field is switched on.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
          <Button
            size="sm"
            variant="outline"
            disabled={previewing}
            onClick={handlePreview}
          >
            {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Render PDF preview
          </Button>
          {template && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!dirty}
                onClick={() => {
                  setDraft(null);
                  setTextsDraft(null);
                }}
              >
                Discard changes
              </Button>
              <Button size="sm" disabled={saving || !dirty} onClick={handleSaveLayout}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save changes
              </Button>
            </>
          )}
          {!template && (
            <p className="text-sm text-muted-foreground">
              Upload a design to save a placement — the built-in artwork has no
              page of its own to store positions against.
            </p>
          )}
        </div>

        {!template && (
          <p className="text-sm text-muted-foreground">
            Drag the fields to try a layout, then render a PDF preview to see
            the finished certificate. Nothing is stored until a design is
            uploaded.
          </p>
        )}

        <details
          open={showCoordinates}
          onToggle={(e) =>
            setShowCoordinates((e.currentTarget as HTMLDetailsElement).open)
          }
          className="border-t border-rule pt-5"
        >
          <summary className="cursor-pointer text-sm font-medium select-none">
            Paste coordinates
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            Positions are fractions of the page — <code>0.5,0.5</code> is the
            centre — so they hold for any design size. Format is{" "}
            <code>x,y</code> or <code>x,y,size</code>; type <code>off</code> to
            keep a field off the certificate. Each box replaces just that
            field, and a blank one leaves it as it is.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {CERTIFICATE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`cert-field-${field.key}`} className="eyebrow">
                  {field.label}
                </Label>
                <Input
                  id={`cert-field-${field.key}`}
                  // Keyed on the live value so the box catches up after a drag
                  // or a reset, and on an epoch so a rejected entry is cleared
                  // rather than left sitting there looking accepted.
                  key={`${field.key}-${entryEpoch}-${formatAnchor(working[field.key])}`}
                  defaultValue={formatAnchor(working[field.key])}
                  onBlur={(e) => {
                    try {
                      const anchor = parseAnchor(e.target.value);
                      if (anchor !== undefined) moveField(field.key, anchor);
                    } catch (err) {
                      setEntryEpoch((n) => n + 1);
                      toast.error(getErrorMessage(err, "That is not a position"));
                    }
                  }}
                  className="tabular"
                />
              </div>
            ))}
          </div>
        </details>

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

/**
 * A percentage or point size with its unit outside the box.
 *
 * Controlled, but with the text kept locally: the value also moves while a
 * field is being dragged, and retyping a number needs the box to survive a
 * half-finished entry. So the local text follows the incoming value whenever
 * that value changes from the outside, and only reports back once it parses —
 * clearing the box to retype it never snaps the field to zero.
 */
function NumberField({
  id,
  label,
  suffix,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  const [text, setText] = useState(String(rounded));
  const [external, setExternal] = useState(rounded);

  // React's documented "adjust state during render" pattern: the canvas drags
  // the value, and this box has to catch up without an effect round-trip.
  if (external !== rounded) {
    setExternal(rounded);
    setText(String(rounded));
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="eyebrow">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const next = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(next)) onChange(next);
          }}
          onBlur={() => setText(String(rounded))}
          className="tabular h-8 px-2"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}
