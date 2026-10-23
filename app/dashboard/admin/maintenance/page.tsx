"use client";

import { getErrorMessage } from "@/lib/errors";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
    AlertTriangle,
    ArrowRight,
    Loader2,
    Megaphone,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { PageShell } from "@/components/dashboard-shell";
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Label,
    PageHeader,
    Switch,
    Textarea,
} from "@/components/ui";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DEFAULT_MAINTENANCE_MESSAGE,
    MAINTENANCE_OVERRIDE_ENV,
    MAX_MAINTENANCE_MESSAGE_LENGTH,
    normalizeMaintenanceMessage,
} from "@/lib/maintenance";

/**
 * Mirrors `convex/maintenance.MaintenancePreflight`.
 *
 * Redeclared rather than imported for the same reason `proxy.ts` and
 * `app/maintenance/page.tsx` redeclare `MaintenanceStatus`: a client component
 * importing a type out of a Convex module pulls that module's graph into the
 * bundle unless the import is perfectly elided, and the shape is four fields.
 */
type Preflight = {
    identity: "resolved" | "none";
    user: "not_checked" | "found" | "missing" | "duplicate" | "suspended";
    role: "student" | "instructor" | "admin" | null;
    bypassWorks: boolean;
};

/**
 * Turns the preflight's enum into the fix, not just the symptom.
 *
 * These four sentences are the whole reason the panel exists. Every one of them
 * is a different repair — Clerk, the webhook, the database, the account itself —
 * and before this read existed they were all indistinguishable from outside,
 * because the gate reduces all of them to a 503.
 */
function explainBypass(preflight: Preflight): string {
    if (preflight.identity === "none") {
        return "No Clerk session resolved on this request. Either this browser is signed out, or the deployment is rejecting the session token — in which case check that CLERK_JWT_ISSUER_DOMAIN set on this Convex deployment matches the Clerk instance the site signs in against.";
    }
    if (preflight.user === "missing") {
        return "Your session resolved, but no user record matches it. The Clerk webhook that creates user records has not run for this account on this deployment — the usual cause after pushing code to a new Convex deployment, since env vars and data do not travel with the code.";
    }
    if (preflight.user === "duplicate") {
        return "More than one user record matches your session. Identity lookups read with .unique(), so every authenticated call throws and the gate refuses everyone — the duplicate row has to go first.";
    }
    if (preflight.user === "suspended") {
        return "This account is suspended. Suspension reads as signed out platform-wide, and the gate's exemption is no exception.";
    }
    return `This account resolves as a ${preflight.role}, and students are not exempt from the gate — only instructors and admins are.`;
}

/**
 * "Down since 17 Oct, 14:03 · 2 hours" — the same instant, twice.
 *
 * Rendered once rather than on an interval: the timestamp is the load-bearing
 * half and it never changes, so a ticking counter would buy no accuracy and
 * cost a re-render on a page whose only job is to be legible while something
 * else is broken.
 */
function describeDownSince(startedAt: number | null): string {
    if (startedAt === null) return "Live.";
    const when = new Date(startedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
    return `Down since ${when} · ${describeDuration(Date.now() - startedAt)}`;
}

function describeDuration(elapsedMs: number): string {
    const minutes = Math.max(0, Math.floor(elapsedMs / 60_000));
    if (minutes < 1) return "under a minute";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const rest = minutes % 60;
        return `${hours} hour${hours === 1 ? "" : "s"}${rest ? ` ${rest}m` : ""}`;
    }

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days} day${days === 1 ? "" : "s"}${restHours ? ` ${restHours}h` : ""}`;
}

/** "in 1h 42m" — the deadline expressed from wherever the reader is standing. */
function describeReleaseIn(startedAt: number | null): string {
    if (startedAt === null) return "";
    const remaining = startedAt - Date.now();
    if (remaining <= 0) return "any moment now";
    return `in ${describeDuration(remaining)}`;
}

/**
 * A timestamp as a `datetime-local` value, in the reader's own zone.
 *
 * `toISOString` would be UTC, and a picker that shows 14:00 while meaning 15:00
 * is worse than no picker at all — the operator would set a deadline an hour
 * out from the one they meant.
 */
function toLocalInputValue(ms: number | null): string {
    if (ms === null) return "";
    const at = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The maintenance switch.
 *
 * Three decisions worth naming, because all three are about the failure mode of
 * getting this wrong:
 *
 * **Turning it ON asks first.** This one control takes the storefront, the
 * catalogue and every learner's dashboard off the internet in a single write,
 * and an accidental click is invisible to the person who made it — the page
 * they are looking at will keep working for them, because staff are exempt from
 * the gate. So the on-switch goes through a confirm that spells out what is
 * about to stop working. Turning it OFF does not: the only harm from a stray
 * click is that the site comes back up early, which is the outcome everybody
 * wants anyway.
 *
 * **The switch refuses to arm while you would not get back in.** Being able to
 * turn it on and being able to turn it off are the same account, so arming it
 * while the exemption would not resolve for you is building a one-way door on
 * purpose. The preflight answers that before the site goes down, rather than
 * after. It cannot be the only protection — `setMode` still refuses server-side
 * — but it is the one that tells you in advance.
 *
 * **The message saves separately from the switch.** The message is inert until
 * the switch is on, so editing it must not require taking the site down to
 * store the text. An admin can compose the notice in advance and save it while
 * the site is still live.
 */
function MaintenanceBody() {
    const status = useQuery(api.maintenance.getStatus);
    const preflight = useQuery(api.maintenance.preflight);
    const setMode = useMutation(api.maintenance.setMode);

    const [message, setMessage] = useState<string | null>(null);
    const [allowApplications, setAllowApplications] = useState<boolean | null>(null);
    const [releaseAt, setReleaseAt] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Seed the form from the server once, then leave the admin's edits alone.
    // Without this guard the textarea would snap back to the stored note on
    // every re-render — the query re-runs after each save, and a live-controlled
    // textarea that overwrites itself is unusable.
    useEffect(() => {
        if (status === undefined) return;
        setMessage((current) => current ?? status.message);
        setAllowApplications((current) => current ?? status.allowInstructorApplications);
        // Empty while the site is up: the deadline belongs to a window that is
        // open, and there is nothing to move yet.
        setReleaseAt((current) => current ?? toLocalInputValue(status.disableAt));
    }, [status]);

    if (
        status === undefined ||
        preflight === undefined ||
        message === null ||
        allowApplications === null
    ) {
        return <Skeleton className="h-96 w-full rounded-2xl" />;
    }

    // Fail-safe rather than fail-open: until the deployment has answered, the
    // switch stays armed off. A skeleton that resolves into a disabled switch is
    // a far cheaper surprise than one that resolves into a one-way door.
    const bypassOk = preflight.bypassWorks;
    const enabled = status.enabled;
    const normalized = normalizeMaintenanceMessage(message);
    const messageDirty = normalized !== status.message;
    const applicationsDirty = allowApplications !== status.allowInstructorApplications;
    const detailsDirty = messageDirty || applicationsDirty;

    async function run(action: () => Promise<unknown>, success: string) {
        setPending(true);
        try {
            await action();
            toast.success(success);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, "That did not go through"));
            return false;
        } finally {
            setPending(false);
        }
    }

    // The switch sends `enabled` alone. `setMode` treats an omitted `message` as
    // "leave as it is", which is what stops the toggle from writing back a copy
    // of the note captured before somebody else edited it.
    const setEnabled = async (next: boolean): Promise<boolean> =>
        await run(
            () => setMode({ enabled: next }),
            next ? "Maintenance mode is on" : "Maintenance mode is off",
        );

    const saveDetails = async () => {
        const ok = await run(
            () =>
                setMode({
                    enabled: status.enabled,
                    message: normalized,
                    allowInstructorApplications: allowApplications,
                }),
            "Saved",
        );
        if (ok) {
            setMessage(normalized);
            setAllowApplications(allowApplications);
        }
    };

    // Moving the deadline of a window that is already open. `enabled` is sent
    // as it currently stands so the write cannot accidentally close the site,
    // and the server clamps whatever comes in — a mistyped year is not a
    // deadline, it is an outage nobody notices for months.
    const releaseAtMs = releaseAt ? new Date(releaseAt).getTime() : null;
    const releaseDirty =
        enabled &&
        releaseAtMs !== null &&
        Number.isFinite(releaseAtMs) &&
        releaseAtMs !== status.disableAt;

    const saveRelease = async () => {
        if (releaseAtMs === null || !Number.isFinite(releaseAtMs)) return;
        const ok = await run(
            () => setMode({ enabled: status.enabled, disableAt: releaseAtMs }),
            "Release time updated",
        );
        if (ok) setReleaseAt(toLocalInputValue(releaseAtMs));
    };

    return (
        <div className="space-y-6">
            {/* ── can this operator still get back in? ─────────────────────── */}
            {/* First on the page on purpose: the question it answers is the one
                that has to be settled before the switch below means anything. */}
            {!bypassOk ? (
                <Card className="border-destructive/40 bg-destructive/5 rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                        <ShieldAlert
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                            aria-hidden
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                                You would not get back in
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {explainBypass(preflight)}
                            </p>
                            <p className="mt-3 text-xs text-muted-foreground">
                                The switch is held off until this account resolves as exempt.
                                Turning it on right now would 503 you along with everyone else,
                                and this console is the only place to undo it.
                                {enabled &&
                                    " That appears to have happened already — fix the cause above, then reload and this panel clears."}
                            </p>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                    <p>
                        You can get back in. This session resolves to an{" "}
                        <span className="font-medium text-foreground">{preflight.role}</span>{" "}
                        account, which the gate exempts &mdash; so switching maintenance on stays
                        reversible from this console.
                    </p>
                </div>
            )}

            {/* ── the kill-switch is holding the site up ──────────────────── */}
            {/* Only ever a release, never a lockdown, so this cannot appear
                without somebody having pulled the lever deliberately. Worth
                saying plainly because the switch below will read "off" while
                the row still says otherwise. */}
            {status.overrideActive && (
                <Card className="border-warning/40 bg-warning/5 rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                        <ShieldAlert
                            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                            aria-hidden
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                                The kill-switch is holding the site up
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                <code className="text-xs">
                                    {MAINTENANCE_OVERRIDE_ENV}=off
                                </code>{" "}
                                is set on this Convex deployment, so the stored switch below is
                                being ignored and every visitor is seeing the site normally.
                                Nothing was written &mdash; the switch is still exactly where you
                                left it.
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                                To go back down, unset it with{" "}
                                <code className="text-xs">
                                    npx convex env unset {MAINTENANCE_OVERRIDE_ENV}
                                </code>
                                . The gate re-reads this within five seconds.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {enabled && (
                // The editorial system separates with rules and tints, never a
                // dashed outline — so this is a bordered card, not an alert box.
                <Card className="border-destructive/40 bg-destructive/5 rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                            aria-hidden
                        />
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                Maintenance mode is on
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Every visitor is getting the maintenance page except the instructor
                                application. You can still reach the admin console — that exemption is
                                why you are reading this.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
                {/* ── the switch ───────────────────────────────────────────── */}
                <Card className="rounded-2xl p-5">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Wrench className="h-4 w-4 text-brand" aria-hidden />
                            Availability
                        </CardTitle>
                        <CardDescription>
                            When this is on, the storefront, the course catalogue, certificate
                            verification and every dashboard answer with a 503 and the notice below.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0">
                        <div className="flex items-start justify-between gap-4 rounded-xl border border-rule p-4">
                            <div className="min-w-0">
                                <Label htmlFor="maintenance-switch" className="text-sm font-semibold">
                                    Maintenance mode
                                </Label>
                                <p
                                    className={
                                        enabled
                                            ? "mt-1 text-xs font-medium text-foreground tabular"
                                            : "mt-1 text-xs text-muted-foreground"
                                    }
                                >
                                    {enabled
                                        ? describeDownSince(status.enabledAt) +
                                          (status.disableAt !== null
                                              ? ` · releases ${describeReleaseIn(status.disableAt)}`
                                              : "")
                                        : bypassOk
                                          ? "The site is serving normally."
                                          : "Held off — see the note above."}
                                </p>
                            </div>
                            {enabled ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pending}
                                    onClick={() => void setEnabled(false)}
                                >
                                    {pending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                    ) : (
                                        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                                    )}
                                    Turn off
                                </Button>
                            ) : (
                                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                    <AlertDialogTrigger
                                        render={
                                            <Switch
                                                id="maintenance-switch"
                                                size="sm"
                                                // Refuses to arm while the exemption would not
                                                // resolve for this account. The confirm dialog
                                                // is unreachable when this is off, which is the
                                                // point — see `explainBypass` above.
                                                disabled={pending || !bypassOk}
                                                aria-label="Maintenance mode"
                                            />
                                        }
                                    />
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Take the site down?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Every visitor will get the maintenance page instead of the
                                                site, and the response becomes a 503 with{" "}
                                                <code className="text-xs">Retry-After</code>.{" "}
                                                {allowApplications
                                                    ? "Instructor applications stay open."
                                                    : "Instructor applications are currently closed too, so nothing at all will be reachable."}{" "}
                                                The site also releases itself two hours from now unless
                                                you move the deadline.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel disabled={pending}>
                                                Cancel
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                disabled={pending}
                                                onClick={(event) => {
                                                    // Keep the dialog mounted until the write settles, so a
                                                    // failure leaves the switch visibly off instead of the
                                                    // operator finding out from the maintenance page.
                                                    event.preventDefault();
                                                    void setEnabled(true).then((ok) => {
                                                        if (ok) setConfirmOpen(false);
                                                    });
                                                }}
                                            >
                                                {pending ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                                ) : null}
                                                Yes, take it down
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>

                        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-rule p-4">
                            <div className="min-w-0">
                                <Label
                                    htmlFor="allow-applications"
                                    className="flex items-center gap-2 text-sm font-semibold"
                                >
                                    Keep instructor applications open
                                    <Badge variant="secondary">Recommended</Badge>
                                </Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    While on, <code className="text-xs">/become-instructor</code> and the
                                    endpoint its form posts to stay reachable. Instructors are how the
                                    catalogue gets built, so taking intake offline costs more than it looks.
                                    Turn it off for a true full outage.
                                </p>
                            </div>
                            <Switch
                                id="allow-applications"
                                size="sm"
                                checked={allowApplications}
                                disabled={pending}
                                onCheckedChange={(next) => setAllowApplications(next)}
                                aria-label="Keep instructor applications open"
                            />
                        </div>

                        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-rule p-4">
                            <div className="min-w-0">
                                <Label
                                    htmlFor="release-at"
                                    className="flex items-center gap-2 text-sm font-semibold"
                                >
                                    Release the site automatically
                                </Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Defaults to two hours once the switch goes on, so a window
                                    nobody is watching cannot become an outage nobody notices.
                                    Move it while the site is down.
                                </p>
                                {enabled && status.disableAt !== null && (
                                    <p className="mt-1.5 text-xs font-medium text-foreground tabular">
                                        Releases at{" "}
                                        {new Date(status.disableAt).toLocaleString(undefined, {
                                            dateStyle: "medium",
                                            timeStyle: "short",
                                        })}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Input
                                    id="release-at"
                                    type="datetime-local"
                                    value={releaseAt ?? ""}
                                    disabled={pending || !enabled}
                                    onChange={(event) => setReleaseAt(event.target.value)}
                                    className="w-[13.5rem] tabular"
                                />
                                {releaseDirty && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => void saveRelease()}
                                    >
                                        {pending ? (
                                            <Loader2
                                                className="mr-2 h-4 w-4 animate-spin"
                                                aria-hidden
                                            />
                                        ) : null}
                                        Move
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ── the notice ───────────────────────────────────────────── */}
                <Card className="rounded-2xl p-5">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Megaphone className="h-4 w-4 text-brand" aria-hidden />
                            Visitor notice
                        </CardTitle>
                        <CardDescription>
                            The sentence shown under &ldquo;We&rsquo;ll be right back&rdquo;. Saved
                            independently of the switch, so you can write it while the site is still up.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 px-0">
                        <div className="space-y-2">
                            <Label htmlFor="maintenance-message">Notice</Label>
                            <Textarea
                                id="maintenance-message"
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                rows={4}
                                maxLength={MAX_MAINTENANCE_MESSAGE_LENGTH}
                                placeholder={DEFAULT_MAINTENANCE_MESSAGE}
                            />
                            <p className="text-xs text-muted-foreground">
                                {normalized.length}/{MAX_MAINTENANCE_MESSAGE_LENGTH}
                                {message.length > MAX_MAINTENANCE_MESSAGE_LENGTH && (
                                    <span className="ml-2 text-destructive">
                                        Over the limit — the extra will be trimmed on save.
                                    </span>
                                )}
                            </p>
                        </div>

                        <Button onClick={() => void saveDetails()} disabled={pending || !detailsDirty}>
                            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                            Save notice
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* ── what is actually reachable ────────────────────────────── */}
            <Card className="rounded-2xl p-5">
                <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-brand" aria-hidden />
                    While maintenance is on
                </CardTitle>
                <CardDescription>
                    Enforced in <code className="text-xs">proxy.ts</code>, in front of every request and
                    before the sign-in redirect — so a signed-out visitor sees the notice rather than a
                    login form.
                </CardDescription>
                <CardContent className="space-y-4 px-0 pt-4">
                    <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                            <span>
                                <span className="font-medium">Serving</span> —{" "}
                                {allowApplications ? (
                                    <>instructor applications, sign-in and sign-up</>
                                ) : (
                                    <>sign-in and sign-up</>
                                )}
                                , plus robots.txt and the sitemap so crawlers read a 503 rather than a
                                disallow.
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                            <span>
                                <span className="font-medium">503</span> — the storefront, catalogue,
                                certificate verification, every dashboard, and all other API routes.
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span>
                                <span className="font-medium">Exempt</span> — instructors and admins, so
                                whoever turned this on can turn it off. Resolved against the same
                                <code className="mx-1 text-xs">users</code> role as everything else, and it
                                fails closed.
                            </span>
                        </li>
                    </ul>

                    <p className="text-xs text-muted-foreground">
                        The gate caches the flag for five seconds per server instance, so a toggle takes
                        effect almost immediately rather than on the next request.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminMaintenancePage() {
    return (
        <PageShell>
            <PageHeader
                title="Maintenance mode"
                description="Take the public site down for planned work, while leaving instructor applications open."
            />
            <MaintenanceBody />
        </PageShell>
    );
}