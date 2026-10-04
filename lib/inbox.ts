/**
 * Pure logic for the inbox: message previews, unread arithmetic and the day
 * grouping behind the notifications feed.
 *
 * Kept out of Convex (like `lib/certificates.ts`) so it can be unit tested in
 * `lib/inbox.test.ts` — the only co-located location vitest actually runs — and
 * reused from the client, which needs the same rules to render a badge or a
 * group header without duplicating the maths.
 */

/** Longest preview stored on a `dmThreads` row. The thread list truncates to this. */
export const MESSAGE_PREVIEW_LENGTH = 90;

/** Ceiling for the unread badge in the header. Matches the convention of every inbox. */
export const UNREAD_BADGE_CAP = 99;

/** Longest notification body rendered before the line clamp takes over. */
export const NOTIFICATION_PREVIEW_LENGTH = 160;

/**
 * One-line preview of a message body for the thread list.
 *
 * Whitespace is collapsed first so a multi-line paste does not blow the layout
 * or smuggle a newline into a single-line element, then the result is cut on a
 * word boundary so previews never end mid-word. Falls back to a hard cut when
 * the first word is itself longer than the budget.
 */
export function buildMessagePreview(
  body: string,
  maxLength: number = MESSAGE_PREVIEW_LENGTH,
): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;

  const hardCut = collapsed.slice(0, maxLength);
  const lastSpace = hardCut.lastIndexOf(" ");
  // `…` is one character, so give it a slot in the budget rather than
  // appending past it. With no space in range (one very long word) there is no
  // word boundary to cut on, so the text itself gives up the character.
  const cut =
    lastSpace > 0
      ? hardCut.slice(0, lastSpace)
      : hardCut.slice(0, Math.max(0, maxLength - 1));

  return `${cut.trimEnd()}…`;
}

/**
 * How many of `messages` the viewer has not read.
 *
 * Unread state is a high-water mark (`dmReadMarkers.lastReadAt`), not a flag per
 * message, so the rule lives here: anything strictly newer than the marker and
 * written by somebody else. `lastReadAt` of 0 (no marker row yet) makes the
 * whole thread unread, which is the correct default for a thread just opened.
 *
 * The caller's own messages can never appear above their own marker —
 * `sendMessage` advances it in the same transaction — but the sender check stays
 * so the rule is correct even if a message is inserted out of band.
 */
export function countUnreadMessages(
  messages: Array<{ senderId: string; createdAt: number }>,
  viewerId: string,
  lastReadAt: number,
): number {
  return messages.filter(
    (message) => message.senderId !== viewerId && message.createdAt > lastReadAt,
  ).length;
}

/**
 * Formats an unread count for a badge: plain below the cap, `99+` above it.
 *
 * A badge wider than three digits pushes the layout around and tells the reader
 * nothing extra — the inbox itself has the exact number.
 */
export function formatUnreadBadge(
  count: number,
  cap: number = UNREAD_BADGE_CAP,
): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return safe > cap ? `${cap}+` : String(safe);
}

/**
 * Stable machine key for the calendar day a notification belongs to.
 *
 * `"today"` and `"yesterday"` are relative labels; anything older falls back to
 * a `year-month-day` key parsed from local time, so grouping and labelling agree
 * with what the reader sees on their own clock rather than UTC.
 */
export function notificationDayBucket(
  timestamp: number,
  now: number,
): "today" | "yesterday" | string {
  const item = new Date(timestamp);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const itemMidnight = new Date(item);
  itemMidnight.setHours(0, 0, 0, 0);

  if (itemMidnight.getTime() === today.getTime()) return "today";
  if (itemMidnight.getTime() === yesterday.getTime()) return "yesterday";

  return `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
}

/** Human heading for a bucket key from {@link notificationDayBucket}. */
export function notificationDayLabel(bucket: string, now: number): string {
  if (bucket === "today") return "Today";
  if (bucket === "yesterday") return "Yesterday";

  const [year, month, day] = bucket.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || Number.isNaN(year)) {
    return "Earlier";
  }

  const sameYear = year === new Date(now).getFullYear();
  return new Date(year, month, day).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export interface NotificationGroup<T> {
  /** Bucket key — stable, so it can key a list without colliding on labels. */
  key: string;
  label: string;
  items: T[];
}

/**
 * Groups an already newest-first list into day buckets.
 *
 * Input order is preserved inside and across groups, so the caller keeps the
 * server's ordering instead of re-sorting (and losing it) here. Group order
 * follows first appearance, which for a newest-first list is newest day first.
 */
export function groupNotificationsByDay<T extends { createdAt: number }>(
  notifications: readonly T[],
  now: number,
): Array<NotificationGroup<T>> {
  const groups: Array<NotificationGroup<T>> = [];
  const byKey = new Map<string, NotificationGroup<T>>();

  for (const notification of notifications) {
    const key = notificationDayBucket(notification.createdAt, now);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: notificationDayLabel(key, now), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(notification);
  }

  return groups;
}

/**
 * One-line preview of a notification body.
 *
 * Shares {@link buildMessagePreview}'s whitespace collapsing and word-boundary
 * cut; the longer budget is because a notification is a full-width row rather
 * than a single-line list cell.
 */
export function buildNotificationPreview(
  body: string,
  maxLength: number = NOTIFICATION_PREVIEW_LENGTH,
): string {
  return buildMessagePreview(body, maxLength);
}
