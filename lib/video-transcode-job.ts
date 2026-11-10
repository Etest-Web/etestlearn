/**
 * Pure policy for the Phase 3 transcode job (GitHub Actions + B2).
 *
 * No `node:` imports and no Convex imports: the HTTP boundary
 * (`convex/http.ts`), the job mutations (`convex/videoTranscodeJobs.ts`) and
 * the root test suite all read the same rules from here. The workflow's
 * `scripts/video-transcode.mjs` cannot import TypeScript, so it repeats the
 * two object-key shapes — keep the two in sync if the layout ever changes.
 *
 * The layout is exactly what the Cloudflare Worker allowlist in
 * `edge/cdn-worker/src/policy.ts` serves:
 *
 *   hls/<assetId>/master.m3u8
 *   hls/<assetId>/<variant>/index.m3u8
 *   hls/<assetId>/<variant>/seg_<n>.ts
 */

import { z } from "zod";

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IV_HEX_PATTERN = /^[0-9a-f]{32}$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EVENT_TYPE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** `video-transcode` is the `repository_dispatch` type the workflow listens for. */
export const DEFAULT_TRANSCODE_EVENT_TYPE = "video-transcode";

/** Longest source the worker will transcode; matches the 2 GB upload ceiling's practical use. */
export const MAX_TRANSCODE_DURATION_SECONDS = 12 * 60 * 60;

/**
 * The B2 ladder. Variant numbers are folder names under the asset prefix, so
 * they are part of the Worker contract and must stay 0 and 1.
 */
const VARIANT_BY_HEIGHT: Readonly<
  Record<number, { variant: number; label: string }>
> = {
  360: { variant: 0, label: "360p" },
  720: { variant: 1, label: "720p" },
};

export function isSafeAssetId(assetId: string): boolean {
  return ASSET_ID_PATTERN.test(assetId);
}

export function hlsPrefixOf(assetId: string): string {
  return `hls/${assetId}`;
}

export function masterPlaylistKeyOf(assetId: string): string {
  return `${hlsPrefixOf(assetId)}/master.m3u8`;
}

export function variantPlaylistKeyOf(assetId: string, variant: number): string {
  return `${hlsPrefixOf(assetId)}/${variant}/index.m3u8`;
}

/** The exact shape the Worker's `ALLOWED_MEDIA_PATH` accepts. */
export function isTranscodeObjectKey(assetId: string, key: string): boolean {
  if (!isSafeAssetId(assetId)) return false;
  const prefix = `${hlsPrefixOf(assetId)}/`;
  if (!key.startsWith(prefix)) return false;
  return /^(?:master\.m3u8|[0-9]{1,2}\/(?:index\.m3u8|seg_[0-9]{1,6}\.ts))$/.test(
    key.slice(prefix.length),
  );
}

/* ── HTTP boundary schemas ──────────────────────────────────────────────────
 * The job endpoints are called by a GitHub runner, not a browser. `v.*` still
 * validates the mutation arguments; these schemas run first so a malformed
 * body is a 400 instead of a server-side throw, and so numeric values are
 * integers before they reach a Convex validator.
 */

export const transcodeClaimRequestSchema = z.strictObject({
  assetId: z.string().regex(ASSET_ID_PATTERN),
});

export const transcodeVariantReportSchema = z.object({
  variant: z.number().int().min(0).max(9),
  label: z.string().min(1).max(16),
  height: z.number().int().min(1).max(4320),
  width: z.number().int().min(2).max(7680).optional(),
  bitrate: z.number().int().min(1).max(50_000_000),
  bandwidth: z.number().int().min(1).max(60_000_000),
});

export const transcodeCompleteRequestSchema = z.strictObject({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  durationSeconds: z.number().positive().max(MAX_TRANSCODE_DURATION_SECONDS),
  variants: z.array(transcodeVariantReportSchema).min(1).max(2),
  masterPlaylistKey: z.string().min(1).max(200),
  variantPlaylistKeys: z
    .array(
      z.object({
        variant: z.number().int().min(0).max(9),
        key: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(2),
});

export const transcodeFailRequestSchema = z.strictObject({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  errorMessage: z.string().min(1).max(500),
});

export const transcodeProgressRequestSchema = z.strictObject({
  assetId: z.string().regex(ASSET_ID_PATTERN),
  progress: z.number().int().min(0).max(100),
});

export type TranscodeVariantReport = z.infer<typeof transcodeVariantReportSchema>;
export type TranscodeCompleteRequest = z.infer<typeof transcodeCompleteRequestSchema>;

export type TranscodeReport = {
  durationSeconds: number;
  variants: ReadonlyArray<TranscodeVariantReport>;
  masterPlaylistKey: string;
  variantPlaylistKeys: ReadonlyArray<{ variant: number; key: string }>;
};

/**
 * Check a completion report before it becomes a `ready` asset. Every refusal
 * here is a shape the Worker would not serve, or a ladder the playback layer
 * would build URLs that 404 against.
 */
export function transcodeReportError(assetId: string, report: TranscodeReport): string | null {
  if (!isSafeAssetId(assetId)) return "Invalid video asset id";
  if (
    !Number.isFinite(report.durationSeconds) ||
    report.durationSeconds <= 0 ||
    report.durationSeconds > MAX_TRANSCODE_DURATION_SECONDS
  ) {
    return "Invalid video duration";
  }
  if (report.variants.length < 1 || report.variants.length > 2) {
    return "Unexpected variant count";
  }
  if (report.masterPlaylistKey !== masterPlaylistKeyOf(assetId)) {
    return "Master playlist key does not match the asset";
  }
  if (report.variantPlaylistKeys.length !== report.variants.length) {
    return "Every variant needs exactly one playlist";
  }

  const seenVariants = new Set<number>();
  for (const variant of report.variants) {
    const expected = VARIANT_BY_HEIGHT[variant.height];
    if (!expected) return `Unsupported variant height: ${variant.height}`;
    if (variant.variant !== expected.variant) {
      return `Variant ${variant.variant} does not match ${variant.height}p`;
    }
    if (variant.label !== expected.label) {
      return `Variant label ${variant.label} does not match ${variant.height}p`;
    }
    if (seenVariants.has(variant.variant)) return "Duplicate variant";
    if (!Number.isInteger(variant.bitrate) || variant.bitrate <= 0) {
      return "Invalid variant bitrate";
    }
    if (!Number.isInteger(variant.bandwidth) || variant.bandwidth < variant.bitrate) {
      return "Invalid variant bandwidth";
    }
    if (
      variant.width !== undefined &&
      (!Number.isInteger(variant.width) || variant.width <= 0)
    ) {
      return "Invalid variant width";
    }
    seenVariants.add(variant.variant);
  }

  const seenKeys = new Set<string>();
  for (const playlist of report.variantPlaylistKeys) {
    if (!seenVariants.has(playlist.variant)) {
      return "Playlist references an unreported variant";
    }
    if (seenKeys.has(playlist.key)) return "Duplicate variant playlist";
    if (playlist.key !== variantPlaylistKeyOf(assetId, playlist.variant)) {
      return "Variant playlist key does not match the asset";
    }
    seenKeys.add(playlist.key);
  }
  return null;
}

/** A random 16-byte IV, minted once per asset and reused by every retry. */
export function randomIvHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isIvHex(value: string): boolean {
  return IV_HEX_PATTERN.test(value);
}

/* ── Shared-secret boundary ──────────────────────────────────────────────── */

function timingSafeEqualString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

/**
 * The job endpoints are session-less: the GitHub runner holds only
 * `VIDEO_TRANSCODE_TOKEN`. Missing configuration is a refusal (the caller
 * returns 503), a wrong or absent bearer token a 401.
 */
export function isAuthorizedTranscodeCall(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  return timingSafeEqualString(authorization.slice(prefix.length), secret);
}

/* ── GitHub dispatch ─────────────────────────────────────────────────────── */

export type GithubDispatchConfig = {
  repo: string;
  token: string;
  eventType: string;
};

export type GithubDispatchEnv = {
  token?: string;
  repo?: string;
  eventType?: string;
};

/**
 * Missing dispatch configuration is not fatal: the asset stays `queued` and
 * can be started with the workflow's manual `workflow_dispatch` input. A
 * malformed repo/event name is refused the same way rather than sent to the
 * GitHub API.
 */
export function githubDispatchConfig(env: GithubDispatchEnv): GithubDispatchConfig | null {
  const token = env.token?.trim();
  const repo = env.repo?.trim();
  if (!token || !repo || !REPO_PATTERN.test(repo)) return null;
  const eventType = env.eventType?.trim() || DEFAULT_TRANSCODE_EVENT_TYPE;
  if (!EVENT_TYPE_PATTERN.test(eventType)) return null;
  return { repo, token, eventType };
}

export function repositoryDispatchBody(
  assetId: string,
  eventType: string,
): { event_type: string; client_payload: { assetId: string } } {
  return { event_type: eventType, client_payload: { assetId } };
}
