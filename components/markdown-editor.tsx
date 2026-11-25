"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Bold,
  Braces,
  Code,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import {
  insertImage,
  prefixLines,
  wrapSelection,
  type MarkdownEdit,
} from "@/lib/markdown-editor-insert";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const FORMATTING_TOOLS: ReadonlyArray<{
  label: string;
  icon: LucideIcon;
  edit: (value: string, start: number, end: number) => MarkdownEdit;
}> = [
  {
    label: "Bold",
    icon: Bold,
    edit: (value, start, end) => wrapSelection(value, start, end, "**", "**", "bold text"),
  },
  {
    label: "Italic",
    icon: Italic,
    edit: (value, start, end) => wrapSelection(value, start, end, "*", "*", "italic text"),
  },
  {
    label: "Heading",
    icon: Heading2,
    edit: (value, start, end) => prefixLines(value, start, end, "## "),
  },
  {
    label: "Link",
    icon: Link2,
    edit: (value, start, end) =>
      wrapSelection(value, start, end, "[", "](https://example.com)", "link text"),
  },
  {
    label: "Bulleted list",
    icon: List,
    edit: (value, start, end) => prefixLines(value, start, end, "- "),
  },
  {
    label: "Numbered list",
    icon: ListOrdered,
    edit: (value, start, end) => prefixLines(value, start, end, (index) => `${index + 1}. `),
  },
  {
    label: "Quote",
    icon: Quote,
    edit: (value, start, end) => prefixLines(value, start, end, "> "),
  },
  {
    label: "Inline code",
    icon: Code,
    edit: (value, start, end) => wrapSelection(value, start, end, "`", "`", "code"),
  },
  {
    label: "Code block",
    icon: Braces,
    edit: (value, start, end) => wrapSelection(value, start, end, "```\n", "\n```", "code"),
  },
];

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const generateArticleImageUploadUrl = useMutation(api.files.generateArticleImageUploadUrl);
  const validateArticleImageUpload = useMutation(api.files.validateArticleImageUpload);

  const applyEdit = (edit: MarkdownEdit) => {
    onChange(edit.value);
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  const runTool = (edit: (value: string, start: number, end: number) => MarkdownEdit) => {
    const element = textareaRef.current;
    applyEdit(
      edit(value, element?.selectionStart ?? value.length, element?.selectionEnd ?? value.length),
    );
  };

  const uploadImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5 MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are allowed");
        return;
      }
      setIsUploading(true);
      try {
        const postUrl = await generateArticleImageUploadUrl({});
        const response = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error("Upload failed");
        const { storageId } = (await response.json()) as { storageId: string };
        const imageUrl = await validateArticleImageUpload({
          storageId: storageId as Id<"_storage">,
        });
        if (!imageUrl) throw new Error("Upload failed");
        const live = textareaRef.current;
        const liveValue = live?.value ?? value;
        applyEdit(
          insertImage(
            liveValue,
            live?.selectionStart ?? liveValue.length,
            live?.selectionEnd ?? liveValue.length,
            imageUrl,
          ),
        );
        toast.success("Image inserted");
      } catch {
        toast.error("Image upload failed");
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <div
          className="flex flex-wrap items-center gap-0.5 rounded-md border border-rule bg-surface-sunken p-1"
          role="toolbar"
          aria-label="Markdown formatting"
        >
          {FORMATTING_TOOLS.map(({ label, icon: Icon, edit }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon-sm"
              title={label}
              aria-label={label}
              onClick={() => runTool(edit)}
            >
              <Icon aria-hidden="true" />
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-rule" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Insert image"
            aria-label="Insert image"
            disabled={isUploading}
            onClick={uploadImage}
          >
            {isUploading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <ImageIcon aria-hidden="true" />
            )}
          </Button>
        </div>
        <Textarea
          ref={textareaRef}
          id="content"
          name="content"
          rows={24}
          placeholder={"# Hello World\n\nWrite your article here using markdown."}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-sm h-64 min-h-[400px] overflow-y-auto border border-rule rounded-md bg-surface-sunken dark:bg-surface-900 dark:border-surface-800"
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Live preview</p>
        <div className="prose prose-sm dark:prose-invert max-w-none h-64 min-h-[400px] overflow-auto rounded-md border border-rule bg-surface-sunken p-4">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="not-prose text-sm text-muted-foreground">
              Nothing to preview yet — start writing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
