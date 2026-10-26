"use client";

import { getErrorMessage } from "@/lib/errors";

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    EmptyState,
    Input,
    Label,
    PageHeader,
    Textarea,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Clock, GraduationCap, Loader2, ShieldCheck, Video, Wallet, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isDisposableEmail, suggestEmailDomain, validateEmail } from "@/lib/email";

export default function BecomeInstructorPage() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const myApplication = useQuery(api.instructorApplications.getMyApplication);
    const submitApplication = useMutation(api.instructorApplications.submitApplication);
    const dbUser = useQuery(api.users.getCurrentUser);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        expertise: "",
        bio: "",
        portfolioUrl: "",
        motivation: "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Pre-fill from Clerk user data. These are the values the inputs display,
    // so they are also what the submit handler has to read: `formData` stays
    // empty for a field the applicant never retyped, and validating that alone
    // made a correctly filled form fail with "please fill in all required
    // fields".
    const effectiveFullName = formData.fullName || user?.fullName || "";
    const effectiveEmail = formData.email || user?.primaryEmailAddress?.emailAddress || "";

    const emailSuggestion = suggestEmailDomain(effectiveEmail);
    const emailValidation = validateEmail(effectiveEmail);
    const isEmailDisposable = emailValidation.ok && isDisposableEmail(emailValidation.email);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const emailCheck = validateEmail(effectiveEmail);
        if (!emailCheck.ok) {
            toast.error(emailCheck.error);
            return;
        }
        if (isDisposableEmail(emailCheck.email)) {
            toast.error("Please use a permanent email address");
            return;
        }
        const payload = {
            fullName: effectiveFullName.trim(),
            email: emailCheck.email,
            expertise: formData.expertise.trim(),
            bio: formData.bio.trim(),
            portfolioUrl: formData.portfolioUrl.trim(),
            motivation: formData.motivation.trim(),
        };

        if (!payload.fullName || !payload.expertise || !payload.bio || !payload.motivation) {
            toast.error("Please fill in all required fields.");
            return;
        }

        setIsSubmitting(true);
        try {
            await submitApplication({
                fullName: payload.fullName,
                email: payload.email,
                expertise: payload.expertise,
                bio: payload.bio,
                portfolioUrl: payload.portfolioUrl || undefined,
                motivation: payload.motivation,
            });
            toast.success("Application submitted. We'll email you once it's been read.");
            // The same trimmed payload the mutation got, so the admin
            // notification cannot carry a blank name or email for a field the
            // applicant left as prefilled.
            fetch("/api/instructor-applications/notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }).catch(notifyError => {
                console.warn("Failed to send instructor application notification:", notifyError);
            });
        } catch (error: unknown) {
            console.error(error);
            toast.error(getErrorMessage(error, "Failed to submit application."));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Already an instructor/admin
    if (dbUser && (dbUser.role === "instructor" || dbUser.role === "admin")) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-20">
                {/* EmptyState owns an h3; the h1 keeps this branch's page title
                    in the document outline the same way the form branch's
                    PageHeader does. */}
                <h1 className="sr-only">You already teach here</h1>
                <EmptyState
                    icon={CheckCircle2}
                    tone="brand"
                    title="You already teach here"
                    description="Instructor access is already on your account. Courses and students live in the instructor dashboard."
                    action={
                        <Button onClick={() => router.push("/dashboard/instructor")}>
                            Go to instructor dashboard
                        </Button>
                    }
                />
            </main>
        );
    }

    // Has a pending or reviewed application
    if (myApplication) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-20">
                {/* CardTitle renders a div, so this branch's status heading is
                    not a document heading; the sr-only h1 gives all three
                    branches of this page the same outline. */}
                <h1 className="sr-only">Instructor application status</h1>
                <Card>
                    <CardHeader className="items-center text-center">
                        {myApplication.status === "pending" && (
                            <>
                                <div aria-hidden className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10 text-brand">
                                    <Clock className="h-6 w-6" />
                                </div>
                                <CardTitle className="display-subheading text-center text-2xl">
                                    Application Under Review
                                </CardTitle>
                                <CardDescription className="mx-auto mt-2 max-w-md text-center">
                                    Thanks for applying, {myApplication.fullName}. A person on the team
                                    reads every application, and you get an email once it&apos;s decided.
                                </CardDescription>
                            </>
                        )}
                        {myApplication.status === "approved" && (
                            <>
                                <div aria-hidden className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <CardTitle className="display-subheading text-center text-2xl">
                                    Application approved
                                </CardTitle>
                                <CardDescription className="mx-auto mt-2 max-w-md text-center">
                                    You can build and publish courses now. Earnings show up in your
                                    dashboard and go to your bank once you add a payout account.
                                </CardDescription>
                            </>
                        )}
                        {myApplication.status === "rejected" && (
                            <>
                                <div aria-hidden className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <XCircle className="h-6 w-6" />
                                </div>
                                <CardTitle className="display-subheading text-center text-2xl">
                                    Application not approved
                                </CardTitle>
                                <CardDescription className="mx-auto mt-2 max-w-md text-center">
                                    We didn&apos;t take this one. You&apos;re welcome to apply again once you
                                    have more to show.
                                    {myApplication.reviewNote && (
                                        <span className="mt-2 block font-medium text-foreground">
                                            &quot;{myApplication.reviewNote}&quot;
                                        </span>
                                    )}
                                </CardDescription>
                            </>
                        )}
                    </CardHeader>
                    <CardContent className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <span>Status:</span>
                        {/* The word carries the state; the tint only reinforces it. */}
                        <Badge
                            variant={
                                myApplication.status === "approved"
                                    ? "success"
                                    : myApplication.status === "rejected"
                                        ? "destructive"
                                        : "secondary"
                            }
                        >
                            {myApplication.status}
                        </Badge>
                    </CardContent>
                    <CardFooter className="justify-center">
                        {myApplication.status === "approved" ? (
                            <Button onClick={() => router.push("/dashboard/instructor")}>
                                Go to Instructor Dashboard
                            </Button>
                        ) : (
                            <Button variant="outline" onClick={() => router.push("/dashboard")}>
                                Back to Dashboard
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-3xl space-y-12 px-4 py-12">
            {/* Hero. The icon plate stays above the title (its own element) so
                the mark-over-heading composition survives the move to
                PageHeader, whose `children` slot sits below the description. */}
            <div className="space-y-6">
                <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <GraduationCap className="h-6 w-6" />
                </div>
                <PageHeader
                    title="Become an Instructor"
                    description="Tell us what you want to teach. A person on the team reads every application, and you get an email either way."
                />
            </div>

            {/* Benefits — `sunken` rather than a dashed outline: the editorial
                system separates with rules and recessed planes, never dashes. */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                    {
                        icon: ShieldCheck,
                        title: "Read by a person",
                        desc: "Not a filter. A person on the team reads your bio and portfolio, usually within a week.",
                    },
                    {
                        icon: Wallet,
                        title: "Paid per enrollment",
                        desc: "Prices are in naira and payouts go to your bank account. A free course stays free if you want reach instead.",
                    },
                    {
                        icon: Video,
                        title: "Teach however suits you",
                        desc: "Video, written lessons and quizzes, mixed however you like.",
                    },
                ].map(benefit => (
                    <Card key={benefit.title} variant="sunken">
                        <CardContent className="space-y-2">
                            <benefit.icon aria-hidden className="h-5 w-5 text-primary" />
                            <h3 className="text-sm font-semibold">{benefit.title}</h3>
                            <p className="text-xs text-muted-foreground">{benefit.desc}</p>
                        </CardContent>
                    </Card>
                ))}
            </section>

            {/* Sign-in prompt for unauthenticated users */}
            {!isLoaded ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : !user ? (
                <EmptyState
                    icon={GraduationCap}
                    tone="brand"
                    title="Sign in to apply"
                    description="Applications are tied to an account, so we can email you the decision and show your status here."
                    action={
                        <Button onClick={() => router.push("/sign-in")}>
                            Sign in
                        </Button>
                    }
                />
            ) : (
                /* Application Form */
                <Card>
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Instructor application</CardTitle>
                            <CardDescription>
                                Tell us what you&apos;d like to teach and why. The portfolio link is
                                optional; everything else is required and marked with a *.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full name *</Label>
                                    <Input
                                        id="fullName"
                                        name="fullName"
                                        value={effectiveFullName}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email address *</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={effectiveEmail}
                                        onChange={handleChange}
                                        required
                                    />
                                    {emailSuggestion && (
                                        <p className="text-xs text-muted-foreground">
                                            Did you mean <span className="font-medium">{emailSuggestion}</span>?
                                        </p>
                                    )}
                                    {isEmailDisposable && (
                                        <p className="text-xs text-destructive">
                                            Disposable emails are not allowed.
                                        </p>
                                    )}
                                    {effectiveEmail && !emailValidation.ok && (
                                        <p className="text-xs text-destructive">{emailValidation.error}</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="expertise">Area of expertise *</Label>
                                <Input
                                    id="expertise"
                                    name="expertise"
                                    placeholder="e.g. Web development, graphic design, data science"
                                    value={formData.expertise}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="bio">Bio *</Label>
                                <Textarea
                                    id="bio"
                                    name="bio"
                                    rows={4}
                                    placeholder="What you've built or taught, and where."
                                    value={formData.bio}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="portfolioUrl">Portfolio or website (optional)</Label>
                                <Input
                                    id="portfolioUrl"
                                    name="portfolioUrl"
                                    type="url"
                                    value={formData.portfolioUrl}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="motivation">Why do you want to teach on Glypha Learn? *</Label>
                                <Textarea
                                    id="motivation"
                                    name="motivation"
                                    rows={3}
                                    placeholder="One or two sentences is plenty."
                                    value={formData.motivation}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </CardContent>
                        {/* CardFooter already carries `border-t border-rule pt-4`. */}
                        <CardFooter className="flex justify-between">
                            <Button type="button" variant="ghost" onClick={() => router.push("/")}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="animate-spin" />}
                                Submit application
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            )}
        </main>
    );
}
