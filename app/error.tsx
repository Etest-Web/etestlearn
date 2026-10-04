"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";
import { TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // `tone="warning"` is what distinguishes a failure from a calm page — the
  // copy alone would otherwise read the same as an empty list. The word "went
  // wrong" and the icon carry the state, so the colour is not doing it alone.
  // EmptyState's title is set in the display face, so the page keeps the voice.
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      {/* EmptyState owns an h3; the sr-only h1 keeps this page's heading in the
          document outline. */}
      <h1 className="sr-only">Something went wrong</h1>
      <EmptyState
        icon={TriangleAlert}
        tone="warning"
        title="Something went wrong"
        description="An unexpected error occurred. Please try again — if the problem persists, refresh the page or come back later."
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