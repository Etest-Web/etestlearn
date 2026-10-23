"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { LifeBuoy, Send, CheckCircle2, Search, HelpCircle } from "lucide-react";
import { toast } from "sonner";

type SupportCategory = "account" | "billing" | "courses" | "certificates" | "technical" | "other";
type SupportPriority = "low" | "medium" | "high" | "urgent";

export default function SupportPublicPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("other");
  const [priority, setPriority] = useState<SupportPriority>("medium");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{ ticketNumber: string } | null>(null);

  // Status lookup state
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");

  const createTicketMutation = useMutation(api.support.createTicket);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createTicketMutation({
        name,
        email,
        subject,
        category,
        priority,
        message,
      });
      setCreatedTicket({ ticketNumber: res.ticketNumber });
      toast.success("Support ticket opened! We'll reply shortly.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create support ticket.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/30 px-3 py-1 text-xs font-semibold text-brand">
            <LifeBuoy className="h-3.5 w-3.5" />
            Glypha Help & Support
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
            How can we help you?
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            Submit a support ticket or track the status of an existing inquiry.
          </p>
        </div>

        {/* Quick Help Knowledge Base / FAQ Links */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Card className="p-4 transition-all hover:border-brand/40">
            <h3 className="font-semibold text-foreground">Certificates</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Questions regarding certificate issuance, layout, names, or verification.
            </p>
          </Card>
          <Card className="p-4 transition-all hover:border-brand/40">
            <h3 className="font-semibold text-foreground">Course Access & Billing</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Payment issues, refunds, enrollments, or Paystack settlement receipts.
            </p>
          </Card>
          <Card className="p-4 transition-all hover:border-brand/40">
            <h3 className="font-semibold text-foreground">Instructor Inquiries</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Bank verification, payout schedules, course publishing, or applications.
            </p>
          </Card>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12">
          {/* Main Form: Submit Ticket */}
          <div className="lg:col-span-8">
            <Card className="p-6 md:p-8">
              {createdTicket ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-foreground">Ticket Submitted!</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your request was received. Your reference code is:
                  </p>
                  <div className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-2 font-mono text-xl font-bold text-brand">
                    {createdTicket.ticketNumber}
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground max-w-md">
                    We sent a confirmation email to <strong>{email}</strong>. Our support team typically responds within a few hours.
                  </p>
                  <Button
                    className="mt-6"
                    onClick={() => {
                      setCreatedTicket(null);
                      setSubject("");
                      setMessage("");
                    }}
                  >
                    Open Another Ticket
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <h2 className="text-xl font-bold text-foreground">Open a Support Ticket</h2>
                  <p className="text-xs text-muted-foreground">
                    Our team will answer your questions and follow up via email.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">Full Name *</label>
                      <Input
                        required
                        placeholder="e.g. Divine Amaka"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">Email Address *</label>
                      <Input
                        required
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">Category *</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as SupportCategory)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="account">Account & Sign-in</option>
                        <option value="billing">Billing & Payments</option>
                        <option value="courses">Courses & Lessons</option>
                        <option value="certificates">Certificates & Verification</option>
                        <option value="technical">Technical Issue / Bug</option>
                        <option value="other">Other Inquiry</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-foreground">Urgency</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as SupportPriority)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="low">Low - General inquiry</option>
                        <option value="medium">Medium - Normal assistance</option>
                        <option value="high">High - Blocking my progress</option>
                        <option value="urgent">Urgent - Payment / access failure</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">Subject *</label>
                    <Input
                      required
                      placeholder="Brief summary of your question or issue"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">Message Details *</label>
                    <Textarea
                      required
                      rows={5}
                      placeholder="Please provide full details so we can help quickly..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  <Button type="submit" disabled={isSubmitting} className="mt-2 w-full sm:w-auto">
                    {isSubmitting ? (
                      "Submitting ticket..."
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </form>
              )}
            </Card>
          </div>

          {/* Sidebar / Track Existing Ticket */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <Search className="h-4 w-4 text-brand" />
                Track Ticket Status
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Already have a ticket? Check status or reply directly using your reference.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <Input
                  placeholder="Ticket Number (e.g. TICK-2026-1234)"
                  value={lookupNumber}
                  onChange={(e) => setLookupNumber(e.target.value)}
                />
                <Input
                  placeholder="Your Email"
                  type="email"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                />

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!lookupNumber.trim() || !lookupEmail.trim()}
                  onClick={() => {
                    window.location.href = `/support?ticketNumber=${encodeURIComponent(
                      lookupNumber.trim()
                    )}&email=${encodeURIComponent(lookupEmail.trim())}`;
                  }}
                >
                  Lookup Ticket
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                <HelpCircle className="h-4 w-4 text-brand" />
                Direct Email Fallback
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                You can also email our support team directly. Messages sent to{" "}
                <strong className="text-foreground">support@glypha.com.ng</strong> are received by our operations desk.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
