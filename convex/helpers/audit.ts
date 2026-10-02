import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

type MutationCtx = GenericMutationCtx<DataModel>;

export interface AuditEntry {
  /** Who performed the action. Required — anonymous audit rows are useless. */
  actorId: Id<"users">;
  /** Stable dotted action name, e.g. "user.set_role" or "certificate.revoke". */
  action: string;
  /** What kind of object was affected, e.g. "user", "certificate". */
  targetType?: string;
  /** Id (or public serial) of the affected object, as a string. */
  targetId?: string;
  /**
   * Action-specific context: old/new role, revocation reason, etc. Kept
   * flat and primitive so entries stay greppable without JSON parsing.
   */
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Appends one row to the `auditLogs` table.
 *
 * Called at the end of privileged mutations so role changes, certificate
 * revocations and application reviews leave an immutable trail. Best-effort
 * by design: the audit write shares the caller's transaction, so if the
 * privileged write commits, the audit row commits with it — there is no
 * window where an action succeeds but is unlogged. It also cannot fail
 * separately from the action itself.
 *
 * Never log secrets, tokens or raw PII beyond ids here.
 */
export async function logAudit(
  ctx: MutationCtx,
  entry: AuditEntry,
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ? JSON.stringify(entry.details) : undefined,
    createdAt: Date.now(),
  });
}
