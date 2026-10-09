"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/role-guard";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, LockOpen, MessagesSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

function DiscussionsBody() {
  const threads = useQuery(api.discussions.adminListThreads, { limit: 100 });
  const setLocked = useMutation(api.discussions.adminSetThreadLocked);
  const deleteThread = useMutation(api.discussions.adminDeleteThread);
  const deleteMessage = useMutation(api.discussions.adminDeleteMessage);

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const messages = useQuery(
    api.discussions.adminListThreadMessages,
    openThreadId ? { threadId: openThreadId as never } : "skip",
  );

  if (threads === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  async function toggleLock(threadId: string, locked: boolean) {
    try {
      await setLocked({ threadId: threadId as never, locked });
      toast.success(locked ? "Thread locked" : "Thread unlocked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function removeThread(threadId: string) {
    try {
      await deleteThread({ threadId: threadId as never });
      toast.success("Thread and its messages deleted");
      if (openThreadId === threadId) setOpenThreadId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function removeMessage(messageId: string) {
    try {
      await deleteMessage({ messageId: messageId as never });
      toast.success("Message deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-4">
      {threads.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          tone="brand"
          title="No discussion threads"
          description="Threads appear here as learners post them inside a course. Deleting one removes it for everyone enrolled."
        />
      )}
      {threads.map((thread) => (
        <Card key={thread._id} className="rounded-2xl p-0">
          <CardHeader className="border-b border-rule p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() =>
                  setOpenThreadId((prev) => (prev === thread._id ? null : thread._id))
                }
              >
                <CardTitle className="flex items-center gap-2 text-base">
                  {thread.title}
                  {thread.locked && (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Locked" />
                  )}
                </CardTitle>
                <CardDescription>
                  {thread.courseTitle ?? "Unknown course"} · {thread.authorName ?? "Unknown"} ·{" "}
                  {thread.messageCount} messages
                </CardDescription>
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleLock(thread._id, !thread.locked)}
                >
                  {thread.locked ? (
                    <>
                      <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Unlock
                    </>
                  ) : (
                    <>
                      <Lock className="mr-1.5 h-3.5 w-3.5" /> Lock
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removeThread(thread._id)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          {openThreadId === thread._id && (
            <CardContent className="p-0">
              {messages === undefined ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
              ) : messages.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No messages in this thread.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {messages.map((message) => (
                    <li key={message._id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground">
                          {message.authorName ?? "Unknown"} ·{" "}
                          {new Date(message.createdAt).toLocaleString("en-NG")}
                        </p>
                        <p className="mt-1 break-words text-sm">{message.body}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete message"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeMessage(message._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function AdminDiscussionsPage() {
  return (
    <AdminGuard>
      <PageShell width="narrow">
        <PageHeader
          title="Discussions"
          description="Lock pile-ons without erasing history, and remove individual messages or whole threads. Every moderation action is audited."
        />
        <DiscussionsBody />
      </PageShell>
    </AdminGuard>
  );
}