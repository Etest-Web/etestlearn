import { describe, expect, it } from "vitest";
import { GENERIC_ERROR_MESSAGE, getErrorMessage } from "./errors";

/** Exactly the string the Convex client hands a `catch` in a dev deployment. */
function convexDevMessage(fn: string, thrown: string): string {
  return [
    `[CONVEX M(${fn})] Uncaught Error: ${thrown}`,
    `    at handler (convex/${fn.split(":")[0]}.ts:189:9)`,
    `    at async call (node_modules/.pnpm/convex@1.45.0/index.js:12:3)`,
    `  Called by client`,
  ].join("\n");
}

describe("getErrorMessage", () => {
  describe("strips the Convex decoration", () => {
    it("reduces a dev-deployment error to the server's own sentence", () => {
      expect(
        getErrorMessage(new Error(convexDevMessage("quizzes:submitQuizAttempt", "Please wait 30 seconds before trying again"))),
      ).toBe("Please wait 30 seconds before trying again");
    });

    it("drops the function path, the stack and the client trailer", () => {
      const message = convexDevMessage("discussions:postMessage", "You're posting too quickly — please wait a moment");
      const result = getErrorMessage(new Error(message));

      expect(result).toBe("You're posting too quickly — please wait a moment");
      expect(result).not.toContain("[CONVEX");
      expect(result).not.toContain("at handler");
      expect(result).not.toContain("Called by client");
      expect(result).not.toContain("node_modules");
    });

    it("handles the Q and A prefixes too", () => {
      expect(
        getErrorMessage(new Error("[CONVEX Q(courses:getBySlug)] Uncaught Error: Course not found\n  Called by client")),
      ).toBe("Course not found");
      expect(
        getErrorMessage(new Error("[CONVEX A(paystack:verify)] Uncaught Error: Verification failed\n  Called by client")),
      ).toBe("Verification failed");
    });

    it("leaves an undecorated message alone", () => {
      expect(getErrorMessage(new Error("Task not found"))).toBe("Task not found");
    });

    it("strips a bare Error: prefix", () => {
      expect(getErrorMessage(new Error("Error: Something specific happened"))).toBe(
        "Something specific happened",
      );
    });

    it("strips a ConvexError prefix but keeps the payload", () => {
      expect(getErrorMessage(new Error("Uncaught ConvexError: Already reviewed"))).toBe(
        "Already reviewed",
      );
    });

    it("routes a TypeError to the fallback instead of showing engine jargon", () => {
      // "Cannot read properties of undefined" explains nothing to a learner —
      // the contextual fallback is strictly more useful than the raw text.
      expect(
        getErrorMessage(
          new Error("Uncaught TypeError: Cannot read properties of undefined"),
          "Could not save your changes",
        ),
      ).toBe("Could not save your changes");
    });
  });

  describe("translates plumbing into instruction", () => {
    it.each([
      ["Not authenticated", "Please sign in to continue."],
      ["Not authorized", "You don't have permission to do that."],
      [
        "Not authorized — admin access required",
        "You don't have permission to do that. Admins only.",
      ],
      ["Account suspended", "Your account has been suspended. Please contact support."],
    ])("maps %j", (thrown, expected) => {
      expect(getErrorMessage(new Error(convexDevMessage("users:getCurrentUser", thrown)))).toBe(
        expected,
      );
    });

    it.each([
      "Could not reach Convex server",
      "Connection lost while action was in flight",
      "Failed to fetch",
      "Network Error",
    ])("maps %j to the offline message", (thrown) => {
      expect(getErrorMessage(new Error(thrown))).toBe(
        "You appear to be offline. Check your connection and try again.",
      );
    });
  });

  describe("falls back when there is nothing worth showing", () => {
    it("uses the caller's fallback for production redaction", () => {
      expect(
        getErrorMessage(
          new Error("[CONVEX M(quizzes:submitQuizAttempt)] Server Error\n  Called by client"),
          "Could not submit your quiz",
        ),
      ).toBe("Could not submit your quiz");
    });

    it("uses the caller's fallback when only a stack frame survives", () => {
      expect(
        getErrorMessage(
          new Error("[CONVEX M(users:sync)] Uncaught Error: \n    at handler (convex/users.ts:10:1)\n  Called by client"),
          "Could not save",
        ),
      ).toBe("Could not save");
    });

    it("uses the caller's fallback for a leaked TypeError", () => {
      expect(
        getErrorMessage(
          new Error("[CONVEX M(courses:update)] TypeError: x is not a function\n  Called by client"),
          "Could not update course",
        ),
      ).toBe("Could not update course");
    });

    it("uses the generic fallback when none is supplied", () => {
      expect(getErrorMessage(new Error("Server Error"))).toBe(GENERIC_ERROR_MESSAGE);
    });

    it("uses the fallback for values that are not errors", () => {
      expect(getErrorMessage(undefined, "Could not save")).toBe("Could not save");
      expect(getErrorMessage(null, "Could not save")).toBe("Could not save");
      expect(getErrorMessage(42, "Could not save")).toBe("Could not save");
      expect(getErrorMessage({}, "Could not save")).toBe("Could not save");
      expect(getErrorMessage(new Error(""), "Could not save")).toBe("Could not save");
    });

    it("passes a plain string through as the message", () => {
      expect(getErrorMessage("Something went wrong", "fallback")).toBe("Something went wrong");
    });
  });

  describe("keeps genuinely useful copy", () => {
    it.each([
      "Task not found",
      "You already handed in this assignment",
      "This assignment is closed and no longer accepts submissions",
      "That slug is already taken",
      "Please wait 30 seconds before trying again",
      "Too many requests — please wait 12 seconds before trying again",
      "Only the assignment's author, the course instructor or an admin can do that",
    ])("passes %j through unchanged", (thrown) => {
      expect(getErrorMessage(new Error(thrown))).toBe(thrown);
    });
  });

  describe("bounded output", () => {
    it("shortens a runaway message with an ellipsis", () => {
      const long = "Could not do the thing ".repeat(60).trim();
      const result = getErrorMessage(new Error(long));

      expect(result.length).toBeLessThanOrEqual(240);
      expect(result.endsWith("…")).toBe(true);
    });

    it("keeps a message just under the cap untouched", () => {
      const text = "a".repeat(240);
      expect(getErrorMessage(new Error(text))).toBe(text);
    });
  });

  describe("ConvexError structured payloads", () => {
    it("reads a string payload", () => {
      expect(getErrorMessage({ message: "Course not found" })).toBe("Course not found");
    });

    it("stringifies a structured payload rather than showing [object Object]", () => {
      expect(getErrorMessage({ message: "", data: { code: "NOT_FOUND" } })).toBe(
        '{"code":"NOT_FOUND"}',
      );
    });
  });
});
