"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, EmptyState } from "@/components/ui";
import { Boxes, Loader2 } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

/** Message envelope the in-iframe bridge posts to the parent. */
const BRIDGE_SOURCE = "glypha-scorm";

type LessonStatus = "passed" | "completed" | "failed" | "incomplete" | "browsed" | "not_attempted";

type CommitPayload = {
  lessonStatus?: LessonStatus;
  rawScore?: number;
  minScore?: number;
  maxScore?: number;
  scaledScore?: number;
  location?: string;
  suspendData?: string;
  cmiState?: string;
  totalTimeSeconds?: number;
};

const STATUSES = [
  "passed",
  "completed",
  "failed",
  "incomplete",
  "browsed",
  "not_attempted",
] as const;

/** Treat the cross-origin iframe payload as untrusted: pick only known fields. */
function readCommitPayload(raw: unknown): CommitPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const out: CommitPayload = {};
  if (typeof p.lessonStatus === "string" && (STATUSES as readonly string[]).includes(p.lessonStatus)) {
    out.lessonStatus = p.lessonStatus as LessonStatus;
  }
  for (const k of ["rawScore", "minScore", "maxScore", "scaledScore", "totalTimeSeconds"] as const) {
    if (typeof p[k] === "number" && Number.isFinite(p[k])) out[k] = p[k] as number;
  }
  for (const k of ["location", "suspendData", "cmiState"] as const) {
    if (typeof p[k] === "string") out[k] = p[k] as string;
  }
  return out;
}

/**
 * Embedded SCORM player.
 *
 * The package is served from the Convex site origin (a different origin from
 * the app), so the CMI runtime is injected *inside* the iframe by the delivery
 * route and forwards commits back over `postMessage`. This component mints a
 * short-lived asset token, seeds the runtime with the learner's prior state
 * (via the URL fragment), and relays commits to `commitSession` — which owns
 * the completion cascade to the enrollment and certificates.
 */
export function ScormPlayer({
  lessonId,
  onCompleted,
}: {
  lessonId: Id<"lessons">;
  onCompleted?: () => void;
}) {
  const pkg = useQuery(api.scorm.getScormPackageForLesson, { lessonId });
  const user = useQuery(api.users.getCurrentUser);
  const issueToken = useMutation(api.scorm.issueScormToken);
  const initializeSession = useMutation(api.scorm.initializeSession);
  const commitSession = useMutation(api.scorm.commitSession);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const packageId = pkg?._id;

  useEffect(() => {
    if (!packageId || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
        if (!site) throw new Error("SCORM playback is not configured");

        const [{ token }, snapshot] = await Promise.all([
          issueToken({ packageId }),
          initializeSession({ lessonId, packageId }),
        ]);

        const seed: Record<string, unknown> = {
          v: pkg?.version === "1.2" ? "1.2" : "2004",
          t: snapshot.totalTimeSeconds ?? 0,
          id: user._id,
          n: (user as { name?: string }).name ?? "Learner",
        };
        if (pkg?.masteryScore != null) seed.m = pkg.masteryScore;
        if (snapshot.cmiState) seed.s = snapshot.cmiState;

        const entry = (pkg?.entryPoint ?? "").replace(/^\/+/, "");
        const base = `${site}/scorm/${token}/${packageId}/${entry}`;
        const url = `${base}#scormInit=${encodeURIComponent(JSON.stringify(seed))}`;
        if (!cancelled) setFrameUrl(url);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e, "Could not load this SCORM module"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packageId, user, lessonId, pkg?.version, pkg?.masteryScore, pkg?.entryPoint, issueToken, initializeSession]);

  useEffect(() => {
    if (!frameUrl) return;
    const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    function onMessage(event: MessageEvent) {
      if (event.origin !== site) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as { source?: string; type?: string; payload?: unknown } | null;
      if (!data || data.source !== BRIDGE_SOURCE) return;

      if (data.type === "commit" || data.type === "finished") {
        const payload = readCommitPayload(data.payload);
        if (payload) {
          void commitSession({ lessonId, ...payload }).catch(() => {
            /* a dropped commit is retried on the next one / pagehide flush */
          });
        }
        if (data.type === "finished" && (payload?.lessonStatus === "passed" || payload?.lessonStatus === "completed")) {
          onCompletedRef.current?.();
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameUrl, lessonId, commitSession]);

  if (pkg === null) {
    return (
      <EmptyState
        icon={Boxes}
        title="No SCORM package"
        description="This lesson has no SCORM package attached yet."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Boxes}
        title="Could not load module"
        description={error}
        action={
          <Button onClick={() => window.location.reload()}>
            <Loader2 className="h-4 w-4" /> Retry
          </Button>
        }
      />
    );
  }

  if (!frameUrl) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading module…
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={frameUrl}
      title={pkg?.title ?? "SCORM module"}
      className="h-[600px] w-full rounded-md border border-rule bg-white"
      allow="autoplay; fullscreen; clipboard-write"
    />
  );
}