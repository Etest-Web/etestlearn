import type { Doc } from "../_generated/dataModel";
import type { ReadCtx } from "./auth";

export type TemplateDoc = Doc<"certificateTemplates">;

/**
 * The installed certificate template, or null when there is none.
 *
 * There is exactly one template by design, so "the active one" is a single row
 * rather than a choice out of a list. `first()` rather than `unique()`: a
 * database written before the singleton rule could hold a second row, and a
 * query that throws while reading the design would take certificate rendering
 * down with it.
 */
export async function getInstalledTemplate(
  ctx: ReadCtx,
): Promise<TemplateDoc | null> {
  return await ctx.db
    .query("certificateTemplates")
    .withIndex("by_active", (q) => q.eq("active", true))
    .first();
}
