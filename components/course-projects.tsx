"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { Hammer } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, Skeleton } from "@/components/ui";

/**
 * "What you'll be able to build" — the instructor's showcase on a course page.
 *
 * The most persuasive block on a sales page and the least informative one in a
 * syllabus, which is why it is instructor-authored, explicitly ordered, and
 * rendered beside the lessons rather than inside them. See
 * `convex/courseProjects.ts` for why it is display-only: a learner cannot submit
 * work here.
 *
 * Renders **nothing at all** for a course with no projects rather than an empty
 * section — an empty "projects" heading on a course that has none reads as a
 * gap in the course rather than as a decision by the instructor not to add one.
 * The course page relies on this to decide whether to show the tab at all.
 */
export function CourseProjects({ courseId }: { courseId: Id<"courses"> }) {
  const projects = useQuery(api.courseProjects.listForCourse, { courseId });

  if (projects === undefined) {
    return <Skeleton className="h-48 w-full rounded-sm" />;
  }

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Hammer aria-hidden className="h-4 w-4 text-primary" />
          What you&apos;ll be able to build
        </h3>
        <p className="text-sm text-muted-foreground">
          Finished projects from learners who complete this course.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {projects.map((project) => (
          <article
            key={project._id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
          >
            {project.imageUrl ? (
              <Image
                src={project.imageUrl}
                alt={project.title}
                width={640}
                height={360}
                className="h-40 w-full object-cover"
              />
            ) : null}

            <div className="flex flex-1 flex-col gap-3 p-4">
              <h4 className="font-semibold leading-snug text-foreground">
                {project.title}
              </h4>

              <p className="text-sm leading-[1.7] whitespace-pre-line text-muted-foreground">
                {project.description}
              </p>

              {project.outcome ? (
                <p className="text-sm font-medium text-foreground">
                  {project.outcome}
                </p>
              ) : null}

              {project.techStack.length > 0 ? (
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {project.techStack.map((tag) => (
                    <Badge key={tag} variant="secondary" className="px-2 py-0.5 text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * The same showcase, for a page that already knows there are none.
 *
 * Kept separate from {@link CourseProjects} so the "no projects yet" copy — which
 * only an instructor editing their own course should ever read — cannot appear
 * on a public course page.
 */
export function InstructorProjectsPreview({
  courseId,
  canEdit,
}: {
  courseId: Id<"courses">;
  canEdit: boolean;
}) {
  const projects = useQuery(api.courseProjects.listForCourse, { courseId });

  if (projects === undefined) {
    return <Skeleton className="h-32 w-full rounded-sm" />;
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Hammer}
        tone="neutral"
        title={canEdit ? "No projects added yet" : "No projects listed"}
        description={
          canEdit
            ? "Add the things learners will be able to build by the end of this course. They appear on the public course page."
            : "This instructor has not listed any projects for this course."
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <div
          key={project._id}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
        >
          <h4 className="font-semibold leading-snug">{project.title}</h4>
          <p className="text-sm leading-[1.7] whitespace-pre-line text-muted-foreground">
            {project.description}
          </p>
          {project.techStack.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {project.techStack.map((tag) => (
                <Badge key={tag} variant="secondary" className="px-2 py-0.5 text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}