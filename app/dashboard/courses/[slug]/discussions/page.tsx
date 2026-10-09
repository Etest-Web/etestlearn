"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  EmptyState,
  Input,
  Button,
} from "@/components/ui";
import { MessagesSquare } from "lucide-react";

export default function CourseDiscussionsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;

  const courseData = useQuery(api.courses.getCourseBySlug, { slug });
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const threads = useQuery(
    api.discussions.listThreadsForCourse,
    courseData ? { courseId: courseData.course._id } : "skip",
  );
  const messages = useQuery(
    api.discussions.listMessagesForThread,
    selectedThreadId ? { threadId: selectedThreadId as any } : "skip",
  );

  const createThread = useMutation(api.discussions.createThread);
  const postMessage = useMutation(api.discussions.postMessage);

  if (courseData === undefined) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">Loading discussions...</p>
      </div>
    );
  }

  if (courseData === null) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">
          Course not found; discussions are unavailable.
        </p>
      </div>
    );
  }

  async function handleCreateThread() {
    if (!newTitle.trim()) return;
    if (!courseData) return;
    const id = await createThread({
      courseId: courseData.course._id,
      title: newTitle.trim(),
    });
    setNewTitle("");
    setSelectedThreadId(id as any);
  }

  async function handlePostMessage() {
    if (!newMessage.trim() || !selectedThreadId) return;
    await postMessage({
      threadId: selectedThreadId as any,
      body: newMessage.trim(),
    });
    setNewMessage("");
  }

  const threadList = threads ?? [];
  const messageList = messages ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row">
      <div className="w-full md:w-1/3 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Threads for {courseData.course.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {threadList.length === 0 ? (
              /* Inside a Card the Card is the boundary, so the empty state drops
                 its own rules rather than drawing a box inside a box. */
              <EmptyState
                icon={MessagesSquare}
                title="No discussions yet"
                description="Start the first thread."
                className="border-y-0 px-0 py-8"
              />
            ) : (
              <ul className="space-y-1">
                {threadList.map((t: any) => (
                  <li key={t._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(t._id)}
                      className={`relative w-full rounded-sm px-2 py-1.5 text-left text-xs ${
                        selectedThreadId === t._id
                          ? "font-semibold text-foreground after:absolute after:inset-y-1 after:left-0 after:w-0.5 after:bg-brand"
                          : "text-muted-foreground hover:bg-surface-sunken hover:text-foreground"
                      }`}
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New thread</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Ask a question or start a topic..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Button size="sm" className="w-full" onClick={handleCreateThread}>
              Create thread
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="w-full md:w-2/3 space-y-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>
              {selectedThreadId
                ? "Thread messages"
                : "Select a thread to view messages"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex h-full flex-col gap-3 text-sm">
            {selectedThreadId && (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto rounded-sm border border-rule px-3 py-2">
                  {messageList.length === 0 ? (
                    <EmptyState
                      icon={MessagesSquare}
                      title="No messages yet"
                      description="Be the first to reply."
                      className="border-y-0 px-0 py-8"
                    />
                  ) : (
                    messageList.map((m: any) => (
                      <div
                        key={m._id}
                        className="rounded-sm bg-surface-sunken px-2 py-1.5 text-xs space-y-0.5"
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-[10px]">
                            {m.authorName
                              ? m.authorName.charAt(0).toUpperCase()
                              : "?"}
                          </span>
                          <span className="font-medium text-foreground truncate">
                            {m.authorName ?? "Unknown"}
                          </span>
                          <span className="ml-auto shrink-0">
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="pl-6">{m.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Write a reply..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handlePostMessage}
                  >
                    Post message
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
