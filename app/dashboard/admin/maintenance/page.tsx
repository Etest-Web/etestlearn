"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
    AlertTriangle,
    ArrowRight,
    Loader2,
    Megaphone,
    RotateCcw,
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
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DEFAULT_MAINTENANCE_MESSAGE,
    MAX_MAINTENANCE_MESSAGE_LENGTH,
    normalizeMaintenanceMessage,
} from "@/lib/maintenance";

/**
 * The maintenance switch.
 *
 * Two decisions worth naming, because both are about the failure mode of getting
 * this wrong:
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
 * **The message saves separately from the switch.** The message is inert until
 * the switch is on, so editing it must not require taking the site down to
 * store the text. An admin can compose the notice in advance and save it while
 * the site is still live.
 */
function MaintenanceBody() {
    const status = useQuery(api.maintenance.getStatus);
    const setMode = useMutation(api.maintenance.setMode);

    const [message, setMessage] = useState<string | null>(null);
    const [allowApplications, setAllowApplications] = useState<boolean | null>(null);
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
    }, [status]);

    if (status === undefined || message === null || allowApplications === null) {
        return <Skeleton className="h-96 w-full rounded-2xl" />;
    }

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
            toast.error(error instanceof Error ? error.message : "That did not go through");
            return false;
        } finally {
            setPending(false);
        }
    }

    // The switch sends `enabled` alone. `setMode` treats an omitted `message` as
    // "leave as it is", which is what stops the toggle from writing back a copy
    // of the note captured before somebody else edited it.
    const setEnabled = async (next: boolean) => {
        await run(
            () => setMode({ enabled: next }),
            next ? "Maintenance mode is on" : "Maintenance mode is off",
        );
    };

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

    return (
        <div className="space-y-6">
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

            <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
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
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {enabled
                                        ? "Live since this switch was last turned on."
                                        : "The site is serving normally."}
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
                                                    : "Instructor applications are currently closed too, so nothing at all will be reachable."}
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