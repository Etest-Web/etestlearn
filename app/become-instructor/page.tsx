"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  GraduationCap,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function BecomeInstructorPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const myApplication = useQuery(api.instructorApplications.getMyApplication);
  const submitApplication = useMutation(
    api.instructorApplications.submitApplication
  );
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.fullName ||
      !formData.email ||
      !formData.expertise ||
      !formData.bio ||
      !formData.motivation
    ) {
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
      toast.success(
        "Application submitted! We'll review it and get back to you."
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to submit application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pre-fill from Clerk user data
  const effectiveFullName =
    formData.fullName || user?.fullName || "";
  const effectiveEmail =
    formData.email || user?.primaryEmailAddress?.emailAddress || "";

  // Already an instructor/admin
  if (dbUser && (dbUser.role === "instructor" || dbUser.role === "admin")) {
    return (
      <>
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-green-500/10 p-4">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              You&apos;re already an instructor!
            </h1>
            <p className="text-muted-foreground max-w-md">
              You already have instructor access. Head to your Instructor
              Dashboard to create and manage courses.
            </p>
            <Button onClick={() => router.push("/dashboard/instructor")}>
              Go to Instructor Dashboard
            </Button>
          </div>
        </main>
      </>
    );
  }

  // Has a pending or reviewed application
  if (myApplication) {
    return (
      <>
        <main className="mx-auto max-w-2xl px-4 py-20">
          <Card className="border-2">
            <CardHeader className="text-center">
              {myApplication.status === "pending" && (
                <>
                  <div className="mx-auto rounded-full bg-amber-500/10 p-4 mb-4">
                    <Clock className="h-10 w-10 text-amber-500" />
                  </div>
                  <CardTitle className="text-2xl">
                    Application Under Review
                  </CardTitle>
                  <CardDescription className="max-w-md mx-auto mt-2">
                    Thanks for applying, {myApplication.fullName}! Our team is
                    reviewing your application. We&apos;ll update your account
                    once a decision is made.
                  </CardDescription>
                </>
              )}
              {myApplication.status === "approved" && (
                <>
                  <div className="mx-auto rounded-full bg-green-500/10 p-4 mb-4">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </div>
                  <CardTitle className="text-2xl">
                    Application Approved! 🎉
                  </CardTitle>
                  <CardDescription className="max-w-md mx-auto mt-2">
                    Congratulations! You&apos;ve been approved as an instructor.
                    You can now access the Instructor Dashboard and start
                    creating courses.
                  </CardDescription>
                </>
              )}
              {myApplication.status === "rejected" && (
                <>
                  <div className="mx-auto rounded-full bg-red-500/10 p-4 mb-4">
                    <XCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <CardTitle className="text-2xl">
                    Application Not Approved
                  </CardTitle>
                  <CardDescription className="max-w-md mx-auto mt-2">
                    Unfortunately, your application wasn&apos;t approved at this
                    time.
                    {myApplication.reviewNote && (
                      <span className="block mt-2 text-foreground font-medium">
                        &ldquo;{myApplication.reviewNote}&rdquo;
                      </span>
                    )}
                  </CardDescription>
                </>
              )}
            </CardHeader>
            <CardContent className="text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Status:</span>
                <Badge
                  variant={
                    myApplication.status === "approved"
                      ? "default"
                      : myApplication.status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                  className="capitalize"
                >
                  {myApplication.status}
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="justify-center">
              {myApplication.status === "approved" ? (
                <Button
                  onClick={() => router.push("/dashboard/instructor")}
                >
                  Go to Instructor Dashboard
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Back to Dashboard
                </Button>
              )}
            </CardFooter>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        {/* Hero */}
        <section className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Become an Instructor
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Share your expertise with thousands of learners. Apply to join our
            instructor community, and once approved, start creating and
            publishing courses on Etest Learning.
          </p>
        </section>

        {/* Benefits */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          ].map((benefit) => (
            <Card
              key={benefit.title}
              className="text-center border-dashed"
            >
              <CardContent className="pt-6 space-y-2">
                <span className="text-2xl">{benefit.icon}</span>
                <h3 className="font-semibold text-sm">{benefit.title}</h3>
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
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <Sparkles className="h-8 w-8 text-amber-500" />
              <h3 className="text-lg font-semibold">
                Sign in to apply
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                You need an Etest Learning account before you can submit your
                instructor application.
              </p>
              <Button onClick={() => router.push("/sign-in")}>
                Sign in to get started
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Application Form */
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Instructor Application
                </CardTitle>
                <CardDescription>
                  Tell us about yourself and why you&apos;d like to teach on our
                  platform. Fields marked * are required.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <Label htmlFor="portfolioUrl">
                    Portfolio / Website URL (optional)
                  </Label>
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
                  <Label htmlFor="motivation">
                    Why do you want to teach on Etest Learning? *
                  </Label>
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
              <CardFooter className="flex justify-between border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push("/")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Submit Application
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
