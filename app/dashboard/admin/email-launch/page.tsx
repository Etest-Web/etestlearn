"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { sendPlatformAnnouncement as sendPlatformAnnouncementRef } from "@/lib/announcements-email-api";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Megaphone, Rocket } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

type CampaignMode = "announcement" | "reminder";

const CAMPAIGNS: Record<CampaignMode, { title: string; body: string; label: string; desc: string }> = {
  announcement: {
    label: "Official Launch Announcement",
    desc: "Initial announcement sent ahead of time to build excitement and share the November 16th launch date.",
    title: "Glypha Learn is Launching November 16th! 🚀",
    body: `We're thrilled to announce that Glypha Learn officially launches on November 16th!

We've built a modern learning platform designed to help you build real-world skills, test your knowledge, and earn verified credentials.

Here are a few tips to make the most of launch day:

1. Explore the Course Catalog: Browse courses across technical, creative, and professional topics created by verified instructors.
2. Learn at Your Own Pace: Engage with interactive lessons featuring structured markdown guides, downloadable resources, and hands-on modules.
3. Test Your Knowledge with Quizzes: Pass milestone quizzes to solidify concepts and track your learning progress.
4. Earn Verified Certificates: Complete all course lessons and quizzes to earn a tamper-proof PDF certificate with a public verification URL to showcase on LinkedIn or your resume.
5. Join Study Groups & Discussions: Collaborate with fellow learners, ask lesson-specific questions, and get help directly from instructors.

Stay tuned — we can't wait to welcome you on November 16th!

— The Glypha Learn Team`,
  },
  reminder: {
    label: "Launch Day Reminder",
    desc: "Follow-up reminder sent right before or on launch day to drive learners to sign in and take action.",
    title: "Reminder: Glypha Learn Launches Today! 🎓",
    body: `The wait is over — Glypha Learn is officially live today!

Your learning dashboard is ready. Here is what you should do right now:

• Jump into the catalog: Pick your first course and start Lesson 1 immediately.
• Set your learning goals: Complete short daily lessons to keep momentum going.
• Test your skills: Ace quizzes as you complete each section.
• Earn your first certificate: Finish your course and claim your verified credentials.
• Engage in discussions: Introduce yourself in course discussions and connect with other students.

Log in now and start your learning journey!

— The Glypha Learn Team`,
  },
};

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDisplay(date: Date): string {
  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminEmailLaunchPage() {
  const [mode, setMode] = useState<CampaignMode>("announcement");
  const [title, setTitle] = useState(CAMPAIGNS.announcement.title);
  const [body, setBody] = useState(CAMPAIGNS.announcement.body);
  const [publishedAt, setPublishedAt] = useState<string>(
    formatDateTimeLocal(new Date(Date.now() + 60_000)),
  );
  const [isSending, setIsSending] = useState(false);

  const sendAnnouncement = useAction(sendPlatformAnnouncementRef);

  function selectMode(newMode: CampaignMode) {
    setMode(newMode);
    setTitle(CAMPAIGNS[newMode].title);
    setBody(CAMPAIGNS[newMode].body);
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }

    setIsSending(true);
    try {
      await sendAnnouncement({
        title: title.trim(),
        body: body.trim(),
        publishedAt: new Date(publishedAt).getTime(),
      });
      toast.success(
        `${mode === "announcement" ? "Launch announcement" : "Launch reminder"} broadcast sent (${formatDisplay(new Date(publishedAt))})`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send email broadcast"));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <PageShell>
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Rocket className="h-7 w-7 text-brand" />
              Launch Emails
            </span>
          }
          description="Send broadcast announcement and reminder emails to all registered learners. Embedded with platform logo, brand colors, and tips."
        />

        <div className="mx-auto max-w-3xl space-y-6">
          {/* Mode Switcher */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => selectMode("announcement")}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                mode === "announcement"
                  ? "border-brand bg-brand/5 shadow-sm"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Megaphone className={`h-5 w-5 mt-0.5 shrink-0 ${mode === "announcement" ? "text-brand" : "text-muted-foreground"}`} />
              <div>
                <p className="font-semibold text-sm">1. Launch Announcement</p>
                <p className="text-xs text-muted-foreground mt-1">Pre-launch news: November 16th date, features preview & preparation tips.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectMode("reminder")}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                mode === "reminder"
                  ? "border-brand bg-brand/5 shadow-sm"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Bell className={`h-5 w-5 mt-0.5 shrink-0 ${mode === "reminder" ? "text-brand" : "text-muted-foreground"}`} />
              <div>
                <p className="font-semibold text-sm">2. Launch Day Reminder</p>
                <p className="text-xs text-muted-foreground mt-1">Day-of reminder: We are live now, direct action steps to begin learning.</p>
              </div>
            </button>
          </div>

          <Card className="rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                {mode === "announcement" ? (
                  <Megaphone className="h-5 w-5 text-brand" />
                ) : (
                  <Bell className="h-5 w-5 text-brand" />
                )}
                {CAMPAIGNS[mode].label}
              </CardTitle>
              <CardDescription>{CAMPAIGNS[mode].desc}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="launch-title">Email Subject / Heading</Label>
                <Input
                  id="launch-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  disabled={isSending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="launch-body">Email Body Content</Label>
                <Textarea
                  id="launch-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  maxLength={2500}
                  disabled={isSending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="publish-time">Send Timestamp</Label>
                <Input
                  id="publish-time"
                  type="datetime-local"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                  disabled={isSending}
                />
                <p className="text-xs text-muted-foreground">
                  Timestamp recorded in email metadata and deduplication keys.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSend}
                  disabled={!title.trim() || !body.trim() || isSending}
                  className="flex-1"
                >
                  {isSending
                    ? "Sending..."
                    : mode === "announcement"
                      ? "Send Launch Announcement"
                      : "Send Launch Reminder"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTitle(CAMPAIGNS[mode].title);
                    setBody(CAMPAIGNS[mode].body);
                  }}
                  disabled={isSending}
                >
                  Reset Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    </>
  );
}