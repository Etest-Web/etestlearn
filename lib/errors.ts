/**
 * One place that turns a caught error into copy a person can read.
 *
 * Convex does not hand the client the message a function threw. It decorates
 * it, so what lands in a `catch` looks like this:
 *
 *   [CONVEX M(quizzes:submitQuizAttempt)] Uncaught Error: Please wait 30 seconds before trying again
 *       at handler (convex/quizzes.ts:189:9)
 *       ...
 *     Called by client
 *
 * every part of which is for a developer: the function path, the `Uncaught
 * Error:` prefix, the server stack, the "Called by client" trailer. Put that
 * in a toast and the user is shown an error report instead of the sentence the
 * server actually wrote. Worse, on a *production* deployment Convex redacts
 * plain `Error` throws to a bare `Server Error`, which says nothing at all.
 *
 * So no call site reads `error.message`. They call `getErrorMessage`, which
 * strips the decoration, translates the few messages that are pure plumbing
 * into an instruction, and otherwise falls back to caller-supplied copy when
 * what survives is not worth showing a user.
 *
 * Deliberately pure — no sonner import. The same normalizer has to serve
 * toasts (`toast.error(getErrorMessage(...))`), inline error state
 * (`setError(getErrorMessage(...))`) and the root error boundary, and `lib/`
 * is shared with Convex, which must not end up depending on a UI library.
 */

/** Used when a call site supplies no fallback of its own. */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Toasts are not a place to read a paragraph. */
const MAX_LENGTH = 240;

/**
 * What a person should read for the handful of messages that are plumbing
 * rather than prose. Matched against the fully unwrapped message, so these are
 * exactly the strings the server wrote. Empty replacement means "we have
 * nothing better than the caller's fallback".
 */
const OFFLINE_MESSAGE = "You appear to be offline. Check your connection and try again.";

const TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Identity. The auth helpers say "Not authenticated" because that is what
  // they checked; the user needs an instruction, not a status report.
  [/^not authenticated$/i, "Please sign in to continue."],
  [/^missing or invalid authentication\b/i, "Please sign in to continue."],
  [/^not authorized$/i, "You don't have permission to do that."],
  [
    /^not authorized — admin access required$/i,
    "You don't have permission to do that. Admins only.",
  ],
  [
    /^account suspended$/i,
    "Your account has been suspended. Please contact support.",
  ],

  // Transport. From in here a Convex outage, a lost wifi radio and a VPN
  // blocking the socket are indistinguishable — and "Could not reach Convex
  // server" names a vendor the user has never heard of.
  [/^could not reach convex server\b/i, OFFLINE_MESSAGE],
  [/^connection lost\b/i, OFFLINE_MESSAGE],
  [/^failed to fetch\b/i, OFFLINE_MESSAGE],
  [/^network error$/i, OFFLINE_MESSAGE],

  // Deliberately no translation: these are cases where the real cause never
  // reached the client (production redaction, or an error thrown before any
  // of our code ran), so the caller's own fallback is the best copy available.
  [/^server error$/i, ""],
  [/^internal server error$/i, ""],
  [/^application error\b/i, ""],
  [/^an error occurred in the server components\b/i, ""],
];

/**
 * Anything left over that still reads like an error report rather than a
 * sentence. Returning false here is what routes the message to the caller's
 * fallback instead of showing it.
 */
function looksReadable(text: string): boolean {
  if (!text) return false;
  // A file reference with line:column, i.e. `convex/quizzes.ts:189:9`. The
  // `\.\w+` is required so a legitimate time like "rescheduled to 10:30" —
  // which has a colon but no extension — is never mistaken for a stack frame.
  if (/\S+\.\w+:\d+:\d+/.test(text)) return false;
  return true;
}

/** Pull a string out of whatever was thrown, without assuming it is an Error. */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error === null || typeof error !== "object") return "";

  const value = error as { message?: unknown; data?: unknown };
  if (typeof value.message === "string" && value.message.length > 0) {
    return value.message;
  }
  // `ConvexError` carries its payload in `data`; for a string payload its
  // `message` already equals it, so this only matters for structured data.
  if (typeof value.data === "string" && value.data.length > 0) {
    return value.data;
  }
  if (value.data !== undefined && value.data !== null) {
    try {
      return JSON.stringify(value.data);
    } catch {
      return "";
    }
  }
  return "";
}

const CONVEX_PREFIX = /^\[CONVEX [^\]]*\]\s*/;
const CALLED_BY_CLIENT = /\s*Called by client\s*$/;
const STACK_LINE = /^\s+at\s/m;

/**
 * Convex labels a server-side `throw new Error("...")` as
 * `Uncaught Error: ...`, so this prefix is stripped and the rest is kept —
 * it is exactly the sentence our own code wrote. The bare `Error:` form is
 * covered too, since some paths surface `err.toString()` instead.
 */
const SERVER_ERROR_PREFIX = /^(?:Uncaught\s+)?Error\s*:\s*/;

/**
 * A JS engine error (`TypeError: x is not a function`) never came from our
 * `throw` statements — it is a bug that reached the user, and the text after
 * the colon is written for a developer. Detected *before* the prefix is
 * stripped so it can be routed to the caller's fallback instead of being
 * shown as though it were meaningful copy.
 */
const ENGINE_ERROR_PREFIX = /^(?:Uncaught\s+)?(?:TypeError|RangeError|ReferenceError|SyntaxError)\s*:\s*/;

/** Same shape as `SERVER_ERROR_PREFIX`, but for `ConvexError`. */
const CONVEX_ERROR_PREFIX = /^(?:Uncaught\s+)?ConvexError\s*:\s*/;

/**
 * Remove the Convex wrapper and anything below the first stack frame.
 * Returns null when what is left is a leaked engine error with nothing in it
 * a user could act on.
 *
 * Order matters: the stack has to go before the prefixes are stripped,
 * because those prefixes only lead a line that ends at the stack.
 */
function unwrap(message: string): string | null {
  let text = message.replace(CONVEX_PREFIX, "").replace(CALLED_BY_CLIENT, "");

  const stackStart = text.search(STACK_LINE);
  if (stackStart !== -1) text = text.slice(0, stackStart);
  text = text.trim();

  // Check for an engine error before stripping anything: after the prefix is
  // gone, "TypeError: x is not a function" is indistinguishable from a
  // deliberately-worded server message.
  if (ENGINE_ERROR_PREFIX.test(text)) return null;

  return text.replace(SERVER_ERROR_PREFIX, "").replace(CONVEX_ERROR_PREFIX, "").trim();
}

/** Null means "nothing here is worth showing" — use the caller's fallback. */
function translate(text: string): string | null {
  for (const [pattern, replacement] of TRANSLATIONS) {
    if (pattern.test(text)) return replacement.length > 0 ? replacement : null;
  }
  return looksReadable(text) ? text : null;
}

/** Keep a runaway message from wrapping a dozen lines inside a toast. */
function shorten(text: string): string {
  if (text.length <= MAX_LENGTH) return text;
  const cut = text.slice(0, MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Turn anything that was thrown into copy fit to show a user.
 *
 * `fallback` is the contextual sentence to use when the error carries nothing
 * readable — pass one, because "Could not save the grade" tells the user far
 * more than the generic default does.
 *
 * ```ts
 * } catch (err) {
 *   toast.error(getErrorMessage(err, "Could not save the grade"));
 * }
 * ```
 */
export function getErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE,
): string {
  const raw = messageOf(error);
  if (!raw) return fallback;

  const unwrapped = unwrap(raw);
  if (!unwrapped) return fallback;

  const readable = translate(unwrapped);
  return readable === null ? fallback : shorten(readable);
}
