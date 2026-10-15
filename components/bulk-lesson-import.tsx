"use client";

import { useState, useRef, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { Badge } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui";
import { Upload, Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { parseCsv } from "@/lib/csv";
import { validateLessonCsv, type ValidLessonRow, type ImportRowError } from "@/lib/bulk-lesson-import";

const SAMPLE_CSV = `title,contentType,order
Introduction to the Course,video,0
Getting Started Guide,article,1
Module 1 Quiz,quiz,2`;

export function BulkLessonImport({ courseId }: { courseId: Id<"courses"> }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{
    valid: ValidLessonRow[];
    errors: ImportRowError[];
  } | null>(null);
  const [importing, startImport] = useTransition();
  const [result, setResult] = useState<{ created: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createLesson = useMutation(api.courses.createLesson);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCsv(text);
      setPreview(validateLessonCsv(rows));
    };
    reader.readAsText(file);
  }

  function reset() {
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    startImport(async () => {
      let created = 0;
      let failed = 0;
      for (const row of preview.valid) {
        try {
          await createLesson({
            courseId,
            title: row.title,
            contentType: row.contentType,
            order: row.order,
          });
          created++;
        } catch {
          failed++;
        }
      }
      setResult({ created, failed });
      if (created > 0) toast.success(`${created} lesson${created > 1 ? "s" : ""} imported`);
      if (failed > 0) toast.error(`${failed} lesson${failed > 1 ? "s" : ""} failed`);
    });
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={
        <Button variant="outline" size="sm" type="button">
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
      } />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Lessons</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <code>title</code>, <code>contentType</code>,{" "}
            <code>order</code> (optional).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <Button variant="ghost" size="sm" onClick={downloadSample} title="Download template">
              <Download className="h-4 w-4" />
            </Button>
          </div>

          {preview && (
            <>
              {preview.errors.length > 0 && (
                <Card className="border-destructive">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="space-y-1 text-sm">
                        {preview.errors.map((e, i) => (
                          <p key={i}>
                            <span className="font-medium">Row {e.row}:</span>{" "}
                            {e.errors.join("; ")}
                          </p>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {preview.valid.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      {preview.valid.length} lesson{preview.valid.length > 1 ? "s" : ""} ready
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ol className="list-none divide-y divide-rule text-sm">
                      {preview.valid.map((row, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="truncate">{row.title}</span>
                          <Badge variant="secondary">{row.contentType}</Badge>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {result && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {result.created} created{result.failed > 0 && `, ${result.failed} failed`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={importing || !preview || preview.valid.length === 0}
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {preview?.valid.length ?? 0} Lesson{(preview?.valid.length ?? 0) !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
