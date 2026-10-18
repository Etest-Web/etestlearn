"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { InstructorProjectsPreview } from "@/components/course-projects";
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_OUTCOME_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
  TECH_STACK_MAX_TAGS,
  normalizeOptionalText,
  normalizeTechStack,
  projectDraftError,
} from "@/lib/course-projects";

/**
 * The instructor's editor for their course showcase.
 *
 * Mounted as the "Projects" tab on the course edit page. The list, the create
 * form and the edit form are all in this file because they share one draft shape
 * and one validation call — splitting them across three files would mean the
 * create form and the edit form disagreeing about what a valid project is.
 *
 * Reordering is up/down buttons rather than drag-and-drop deliberately: with at
 * most `MAX_PROJECTS_PER_COURSE` rows, two buttons are operable from the
 * keyboard with no library, and a drag handle that only works with a pointer is
 * not a control. `reorderProjects` takes the whole final order rather than a
 * delta for the same reason — see that mutation's comment.
 */
export function CourseProjectsManager({ courseId }: { courseId: Id<"courses"> }) {
  // One list subscription for the whole editor. The create/edit form below reads
  // nothing, so it deliberately does not subscribe — two subscriptions to the
  // same list would mean every keystroke-sized edit re-rendering twice.
  const projects = useQuery(api.courseProjects.listForCourse, { courseId });
  const reorderProjects = useMutation(api.courseProjects.reorderProjects);
  const deleteProject = useMutation(api.courseProjects.deleteProject);

  const [editingId, setEditingId] = useState<Id<"courseProjects"> | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  async function move(projectId: Id<"courseProjects">, direction: -1 | 1) {
    const ids = (projects ?? []).map((project) => project._id);
    const index = ids.indexOf(projectId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ids.length) return;

    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];

    setBusy(true);
    try {
      await reorderProjects({ courseId, projectIds: next });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(projectId: Id<"courseProjects">) {
    setBusy(true);
    try {
      await deleteProject({ projectId });
      toast.success("Project removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">What learners can build</h3>
          <p className="text-sm text-muted-foreground">
            These appear on the public course page beside the syllabus, and are
            the clearest answer to &ldquo;what will I be able to do when I&rsquo;m
            done?&rdquo;
          </p>
        </div>
        <Button
          onClick={() => {
            setCreating((open) => !open);
            setEditingId(null);
          }}
          disabled={creating}
        >
          <Plus aria-hidden />
          Add project
        </Button>
      </div>

      {creating ? (
        <ProjectForm
          courseId={courseId}
          onDone={() => setCreating(false)}
        />
      ) : null}

      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 && !creating ? (
        <InstructorProjectsPreview courseId={courseId} canEdit />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project, index) => (
            <li
              key={project._id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              {editingId === project._id ? (
                <ProjectForm
                  courseId={courseId}
                  project={project}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h4 className="font-semibold leading-snug">{project.title}</h4>
                      <p className="text-sm leading-[1.7] whitespace-pre-line text-muted-foreground">
                        {project.description}
                      </p>
                      {project.outcome ? (
                        <p className="text-sm font-medium">{project.outcome}</p>
                      ) : null}
                      {project.techStack.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {project.techStack.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move up"
                        disabled={busy || index === 0}
                        onClick={() => move(project._id, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={
                          busy || index === projects.length - 1
                        }
                        onClick={() => move(project._id, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit project"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(project._id);
                          setCreating(false);
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove project"
                        disabled={busy}
                        onClick={() => destroy(project._id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The create and edit form — one component, because it is one shape. */
function ProjectForm({
  courseId,
  project,
  onDone,
}: {
  courseId: Id<"courses">;
  /** Absent when creating. */
  project?: {
    _id: Id<"courseProjects">;
    title: string;
    description: string;
    imageUrl: string | null;
    outcome: string | null;
    techStack: string[];
  };
  onDone: () => void;
}) {
  // Only the writes this form needs — the list it belongs to is read once by the
  // editor above, not again per row.
  const createProject = useMutation(api.courseProjects.createProject);
  const updateProject = useMutation(api.courseProjects.updateProject);

  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [imageUrl, setImageUrl] = useState(project?.imageUrl ?? "");
  const [outcome, setOutcome] = useState(project?.outcome ?? "");
  // Stored as a string and split on a comma, because a tag input with removable
  // chips is a lot of machinery for a field that is, in practice, a comma list.
  const [techStack, setTechStack] = useState(project?.techStack.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const draftError = projectDraftError({ title, description, outcome });
    if (draftError) {
      toast.error(draftError);
      return;
    }

    const stack = normalizeTechStack(
      techStack.split(",").map((tag) => tag.trim()),
    );
    if (techStack.split(",").filter((tag) => tag.trim().length > 0).length > TECH_STACK_MAX_TAGS) {
      toast.error(`List at most ${TECH_STACK_MAX_TAGS} tools.`);
      return;
    }

    const payload = {
      title,
      description,
      imageUrl: normalizeOptionalText(imageUrl),
      techStack: stack,
      outcome: normalizeOptionalText(outcome),
    };

    setSaving(true);
    try {
      if (project) {
        await updateProject({ projectId: project._id, ...payload });
        toast.success("Project updated.");
      } else {
        await createProject({ courseId, ...payload });
        toast.success("Project added.");
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const formId = project ? `project-${project._id}` : "project-new";

  return (
    <form
      id={formId}
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-title`}>Title</Label>
        <Input
          id={`${formId}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={PROJECT_TITLE_MAX_LENGTH}
          disabled={saving}
          placeholder="A portfolio site"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-description`}>What they build</Label>
        <Textarea
          id={`${formId}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
          disabled={saving}
          rows={3}
          placeholder="A responsive one-pager with a projects grid and a contact form."
        />
        <p className="text-xs text-muted-foreground">
          {description.trim().length}/{PROJECT_DESCRIPTION_MAX_LENGTH} characters
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-outcome`}>
          Outcome{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={`${formId}-outcome`}
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          maxLength={PROJECT_OUTCOME_MAX_LENGTH}
          disabled={saving}
          placeholder="Something you can send to anyone"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-stack`}>
          Tools used{" "}
          <span className="font-normal text-muted-foreground">
            (comma separated, optional)
          </span>
        </Label>
        <Input
          id={`${formId}-stack`}
          value={techStack}
          onChange={(event) => setTechStack(event.target.value)}
          disabled={saving}
          placeholder="Next.js, Postgres, Tailwind"
        />
        <p className="text-xs text-muted-foreground">
          At most {TECH_STACK_MAX_TAGS}. Duplicates are dropped.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-image`}>
          Screenshot URL{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id={`${formId}-image`}
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          disabled={saving}
          placeholder="https://…"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 aria-hidden className="animate-spin" />}
          {project ? "Save changes" : "Add project"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          <X aria-hidden />
          Cancel
        </Button>
      </div>
    </form>
  );
}