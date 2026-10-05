"use client";

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
import { CheckCircle2, Clock, GraduationCap, Loader2, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.fullName || !formData.email || !formData.expertise || !formData.bio || !formData.motivation) {
            toast.error("Please fill in all required fields.");
            return;
        }

        setIsSubmitting(true);
        try {
            await submitApplication({
                fullName: formData.fullName,
                email: formData.email,
                expertise: formData.expertise,
                bio: formData.bio,
                portfolioUrl: formData.portfolioUrl || undefined,
                motivation: formData.motivation,
            });
            toast.success("Application submitted! We'll review it and get back to you.");
            fetch("/api/instructor-applications/notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            }).catch(notifyError => {
                console.warn("Failed to send instructor application notification:", notifyError);
            });
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Failed to submit application.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Pre-fill from Clerk user data
    const effectiveFullName = formData.fullName || user?.fullName || "";
    const effectiveEmail = formData.email || user?.primaryEmailAddress?.emailAddress || "";

    // Already an instructor/admin
    if (dbUser && (dbUser.role === "instructor" || dbUser.role === "admin")) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-20">
                {/* EmptyState owns an h3; the h1 keeps this branch's page title
                    in the document outline the same way the form branch's
                    PageHeader does. */}
                <h1 className="sr-only">You&apos;re already an instructor</h1>
                <EmptyState
                    icon={CheckCircle2}
                    tone="brand"
                    title="You're already an instructor!"
                    description="You already have instructor access. Head to your Instructor Dashboard to create and manage courses."
                    action={
                        <Button onClick={() => router.push("/dashboard/instructor")}>
                            Go to Instructor Dashboard
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
                                    Thanks for applying, {myApplication.fullName}! Our team is reviewing your
                                    application. We&apos;ll update your account once a decision is made.
                                </CardDescription>
                            </>
                        )}
                        {myApplication.status === "approved" && (
                            <>
                                <div aria-hidden className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-success/10 text-success">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <CardTitle className="display-subheading text-center text-2xl">
                                    Application Approved! 🎉
                                </CardTitle>
                                <CardDescription className="mx-auto mt-2 max-w-md text-center">
                                    Congratulations! You&apos;ve been approved as an instructor. You can now access
                                    the Instructor Dashboard and start creating courses.
                                </CardDescription>
                            </>
                        )}
                        {myApplication.status === "rejected" && (
                            <>
                                <div aria-hidden className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                    <XCircle className="h-6 w-6" />
                                </div>
                                <CardTitle className="display-subheading text-center text-2xl">
                                    Application Not Approved
                                </CardTitle>
                                <CardDescription className="mx-auto mt-2 max-w-md text-center">
                                    Unfortunately, your application wasn&apos;t approved at this time.
                                    {myApplication.reviewNote && (
                                        <span className="mt-2 block font-medium text-foreground">
                                            &ldquo;{myApplication.reviewNote}&rdquo;
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
                    description="Share your expertise with thousands of learners. Apply to join our instructor community, and once approved, start creating and publishing courses on Glypha Learning."
                />
            </div>

            {/* Benefits — `sunken` rather than a dashed outline: the editorial
                system separates with rules and recessed planes, never dashes. */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                    {
                        icon: "🎯",
                        title: "Reach Learners",
                        desc: "Publish to a growing community of motivated students.",
                    },
                    {
                        icon: "🛠️",
                        title: "Powerful Tools",
                        desc: "Create video, article, and quiz-based lessons with ease.",
                    },
                    {
                        icon: "📊",
                        title: "Track Impact",
                        desc: "See enrollment stats and student progress on your courses.",
                    },
                ].map(benefit => (
                    <Card key={benefit.title} variant="sunken">
                        <CardContent className="space-y-2">
                            <span aria-hidden className="text-2xl">{benefit.icon}</span>
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
                    icon={Sparkles}
                    tone="brand"
                    title="Sign in to apply"
                    description="You need an Glypha Learning account before you can submit your instructor application."
                    action={
                        <Button onClick={() => router.push("/sign-in")}>
                            Sign in to get started
                        </Button>
                    }
                />
            ) : (
                /* Application Form */
                <Card>
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-brand" />
                                Instructor Application
                            </CardTitle>
                            <CardDescription>
                                Tell us about yourself and why you&apos;d like to teach on our platform. Fields
                                marked * are required.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name *</Label>
                                    <Input
                                        id="fullName"
                                        name="fullName"
                                        placeholder="Your full name"
                                        value={effectiveFullName}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address *</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={effectiveEmail}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="expertise">Area of Expertise *</Label>
                                <Input
                                    id="expertise"
                                    name="expertise"
                                    placeholder="e.g. Web Development, Graphic Design, Data Science"
                                    value={formData.expertise}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="bio">Professional Bio *</Label>
                                <Textarea
                                    id="bio"
                                    name="bio"
                                    rows={4}
                                    placeholder="Tell us about your background, experience, and qualifications..."
                                    value={formData.bio}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="portfolioUrl">Portfolio / Website URL (optional)</Label>
                                <Input
                                    id="portfolioUrl"
                                    name="portfolioUrl"
                                    type="url"
                                    placeholder="https://your-portfolio.com"
                                    value={formData.portfolioUrl}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="motivation">Why do you want to teach on Glypha Learning? *</Label>
                                <Textarea
                                    id="motivation"
                                    name="motivation"
                                    rows={3}
                                    placeholder="What motivates you to create courses and share your knowledge?"
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
                                Submit Application
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            )}
        </main>
    );
}
