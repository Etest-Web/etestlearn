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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { ArrowLeft, Loader2, Save, LayoutList, PlusCircle, AlignJustify, Video, FileText, HelpCircle, ExternalLink, Upload, Globe, EyeOff, ShieldAlert, Send, Undo2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { slugify } from "@/lib/slug";
import { CertificatesPanel } from "@/components/course-certificates-panel";

export default function CourseEditPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  
  const courseData = useQuery(api.courses.getCourseById, { courseId: courseId as Id<"courses"> });
  const updateCourse = useMutation(api.courses.updateCourse);
  const createLesson = useMutation(api.courses.createLesson);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Publishing is a separate operation from editing metadata (see
  // `lib/publishing.ts`), so the server decides which controls exist rather
  // than this page guessing from the price field.
  const publishing = useQuery(api.courses.getCoursePublishingState, {
    courseId: courseId as Id<"courses">,
  });
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
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex w-full mt-4">
          <Skeleton className="h-10 w-24 mr-2" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Card className="mt-2">
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
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-xl font-semibold">Course not found</h2>
        <Button onClick={() => router.push("/dashboard/instructor")}>Back to Courses</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-20">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/instructor")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Edit Course</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={courseData.course.published ? "default" : "secondary"}>
            {courseData.course.published ? "Published" : "Draft"}
          </Badge>
          {publishing?.pendingRequest && (
            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
              <Clock className="mr-1 h-3 w-3" />
              Unpublish requested
            </Badge>
          )}
          {courseData.course.slug && (
            <Button variant="outline" size="sm" onClick={() => window.open(`/courses/${courseData.course.slug}`, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View public page
            </Button>
          )}
        </div>
      </div>
      
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 touch-target">
          <TabsTrigger
            value="details"
            className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none touch-target"
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            value="content"
            className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none touch-target"
          >
            Curriculum
          </TabsTrigger>
          <TabsTrigger
            value="certificates"
            className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none touch-target"
          >
            Certificates
          </TabsTrigger>
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
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Course Title</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleTitleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
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

                <div className="space-y-2">
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
                <div className="space-y-2">
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
                      <div className="w-32 h-20 bg-muted rounded-lg overflow-hidden border border-border shadow-sm shrink-0">
                        <img 
                          src={formData.thumbnailUrl} 
                          alt="Thumbnail preview" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload an image or provide a valid image URL to represent this course.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      placeholder="e.g. Programming"
                    />
                  </div>
                  <div className="space-y-2">
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
                <div className="space-y-2 max-w-xs">
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
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty (or 0) for a free course. Paid courses are collected via Paystack.
                  </p>
                  {publishing?.policy === "needs_approval" && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {publishing.paidSales} learner{publishing.paidSales === 1 ? "" : "s"} already paid
                      for this course. From now on, taking it off sale needs admin approval.
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t pt-4">
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
                        <div className="space-y-2">
                          <Label htmlFor="lesson-title">Lesson Title</Label>
                          <Input
                            id="lesson-title"
                            value={newLessonData.title}
                            onChange={(e) => setNewLessonData({ ...newLessonData, title: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
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
                <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed">
                  <LayoutList className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-sm font-medium">No lessons yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Add your first lesson to start building the curriculum.</p>
                  <Button variant="outline" onClick={() => setIsLessonDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Lesson
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {courseData.lessons
                    .sort((a, b) => a.order - b.order)
                    .map((lesson, index) => (
                      <div
                        key={lesson._id}
                        className="flex items-center justify-between gap-3 p-3 bg-muted/50 border rounded-lg hover:bg-muted transition-colors group"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <button aria-label={`Reorder ${lesson.title}`} className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground">
                            <AlignJustify className="h-4 w-4" />
                          </button>
                          <span className="w-6 shrink-0 text-sm font-medium text-muted-foreground">
                            {index + 1}.
                          </span>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0">{getIconForType(lesson.contentType)}</span>
                            <span className="truncate font-medium text-sm">{lesson.title}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className="capitalize text-xs font-normal">
                            {lesson.contentType}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/instructor/courses/${courseData.course._id}/lessons/${lesson._id}`)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="certificates" className="pt-6">
          <CertificatesPanel courseId={courseData.course._id as Id<"courses">} />
        </TabsContent>
      </Tabs>
    </div>
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="mr-2 h-4 w-4" />
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
                    <Send className="mr-2 h-4 w-4" />
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <EyeOff className="mr-2 h-4 w-4" />
                    )}
                    Unpublish
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" onClick={onPublish} disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="mr-2 h-4 w-4" />
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
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                    Unpublish request awaiting admin review
                  </p>
                  <p className="text-sm text-amber-900/80 dark:text-amber-300/80">
                    {state.paidSales} learner{state.paidSales === 1 ? "" : "s"} already paid for
                    this course, so taking it off sale needs an admin. The course stays live and
                    on sale until they decide.
                  </p>
                  {state.pendingRequest?.reason && (
                    <p className="text-sm italic text-amber-900/80 dark:text-amber-300/80">
                      &ldquo;{state.pendingRequest.reason}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-amber-900/70 dark:text-amber-300/70">
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="mr-2 h-4 w-4" />
                      )}
                      Withdraw request
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {state.paidSales} learner{state.paidSales === 1 ? " has" : "s have"} already paid
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
            <div className="py-4">
              <Label htmlFor="unpublishReason">Reason</Label>
              <Textarea
                id="unpublishReason"
                rows={4}
                className="mt-2"
                value={unpublishReason}
                onChange={(e) => setUnpublishReason(e.target.value)}
                placeholder="Optional, but it speeds up the review."
                maxLength={500}
              />
              <p className="mt-1 text-xs text-muted-foreground">
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
