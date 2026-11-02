"use client";

import { useState, useRef, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Upload, Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeZip, type ZipLessonDraft, type LessonContentType } from "@/lib/zip-course-import";
import { useUploadThing } from "@/components/uploadthing";

const CONTENT_TYPES: LessonContentType[] = ["video", "article", "quiz", "presentation"];

export function ZipCourseImport({ courseId }: { courseId: Id<"courses"> }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [lessons, setLessons] = useState<ZipLessonDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, startCreating] = useTransition();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const bulkCreate = useMutation(api.courses.bulkCreateLessons);
  const registerSource = useMutation(api.videoAssets.registerSource);
  const { startUpload } = useUploadThing("lessonVideo");

  function reset() {
    setStep(1);
    setLessons([]);
    setWarnings([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    try {
      const res = await analyzeZip(file);
      setLessons(res.lessons);
      setWarnings(res.warnings);
      setStep(1);
      setOpen(true);
    } catch {
      toast.error("Failed to read zip file");
    } finally {
      setAnalyzing(false);
    }
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= lessons.length) return;
    const next = [...lessons];
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((l, k) => (l.order = k));
    setLessons(next);
  }

  function remove(i: number) {
    const next = lessons.filter((_, k) => k !== i);
    next.forEach((l, k) => (l.order = k));
    setLessons(next);
  }

  function updateTitle(i: number, title: string) {
    setLessons((prev) => prev.map((l, k) => (k === i ? { ...l, title } : l)));
  }

  function updateType(i: number, t: LessonContentType) {
    setLessons((prev) => prev.map((l, k) => (k === i ? { ...l, contentType: t } : l)));
  }

  function updateSection(i: number, section: string) {
    setLessons((prev) =>
      prev.map((l, k) => (k === i ? { ...l, section: section.trim() || undefined } : l)),
    );
  }

  async function handleCreate() {
    if (lessons.length === 0) return;
    startCreating(async () => {
      try {
        // Upload presentation blobs to Convex storage first.
        const presentationStorageIds = await Promise.all(
          lessons.map(async (l) => {
            if (l.contentType !== "presentation" || !l.fileBlob) return undefined;
            const uploadUrl = await generateUploadUrl();
            const res = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": l.fileBlob.type || "application/octet-stream" },
              body: l.fileBlob,
            });
            if (!res.ok) throw new Error(`Upload failed for ${l.title}`);
            const { storageId } = await res.json();
            return storageId as Id<"_storage">;
          }),
        );

        const prepared = lessons.map((l, i) => ({
          title: l.title,
          contentType: l.contentType,
          order: l.order,
          section: l.section,
          content: l.textContent,
          presentationStorageId: presentationStorageIds[i],
          presentationFileName:
            l.contentType === "presentation" ? l.sourcePath.split("/").pop() : undefined,
          quiz: l.quiz
            ? {
                title: l.quiz.title,
                passingScore: l.quiz.passingScore,
                questions: l.quiz.questions,
              }
            : undefined,
        }));

        const lessonIds = await bulkCreate({ courseId, lessons: prepared });

        // Encrypted video flow: upload each video to UploadThing, then register
        // as a videoAsset (triggers HLS transcode + AES encryption).
        const videoDrafts = lessons
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => l.contentType === "video" && !!l.fileBlob);

        for (const { l, i } of videoDrafts) {
          const lessonId = lessonIds[i];
          const file = new File([l.fileBlob!], l.sourcePath.split("/").pop() || "video.mp4", {
            type: l.fileBlob!.type || "video/mp4",
          });
          const uploaded = await startUpload([file], { lessonId: String(lessonId) });
          if (!uploaded || uploaded.length === 0) throw new Error(`Upload failed for ${l.title}`);
          const u = uploaded[0];
          const sourceUrl = u.ufsUrl || u.url;
          await registerSource({
            lessonId,
            sourceFileUrl: sourceUrl,
            sourceFileKey: u.key,
            sizeBytes: l.fileBlob!.size,
          });
        }

        toast.success(`${lessons.length} lesson${lessons.length > 1 ? "s" : ""} created`);
        setOpen(false);
        reset();
      } catch {
        toast.error("Failed to create lessons");
      }
    });
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleFile}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={analyzing}
      >
        {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Import zip
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{step === 1 ? "Review detected lessons" : "Finalize & create"}</DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Edit titles, types, and order. Remove anything you don't want."
                : "Reorder final list, then create all lessons."}
            </DialogDescription>
          </DialogHeader>

          {warnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" /> Warnings
              </div>
              <ul className="mt-1 list-disc pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              {lessons.length === 0 && (
                <p className="text-sm text-muted-foreground">No lessons detected.</p>
              )}
              {lessons.map((l, i) => (
                <div
                  key={l.tempId}
                  className="flex items-center gap-2 rounded border p-2"
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === i) return;
                    const next = [...lessons];
                    const [moved] = next.splice(dragIndex, 1);
                    next.splice(i, 0, moved);
                    next.forEach((x, k) => (x.order = k));
                    setLessons(next);
                    setDragIndex(null);
                  }}
                >
                  <Input
                    value={l.title}
                    onChange={(e) => updateTitle(i, e.target.value)}
                    className="flex-1"
                  />
                  <Select value={l.contentType} onValueChange={(v) => updateType(i, v as LessonContentType)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPES.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {ct}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={l.section ?? ""}
                    onChange={(e) => updateSection(i, e.target.value)}
                    placeholder="Section"
                    className="w-32"
                  />
                  {l.needsInput.length > 0 && (
                    <Badge variant="secondary">{l.needsInput.join(", ")}</Badge>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {lessons.length} lesson{lessons.length !== 1 ? "s" : ""} will be created.
              </p>
              <ul className="list-disc pl-5 text-sm">
                {lessons.map((l) => (
                  <li key={l.tempId}>
                    {l.order + 1}. {l.title} <span className="text-muted-foreground">({l.contentType})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            {step === 1 ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setStep(2)} disabled={lessons.length === 0}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={handleCreate} disabled={creating || lessons.length === 0}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Create lessons
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
