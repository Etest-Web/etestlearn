"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";
import { TriangleAlert } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The raw error still goes to the console — that is where the digest, the
    // stack and the server-side message belong.
    console.error(error);
  }, [error]);

  // `tone="warning"` is what distinguishes a failure from a calm page — the
  // copy alone would otherwise read the same as an empty list. The word "went
  // wrong" and the icon carry the state, so the colour is not doing it alone.
  // EmptyState's title is set in the display face, so the page keeps the voice.
  //
  // The description is the normalized message rather than a fixed sentence: a
  // thrown `Error` reaches the browser as "Server Error" in production, and an
  // unmapped exception is not something to put in front of a learner verbatim.
  // `getErrorMessage` decides whether this failure is one we can name.
  const reason = getErrorMessage(
    error,
    "An unexpected error occurred. Please try again — if the problem persists, refresh the page or come back later.",
  );

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      {/* EmptyState owns an h3; the sr-only h1 keeps this page's heading in the
          document outline. */}
      <h1 className="sr-only">Something went wrong</h1>
      <EmptyState
        icon={TriangleAlert}
        tone="warning"
        title="Something went wrong"
        description={reason}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/")}>
              Go home
            </Button>
          </div>
        }
      />
    </main>
  );
}