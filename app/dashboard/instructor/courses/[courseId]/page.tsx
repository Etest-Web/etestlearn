"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { Badge } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { ArrowLeft, Loader2, Save, LayoutList, PlusCircle, Video, FileText, HelpCircle, ExternalLink, Upload, Globe, EyeOff, ShieldAlert, Send, Undo2, Clock, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { slugify } from "@/lib/slug";
import { CertificatesPanel } from "@/components/course-certificates-panel";

export default function CourseEditPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.courseId as string | undefined;
  
  const courseData = useQuery(
    api.courses.getCourseById,
    courseId ? { courseId: courseId as Id<"courses"> } : "skip"
  );
  const updateCourse = useMutation(api.courses.updateCourse);
  const createLesson = useMutation(api.courses.createLesson);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  // Admin-curated categories as suggestions; the field stays free text so
  // historical values and new ideas keep working (see convex/categories.ts).
  const categoryOptions = useQuery(api.categories.list);

  // Publishing is a separate operation from editing metadata (see
  // `lib/publishing.ts`), so the server decides which controls exist rather
  // than this page guessing from the price field.
  const publishing = useQuery(
    api.courses.getCoursePublishingState,
    courseId ? { courseId: courseId as Id<"courses"> } : "skip"
  );
  const publishCourse = useMutation(api.courses.publishCourse);
  const unpublishCourse = useMutation(api.courses.unpublishCourse);
  const requestUnpublish = useMutation(api.courses.requestUnpublish);
  const withdrawUnpublishRequest = useMutation(api.courses.withdrawUnpublishRequest);
  const [isPublishingActionPending, setIsPublishingActionPending] = useState(false);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState("");
  const pendingStorageId = useRef<Id<"_storage"> | null>(null);
  const [resolvedStorageId, setResolvedStorageId] = useState<Id<"_storage"> | null>(null);
  const resolvedFileUrl = useQuery(
    api.files.validateAndResolveUpload,
    resolvedStorageId ? { storageId: resolvedStorageId, kind: "image" as const } : "skip",
  );
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isCreatingLesson, setIsCreatingLesson] = useState(false);
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When the uploaded file URL resolves, attach it to the form.
  useEffect(() => {
    if (
      resolvedFileUrl &&
      pendingStorageId.current &&
      resolvedStorageId === pendingStorageId.current
    ) {
      setFormData((prev) => ({ ...prev, thumbnailUrl: resolvedFileUrl }));
      toast.success("Image uploaded successfully");
      pendingStorageId.current = null;
    }
  }, [resolvedFileUrl, resolvedStorageId]);
  
  const [newLessonData, setNewLessonData] = useState({
    title: "",
    contentType: "video" as "video" | "article" | "quiz",
  });

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    category: "",
    level: "",
    thumbnailUrl: "",
    priceNaira: "",
  });

  useEffect(() => {
    if (courseData?.course) {
      setFormData({
        title: courseData.course.title,
        slug: courseData.course.slug,
        description: courseData.course.description,
        category: courseData.course.category || "",
        level: courseData.course.level || "",
        thumbnailUrl: courseData.course.thumbnailUrl || "",
        priceNaira: courseData.course.price ? String(courseData.course.price / 100) : "",
      });
    }
  }, [courseData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({ ...prev, title, slug: slugify(title) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Price is entered in Naira on the form; Convex stores kobo.
      // An emptied field explicitly sets the course back to free (price 0).
      const naira = parseFloat(formData.priceNaira);
      const price = Number.isFinite(naira) && naira > 0 ? Math.round(naira * 100) : 0;

      await updateCourse({
        courseId: courseId as Id<"courses">,
        title: formData.title,
        slug: formData.slug,
        description: formData.description,
        category: formData.category || undefined,
        level: formData.level || undefined,
        thumbnailUrl: formData.thumbnailUrl || undefined,
        price,
        ...(price > 0 ? { currency: "NGN" } : {}),
      });
      toast.success("Course updated successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update course");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publishing actions share one handler because they differ only in which
  // mutation runs and what the toast says — and they must never be reachable
  // from the details form, where a stale price could publish or unpublish the
  // wrong thing.
  const runPublishingAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    errorMessage: string,
  ) => {
    setIsPublishingActionPending(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : errorMessage,
      );
    } finally {
      setIsPublishingActionPending(false);
    }
  };

  const handlePublish = () =>
    runPublishingAction(
      () => publishCourse({ courseId: courseId as Id<"courses"> }),
      "Course published — it is now listed and on sale.",
      "Failed to publish course.",
    );

  const handleUnpublish = () =>
    runPublishingAction(
      () => unpublishCourse({ courseId: courseId as Id<"courses"> }),
      "Course unpublished. Learners who already bought it keep their access.",
      "Failed to unpublish course.",
    );

  const handleRequestUnpublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPublishingActionPending(true);
    try {
      await requestUnpublish({
        courseId: courseId as Id<"courses">,
        reason: unpublishReason.trim() || undefined,
      });
      setIsRequestDialogOpen(false);
      setUnpublishReason("");
      toast.success("Request submitted. An admin will review it shortly.");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit the request.",
      );
    } finally {
      setIsPublishingActionPending(false);
    }
  };

  const handleWithdrawRequest = () =>
    runPublishingAction(
      () => withdrawUnpublishRequest({ courseId: courseId as Id<"courses"> }),
      "Request withdrawn.",
      "Failed to withdraw the request.",
    );

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingThumbnail(true);
    try {
      // 1. Get a short-lived upload URL
      const postUrl = await generateUploadUrl();

      // 2. POST the file to the URL
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const { storageId } = await result.json();

      // 3. Resolve the permanent URL via the getFileUrl query
      pendingStorageId.current = storageId;
      setResolvedStorageId(storageId);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploadingThumbnail(false);
      // Clear the input so it can be used again for the same file if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLessonData.title) return;
    
    setIsCreatingLesson(true);
    try {
      const order = courseData?.lessons ? courseData.lessons.length : 0;
      await createLesson({
        courseId: courseId as Id<"courses">,
        title: newLessonData.title,
        contentType: newLessonData.contentType,
        order,
      });
      toast.success("Lesson created");
      setIsLessonDialogOpen(false);
      setNewLessonData({ title: "", contentType: "video" });
    } catch (error) {
      console.error(error);
      toast.error("Failed to create lesson");
    } finally {
      setIsCreatingLesson(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "video": return <Video className="h-4 w-4" />;
      case "article": return <FileText className="h-4 w-4" />;
      case "quiz": return <HelpCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (courseData === undefined) {
    return (
      <div className="flex flex-col gap-6 w-full pb-20">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="size-9.5" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex w-full">
          <Skeleton className="h-10 w-24 mr-2" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
             </div>
             <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (courseData === null) {
    return (
      <div className="w-full pb-20">
        <EmptyState
          icon={SearchX}
          title="Course not found"
          description="This course does not exist, or it is not one of yours to edit."
          action={
            <Button onClick={() => router.push("/dashboard/instructor/courses")}>Back to Courses</Button>
          }
        />
      </div>
    );
  }

  return (
    <PageShell className="gap-6 pb-20">
      {/* Back sits above the header rather than inside its action slot, so it
          keeps its place at the leading edge of the page. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to my courses"
        className="-ml-2 self-start"
        onClick={() => router.push("/dashboard/instructor/courses")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* The course title is the description, so the heading stays a stable
          "Edit course" rather than repeating it in display type. Sentence case
          to match the rest of the console. */}
      <PageHeader
        title="Edit course"
        description={courseData.course.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={courseData.course.published ? "default" : "secondary"}>
              {courseData.course.published ? "Published" : "Draft"}
            </Badge>
            {publishing?.pendingRequest && (
              <Badge variant="outline">
                <Clock className="h-3 w-3" />
                Unpublish requested
              </Badge>
            )}
            {courseData.course.slug && (
              <Button variant="outline" size="sm" onClick={() => window.open(`/courses/${courseData.course.slug}`, "_blank")}>
                <ExternalLink className="h-4 w-4" />
                View public page
              </Button>
            )}
          </div>
        }
      />
      
      <Tabs defaultValue="details" className="w-full">
        {/* Section switching, so the `rule` variant: a hairline under the strip
            with a brand bar on the selected tab. Selection reads as position
            and weight. */}
        <TabsList variant="rule" className="touch-target">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="content">Curriculum</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-6">
          <div className="flex flex-col gap-6">
            {publishing === undefined ? (
              <Card>
                <CardContent className="pt-6">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ) : (
              <PublishingPanel
                state={publishing}
                pending={isPublishingActionPending}
                isRequestDialogOpen={isRequestDialogOpen}
                setIsRequestDialogOpen={setIsRequestDialogOpen}
                unpublishReason={unpublishReason}
                setUnpublishReason={setUnpublishReason}
                onPublish={handlePublish}
                onUnpublish={handleUnpublish}
                onRequestSubmit={handleRequestUnpublish}
                onWithdrawRequest={handleWithdrawRequest}
              />
            )}
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Course Details</CardTitle>
                <CardDescription>Update the metadata for this course.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Course Title</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleTitleChange}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                      id="slug"
                      name="slug"
                      value={formData.slug}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="thumbnailUrl">Thumbnail Image</Label>
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        id="thumbnailUrl"
                        name="thumbnailUrl"
                        value={formData.thumbnailUrl}
                        onChange={handleChange}
                        placeholder="https://images.unsplash.com/... or upload below"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleThumbnailUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingThumbnail}
                        >
                          {isUploadingThumbnail ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-4 w-4" />
                          )}
                          Upload Image
                        </Button>
                        {formData.thumbnailUrl && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setFormData(prev => ({ ...prev, thumbnailUrl: "" }))}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    {formData.thumbnailUrl && (
                      <div className="w-32 h-20 shrink-0 overflow-hidden border border-rule bg-surface-sunken">
                        <img 
                          src={formData.thumbnailUrl} 
                          alt="Thumbnail preview" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-[1.5] text-muted-foreground">
                    Upload an image or provide a valid image URL to represent this course.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      placeholder="e.g. Programming"
                      list="admin-categories"
                    />
                    <datalist id="admin-categories">
                      {(categoryOptions ?? []).map((option) => (
                        <option key={option._id} value={option.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="level">Level</Label>
                    <Input
                      id="level"
                      name="level"
                      value={formData.level}
                      onChange={handleChange}
                      placeholder="e.g. Beginner"
                    />
                  </div>
                </div>
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="priceNaira">Price (₦, in Naira)</Label>
                  <Input
                    id="priceNaira"
                    name="priceNaira"
                    type="number"
                    min="0"
                    step="100"
                    value={formData.priceNaira}
                    onChange={handleChange}
                    placeholder="0"
                    className="tabular"
                  />
                  <p className="text-xs leading-[1.5] text-muted-foreground">
                    Leave empty (or 0) for a free course. Paid courses are collected via Paystack.
                  </p>
                  {publishing?.policy === "needs_approval" && (
                    /* No `warning` colour token is registered, so the stock amber
                       stays here; the sentence carries the meaning, not the hue. */
                    <p className="text-xs leading-[1.5] text-warning">
                      <span className="tabular">{publishing.paidSales}</span>{" "}
                      learner{publishing.paidSales === 1 ? "" : "s"} already paid
                      for this course. From now on, taking it off sale needs admin approval.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </form>
          </div>
        </TabsContent>
        <TabsContent value="content" className="pt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Curriculum</CardTitle>
                  <CardDescription>Manage the modules and lessons for this course.</CardDescription>
                </div>
                <Dialog open={isLessonDialogOpen} onOpenChange={setIsLessonDialogOpen}>
                  <DialogTrigger render={
                    <Button size="sm" type="button">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Lesson
                    </Button>
                  } />
                  <DialogContent>
                    <form onSubmit={handleCreateLesson}>
                      <DialogHeader>
                        <DialogTitle>Create New Lesson</DialogTitle>
                        <DialogDescription>
                          Add a new lesson to your course curriculum.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-title">Lesson Title</Label>
                          <Input
                            id="lesson-title"
                            value={newLessonData.title}
                            onChange={(e) => setNewLessonData({ ...newLessonData, title: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-type">Content Type</Label>
                          <Select
                            value={newLessonData.contentType}
                            onValueChange={(value) => setNewLessonData({ ...newLessonData, contentType: value as "video" | "article" | "quiz" })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="video">
                                <div className="flex items-center gap-2">
                                  <Video className="h-4 w-4" />
                                  <span>Video</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="article">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  <span>Article</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="quiz">
                                <div className="flex items-center gap-2">
                                  <HelpCircle className="h-4 w-4" />
                                  <span>Quiz</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsLessonDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isCreatingLesson}>
                          {isCreatingLesson && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Create Lesson
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {courseData.lessons.length === 0 ? (
                <EmptyState
                  icon={LayoutList}
                  title="No lessons yet"
                  description="Add your first lesson to start building the curriculum."
                  action={
                    <Button variant="outline" onClick={() => setIsLessonDialogOpen(true)}>
                      <PlusCircle className="h-4 w-4" />
                      Add Lesson
                    </Button>
                  }
                />
              ) : (
                /* Lessons are a numbered list, so they read as rows separated by
                   hairlines rather than as a stack of floating cards. */
                <ol className="list-none divide-y divide-rule border-y border-rule">
                  {courseData.lessons
                    .sort((a, b) => a.order - b.order)
                    .map((lesson, index) => (
                      <li
                        key={lesson._id}
                        className="group flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-surface-sunken"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="tabular w-6 shrink-0 text-sm text-muted-foreground">
                            {index + 1}.
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{getIconForType(lesson.contentType)}</span>
                            <span className="truncate text-sm font-medium">{lesson.title}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary">{lesson.contentType}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/instructor/courses/${courseData.course._id}/lessons/${lesson._id}`)}
                          >
                            Edit
                          </Button>
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="certificates" className="pt-6">
          <CertificatesPanel courseId={courseData.course._id as Id<"courses">} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/**
 * The publishing controls, split out because they are the one part of this
 * page whose shape is decided by the server: whether unpublishing is a button
 * or a request is `policy`, not something this file can work out from the
 * price input (which may not even be saved yet).
 */
function PublishingPanel({
  state,
  pending,
  isRequestDialogOpen,
  setIsRequestDialogOpen,
  unpublishReason,
  setUnpublishReason,
  onPublish,
  onUnpublish,
  onRequestSubmit,
  onWithdrawRequest,
}: {
  state: {
    published: boolean;
    paidSales: number;
    policy: "free" | "paid_unsold" | "needs_approval";
    isAdmin: boolean;
    pendingRequest: { _id: string; reason: string | null; createdAt: number } | null;
  };
  pending: boolean;
  isRequestDialogOpen: boolean;
  setIsRequestDialogOpen: (open: boolean) => void;
  unpublishReason: string;
  setUnpublishReason: (reason: string) => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onRequestSubmit: (e: React.FormEvent) => void;
  onWithdrawRequest: () => void;
}) {
  const isGated = state.policy === "needs_approval";
  const requestPending = state.pendingRequest !== null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Visibility</CardTitle>
            <CardDescription>
              {state.published
                ? "This course is listed and on sale."
                : "This course is a draft and is not listed."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {state.published ? (
              <>
                {/* An admin answering a support ticket must not have to impersonate
                    the request flow, so the direct action stays available to them. */}
                {isGated && state.isAdmin ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onUnpublish}
                    disabled={pending || requestPending}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    Unpublish now
                  </Button>
                ) : isGated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRequestDialogOpen(true)}
                    disabled={pending || requestPending}
                  >
                    <Send className="h-4 w-4" />
                    Request unpublish
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onUnpublish}
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    Unpublish
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" onClick={onPublish} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Publish course
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {(isGated || requestPending) && (
        <CardContent className="space-y-3">
          {requestPending ? (
            <>
              {/* No `warning` colour token is registered, so the amber plate stays — it is a
                  caution, not a status, and the wording carries the meaning. */}
              <div className="border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-warning">
                    Unpublish request awaiting admin review
                  </p>
                  <p className="text-sm leading-[1.6] text-warning/80">
                    <span className="tabular">{state.paidSales}</span>{" "}
                    learner{state.paidSales === 1 ? "" : "s"} already paid for
                    this course, so taking it off sale needs an admin. The course stays live and
                    on sale until they decide.
                  </p>
                  {state.pendingRequest?.reason && (
                    <p className="text-sm italic leading-[1.6] text-amber-900/80 dark:text-amber-300/80">
                      &ldquo;{state.pendingRequest.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-warning/70">
                    Submitted{" "}
                    {new Date(state.pendingRequest!.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  {!state.isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onWithdrawRequest}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                      Withdraw request
                    </Button>
                  )}
                </div>
              </div>
            </div>
            </>
          ) : (
            <div className="border border-rule bg-surface-sunken p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm leading-[1.6] text-muted-foreground">
                  <span className="tabular">{state.paidSales}</span>{" "}
                  learner{state.paidSales === 1 ? " has" : "s have"} already paid
                  for this course. You can keep selling it or change anything else about it, but
                  taking it off sale now goes to an admin first. Learners who bought it keep access
                  either way.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      )}

      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
          <form onSubmit={onRequestSubmit}>
            <DialogHeader>
              <DialogTitle>Request unpublish</DialogTitle>
              <DialogDescription>
                An admin will review this. Tell them why — for example, a content error, a
                correction that needs re-recording, or a request from learners. The course stays on
                sale until they respond.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="unpublishReason">Reason</Label>
              <Textarea
                id="unpublishReason"
                rows={4}
                value={unpublishReason}
                onChange={(e) => setUnpublishReason(e.target.value)}
                placeholder="Optional, but it speeds up the review."
                maxLength={500}
              />
              <p className="tabular mt-1 text-xs text-muted-foreground">
                {unpublishReason.length}/500
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRequestDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
