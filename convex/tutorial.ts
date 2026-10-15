import { mutation } from "./_generated/server";
import { requireUser } from "./helpers/auth";

/**
 * The guided product tour has one piece of server state: whether a user has
 * already seen it.
 *
 * That flag is the difference between "onboarding" and "a modal that will not
 * go away", so it lives on the user rather than in `localStorage` — a tour
 * dismissed on a laptop should not reappear on the phone, and a support agent
 * answering "why does this keep opening?" needs an answer that is not per-tab.
 *
 * There is deliberately no `reset`: replaying the tour is a *client* action
 * (the Settings card just opens it again), and nothing in the product needs to
 * make it auto-open a second time. Adding a reset would only create a way for a
 * bug to relock a finished account into onboarding.
 *
 * Self-service and unprivileged, so it is intentionally not audited — the
 * `tourCompletedAt` timestamp on the row is the whole record.
 */
export const completeTour = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // First write wins. A double click, a stale tab finishing after another,
    // or a replay all land here, and none of them should move the timestamp
    // forward — "completed at" is when the user first got through it.
    if (user.tourCompletedAt !== undefined) {
      return { completed: true, firstCompletion: false };
    }

    await ctx.db.patch(user._id, { tourCompletedAt: Date.now() });
    return { completed: true, firstCompletion: true };
  },
});
