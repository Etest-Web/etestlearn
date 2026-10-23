"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LifeBuoy,
  MessageSquare,
  Search,
  Clock,
  AlertCircle,
  Send,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

type TicketStatus = Doc<"supportTickets">["status"];
type TicketPriority = Doc<"supportTickets">["priority"];

export default function AdminSupportPage() {
  const [selectedTicketId, setSelectedTicketId] = useState<Id<"supportTickets"> | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const stats = useQuery(api.support.adminGetSupportStats);
  const tickets = useQuery(api.support.adminListTickets, {
    status: statusFilter,
    category: categoryFilter,
    search: search ? search : undefined,
  });

  const selectedTicket = useQuery(
    api.support.adminGetTicket,
    selectedTicketId ? { ticketId: selectedTicketId } : "skip"
  );

  const replyMutation = useMutation(api.support.adminReplyTicket);
  const updateMutation = useMutation(api.support.adminUpdateTicket);

  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);

  const handleSendReply = async () => {
    if (!selectedTicketId || !replyText.trim()) return;
    try {
      setSubmittingReply(true);
      await replyMutation({
        ticketId: selectedTicketId,
        body: replyText,
        isInternalNote,
      });
      setReplyText("");
      toast.success(isInternalNote ? "Internal note added" : "Reply sent to user");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reply";
      toast.error(msg);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicketId) return;
    try {
      await updateMutation({
        ticketId: selectedTicketId,
        status: newStatus,
      });
      toast.success(`Ticket marked as ${newStatus}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      toast.error(msg);
    }
  };

  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!selectedTicketId) return;
    try {
      await updateMutation({
        ticketId: selectedTicketId,
        priority: newPriority,
      });
      toast.success(`Priority updated to ${newPriority}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update priority";
      toast.error(msg);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Support Desk"
        description="Manage customer inquiries, report issues, and communicate directly with learners."
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <LifeBuoy className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Total Tickets</span>
          </div>
          <div className="mt-2 text-2xl font-bold">{stats?.total ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-amber-500">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Open</span>
          </div>
          <div className="mt-2 text-2xl font-bold">{stats?.open ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-blue-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">In Progress</span>
          </div>
          <div className="mt-2 text-2xl font-bold">{stats?.inProgress ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-rose-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">Urgent</span>
          </div>
          <div className="mt-2 text-2xl font-bold">{stats?.urgent ?? 0}</div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Ticket List Pane */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="p-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search subject, #ticket, name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_user">Waiting User</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="all">All Categories</option>
                  <option value="account">Account</option>
                  <option value="billing">Billing</option>
                  <option value="courses">Courses</option>
                  <option value="certificates">Certificates</option>
                  <option value="technical">Technical</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            {tickets === undefined ? (
              [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
            ) : tickets.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <LifeBuoy className="mx-auto h-8 w-8 opacity-40" />
                <p className="mt-2 text-sm font-medium">No tickets found</p>
              </Card>
            ) : (
              tickets.map((t: Doc<"supportTickets">) => {
                const isSelected = selectedTicketId === t._id;
                return (
                  <Card
                    key={t._id}
                    onClick={() => setSelectedTicketId(t._id)}
                    className={`cursor-pointer p-4 transition-colors hover:border-brand/40 ${
                      isSelected ? "border-brand bg-accent/30" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {t.ticketNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs font-medium text-foreground">{t.name}</span>
                        </div>
                        <h4 className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
                          {t.subject}
                        </h4>
                      </div>
                      <Badge
                        variant={
                          t.status === "open"
                            ? "default"
                            : t.status === "resolved"
                            ? "outline"
                            : "secondary"
                        }
                        className="capitalize text-[10px]"
                      >
                        {t.status.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{t.category}</span>
                      <span
                        className={`capitalize font-medium ${
                          t.priority === "urgent"
                            ? "text-rose-500 font-bold"
                            : t.priority === "high"
                            ? "text-amber-500"
                            : ""
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Ticket Conversation Pane */}
        <div className="lg:col-span-7">
          {selectedTicketId === null ? (
            <Card className="flex h-96 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 stroke-1 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Select a ticket to review conversation</p>
            </Card>
          ) : selectedTicket === undefined ? (
            <Skeleton className="h-96 w-full rounded-lg" />
          ) : selectedTicket === null ? (
            <Card className="p-8 text-center text-muted-foreground">Ticket not found</Card>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Ticket Details Header */}
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-muted-foreground">
                        {selectedTicket.ticket.ticketNumber}
                      </span>
                      <Badge variant="outline" className="text-xs uppercase">
                        {selectedTicket.ticket.category}
                      </Badge>
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-foreground">
                      {selectedTicket.ticket.subject}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Opened by <strong className="text-foreground">{selectedTicket.ticket.name}</strong> ({selectedTicket.ticket.email}) on{" "}
                      {new Date(selectedTicket.ticket.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTicket.ticket.status}
                      onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-semibold"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting_user">Waiting User</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>

                    <select
                      value={selectedTicket.ticket.priority}
                      onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </Card>

              {/* Messages History */}
              <Card className="flex flex-col gap-4 p-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Conversation Thread
                </h4>

                <div className="flex flex-col gap-4">
                  {selectedTicket.messages.map((m: Doc<"supportTicketMessages">) => {
                    const isStaff = m.senderType === "staff";
                    const isNote = m.isInternalNote;

                    return (
                      <div
                        key={m._id}
                        className={`rounded-lg p-4 text-sm ${
                          isNote
                            ? "border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
                            : isStaff
                            ? "border border-brand/20 bg-brand/5"
                            : "border border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5 font-semibold">
                            {isNote ? (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <Lock className="h-3 w-3" /> Internal Staff Note
                              </span>
                            ) : (
                              <span>{m.senderName} {isStaff ? "(Staff)" : ""}</span>
                            )}
                          </div>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
                          {m.body}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply Composer */}
                <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Compose Reply</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded border-input text-brand focus:ring-brand"
                      />
                      Add as internal staff note (hidden from user)
                    </label>
                  </div>

                  <Textarea
                    placeholder={
                      isInternalNote
                        ? "Write internal note for other admins..."
                        : "Write message to learner..."
                    }
                    rows={4}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={handleSendReply}
                      disabled={submittingReply || !replyText.trim()}
                    >
                      <Send className="mr-2 h-3.5 w-3.5" />
                      {isInternalNote ? "Save Internal Note" : "Send Reply"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
