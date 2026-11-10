"use client";

import { useState } from "react";

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";

const NO_MODULE = "__none__";
const NEW_MODULE = "__new__";

/**
 * A lesson's `section` is a plain string on the row — there is no modules
 * table — so a "module" is just the label the instructor gave a group of
 * lessons. This picker keeps that model but makes it visible: the existing
 * labels become a dropdown, and "New module…" reveals the free-text field for
 * a group that does not exist yet.
 */
export function CourseSectionPicker({
  id,
  value,
  sections,
  onChange,
  noneLabel = "No module",
}: {
  id: string;
  value: string;
  sections: readonly string[];
  onChange: (value: string) => void;
  noneLabel?: string;
}) {
  const options = sectionOptions(sections);
  // The free-text field is shown for a value that is not (yet) an existing
  // module, or after the instructor explicitly picks "New module…".
  const [creatingNew, setCreatingNew] = useState(false);
  const isNewModule = creatingNew || (value !== "" && !options.includes(value));

  return (
    <div className="space-y-2">
      <Select
        value={isNewModule ? NEW_MODULE : value === "" ? NO_MODULE : value}
        onValueChange={(next) => {
          if (next === NO_MODULE) {
            setCreatingNew(false);
            onChange("");
            return;
          }
          if (next === NEW_MODULE) {
            setCreatingNew(true);
            onChange("");
            return;
          }
          setCreatingNew(false);
          onChange(next ?? "");
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(selected: string | null) =>
              selected === NO_MODULE
                ? noneLabel
                : selected === NEW_MODULE
                  ? "New module…"
                  : (selected ?? "")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MODULE}>{noneLabel}</SelectItem>
          {options.map((section) => (
            <SelectItem key={section} value={section}>
              {section}
            </SelectItem>
          ))}
          <SelectItem value={NEW_MODULE}>New module…</SelectItem>
        </SelectContent>
      </Select>
      {isNewModule && (
        <Input
          aria-label="New module name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Module 1"
          autoFocus
        />
      )}
    </div>
  );
}

/**
 * The distinct module labels of a course, in curriculum order rather than
 * alphabetical order — the dropdown reads the same way the curriculum does.
 */
export function sectionOptions(
  sections: readonly string[],
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const section of sections) {
    const label = section.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push(label);
  }
  return options;
}

/** Module labels from a lesson list, ordered by lesson position. */
export function courseSections(
  lessons: ReadonlyArray<{ section?: string | null; order: number }>,
): string[] {
  return sectionOptions(
    [...lessons]
      .sort((a, b) => a.order - b.order)
      .map((lesson) => lesson.section ?? ""),
  );
}
