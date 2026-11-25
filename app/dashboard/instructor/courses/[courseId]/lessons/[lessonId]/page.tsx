"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Boxes, Loader2, Save, Trash2, Video, File, FileText, HelpCircle, PlusCircle, CheckCircle, XCircle, SearchX, Upload, Image, Code2, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { VideoUploader } from "@/components/video-uploader";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CourseSectionPicker, courseSections } from "@/components/course-section-picker";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";

export default function LessonEditPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.courseId as string | undefined;
  const lessonId = params?.lessonId as string | undefined;
  
  // We need a way to fetch this lesson and its parent course
  // For now we'll fetch the whole course and find the lesson
  const courseData = useQuery(
    api.courses.getCourseById,
    courseId ? { courseId: courseId as Id<"courses"> } : "skip"
  );
  const updateLesson = useMutation(api.courses.updateLesson);
  const deleteLesson = useMutation(api.courses.deleteLesson);
  
  const quizData = useQuery(api.quizzes.getQuizForLesson, { lessonId: lessonId as Id<"lessons"> });
  const answerKey = useQuery(
    api.quizzes.getQuizAnswerKey,
    quizData ? { quizId: quizData.quiz._id } : "skip",
  );
  const correctOptionIds = new Set(
    (answerKey ?? []).flatMap((k) => k.correctOptionIds),
  );
  const createQuiz = useMutation(api.quizzes.createQuiz);
  const deleteQuizQuestion = useMutation(api.quizzes.deleteQuizQuestion);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const extractAndStoreScormPackage = useAction(api.scormPackageActions.extractAndStoreScormPackage);
  const generateArticleImageUploadUrl = useMutation(api.files.generateArticleImageUploadUrl);
  const validateArticleImageUpload = useMutation(api.files.validateArticleImageUpload);
  const registerLessonAttachment = useMutation(api.lessonAttachments.registerLessonAttachment);
  const deleteLessonAttachment = useMutation(api.lessonAttachments.deleteLessonAttachment);
  const listLessonAttachments = useQuery(
    api.lessonAttachments.listLessonAttachments,
    lessonId ? { lessonId: lessonId as Id<"lessons"> } : "skip"
  );
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  
  async function handlePresentationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("Presentation must be under 50 MB");
      return;
    }
    setIsUploadingVideo(true);
    try {
      const postUrl = await generateUploadUrl({});
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: string };
      setUploadedPresentationStorageId(storageId);
      setFormData((prev) => ({ ...prev, presentationFileName: file.name }));
      toast.success("Presentation uploaded — save to attach it to the lesson");
    } catch {
      toast.error("Presentation upload failed. Please try again.");
    } finally {
      setIsUploadingVideo(false);
      if (presentationInputRef.current) presentationInputRef.current.value = "";
    }
  }

  const handleScormUpload = async (file: File) => {
    if (!courseId) return;
    setIsUploadingScorm(true);
    try {
      const postUrl = await generateUploadUrl({});
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/zip" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: string };
      const pkg = await extractAndStoreScormPackage({
        courseId: courseId as Id<"courses">,
        zipStorageId: storageId as Id<"_storage">,
      });
      setUploadedScormPackageId(pkg.packageId);
      setFormData((prev) => ({ ...prev, scormFileName: file.name }));
      toast.success("SCORM package unpacked — save to attach it to the lesson");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SCORM upload failed. Please try again.");
    } finally {
      setIsUploadingScorm(false);
      if (scormInputRef.current) scormInputRef.current.value = "";
    }
  };
  
  const [formData, setFormData] = useState({
    title: "",
    contentType: "video" as "video" | "article" | "quiz" | "presentation" | "scorm",
    durationMinutes: "",
    content: "", // Article body / legacy video URL
    contentFormat: "markdown" as "markdown" | "html",
    videoFileName: "",
    presentationFileName: "",
    scormFileName: "",
    section: "",
  });
  const [uploadedPresentationStorageId, setUploadedPresentationStorageId] = useState<string | null>(null);
  const [uploadedScormPackageId, setUploadedScormPackageId] = useState<string | null>(null);
  const [isUploadingScorm, setIsUploadingScorm] = useState(false);
  const presentationInputRef = useRef<HTMLInputElement>(null);
  const scormInputRef = useRef<HTMLInputElement>(null);

  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);

  const lesson = courseData?.lessons?.find((l) => l._id === lessonId);
  // Existing module labels, so moving a lesson into a module is a pick rather
  // than a retype that could create a near-duplicate group.
  const moduleOptions = courseSections(courseData?.lessons ?? []);

  useEffect(() => {
    if (lesson) {
      setFormData({
        title: lesson.title,
        contentType: lesson.contentType as "video" | "article" | "quiz" | "presentation" | "scorm",
        durationMinutes: lesson.durationMinutes?.toString() || "",
        content: lesson.content || "",
        contentFormat: (lesson.contentFormat as "markdown" | "html") || "markdown",
        videoFileName: lesson.videoFileName || "",
        presentationFileName: (lesson as any).presentationFileName || "",
        scormFileName: "",
        section: (lesson as any).section || "",
      });
      setUploadedScormPackageId((lesson as any).scormPackageId ?? null);
    }
  }, [lesson]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateLesson({
        lessonId: lessonId as Id<"lessons">,
        title: formData.title,
        contentType: formData.contentType,
        durationMinutes: formData.durationMinutes ? parseInt(formData.durationMinutes) : undefined,
        content: formData.content,
        videoFileName: formData.videoFileName,
        contentFormat: formData.contentFormat,
        presentationStorageId: uploadedPresentationStorageId ? (uploadedPresentationStorageId as Id<"_storage">) : undefined,
        presentationFileName: formData.presentationFileName || undefined,
        scormPackageId: formData.contentType === "scorm" && uploadedScormPackageId
          ? (uploadedScormPackageId as Id<"scormPackages">)
          : undefined,
        section: formData.section,
      });
      toast.success("Lesson updated successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update lesson");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteLesson({ lessonId: lessonId as Id<"lessons"> });
      toast.success("Lesson deleted");
      router.push(`/dashboard/instructor/courses/${courseId}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete lesson");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateQuiz = async () => {
    try {
      await createQuiz({
        lessonId: lessonId as Id<"lessons">,
        title: `${formData.title} Quiz`,
        passingScore: 80, // Default passing score
      });
      toast.success("Quiz created");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create quiz");
    }
  };

  if (courseData === undefined) {
    return (
      <div className="flex flex-col gap-6 w-full pb-20">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="size-9.5" />
          <Skeleton className="h-8 w-48" />
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
             <Skeleton className="h-12 w-full" />
             <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (courseData === null || !lesson) {
    return (
      <div className="w-full pb-20">
        <EmptyState
          icon={SearchX}
          title="Lesson not found"
          description="This lesson does not exist, or it has been removed from the course."
          action={
            <Button onClick={() => router.push(`/dashboard/instructor/courses/${courseId}`)}>
              Back to Course Edit
            </Button>
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
        aria-label="Back to course edit"
        className="-ml-2 self-start"
        onClick={() => router.push(`/dashboard/instructor/courses/${courseId}`)}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <PageHeader
        title="Edit lesson"
        description="Content, quiz and ordering for this lesson."
        actions={
          <AlertDialog>
            <AlertDialogTrigger render={
              <Button variant="destructive" size="sm" type="button" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            } />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the lesson and its quiz questions. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
            <CardDescription>Update the content and metadata for this lesson.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Lesson Title *</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="section">Module (optional)</Label>
                <CourseSectionPicker
                  id="section"
                  value={formData.section}
                  sections={moduleOptions}
                  onChange={(section) => setFormData((prev) => ({ ...prev, section }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="durationMinutes">Duration (Minutes)</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min="0"
                  value={formData.durationMinutes}
                  onChange={handleChange}
                  placeholder="e.g. 15"
                  className="tabular"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contentType">Content Type</Label>
              <Select
                value={formData.contentType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, contentType: value as "video" | "article" | "quiz" | "presentation" | "scorm" }))}
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
                  <SelectItem value="presentation">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4" />
                      <span>Presentation</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="scorm">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4" />
                      <span>SCORM package</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.contentType === "video" && (
              <div className="space-y-4">
                <VideoUploader lessonId={lessonId as Id<"lessons">} />
                {formData.videoFileName && (
                  <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2 text-sm text-green-700 dark:text-green-400">
                    <File className="h-4 w-4" />
                    <span className="font-medium">Uploaded file:</span>
                    <span className="truncate max-w-xs font-mono text-xs" title={formData.videoFileName}>
                      {formData.videoFileName}
                    </span>
                  </div>
                )}
              </div>
            )}

            {formData.contentType === "presentation" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Presentation File</Label>
                  <input
                    type="file"
                    accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                    className="hidden"
                    ref={presentationInputRef}
                    onChange={handlePresentationUpload}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => presentationInputRef.current?.click()}
                      disabled={isUploadingVideo}
                    >
                      {isUploadingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Upload Presentation
                    </Button>
                    {uploadedPresentationStorageId && <span className="text-xs text-muted-foreground">Ready to save</span>}
                  </div>
                  {(formData.presentationFileName || (lesson as any).presentationFileName) && (
                    <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2 text-sm text-green-700 dark:text-green-400">
                      <File className="h-4 w-4" />
                      <span className="font-medium">Attached:</span>
                      <span className="truncate max-w-xs font-mono text-xs" title={formData.presentationFileName || (lesson as any).presentationFileName}>
                        {formData.presentationFileName || (lesson as any).presentationFileName}
                      </span>
                    </div>
                  )}
                  <p className="text-xs leading-[1.5] text-muted-foreground">Upload PPT, PPTX, or PDF. Students can download it from the lesson page.</p>
                </div>
              </div>
            )}

            {formData.contentType === "scorm" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>SCORM Package</Label>
                  <input
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    className="hidden"
                    ref={scormInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleScormUpload(file);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => scormInputRef.current?.click()}
                      disabled={isUploadingScorm}
                    >
                      {isUploadingScorm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploadedScormPackageId ? "Replace Package" : "Upload SCORM Package"}
                    </Button>
                    {uploadedScormPackageId && <span className="text-xs text-muted-foreground">Ready to save</span>}
                  </div>
                  {formData.scormFileName && (
                    <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2 text-sm text-green-700 dark:text-green-400">
                      <Boxes className="h-4 w-4" />
                      <span className="font-medium">Attached:</span>
                      <span className="truncate max-w-xs font-mono text-xs" title={formData.scormFileName}>
                        {formData.scormFileName}
                      </span>
                    </div>
                  )}
                  {!uploadedScormPackageId && (lesson as any).scormPackageId && (
                    <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2 text-sm text-green-700 dark:text-green-400">
                      <Boxes className="h-4 w-4" />
                      <span>Existing package attached — upload to replace.</span>
                    </div>
                  )}
                  <p className="text-xs leading-[1.5] text-muted-foreground">Upload a SCORM 1.2 or 2004 zip. It is unpacked and served to students from the lesson page.</p>
                </div>
              </div>
            )}

            {formData.contentType === "article" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contentFormat">Content Format</Label>
                  <Select
                    id="contentFormat"
                    value={formData.contentFormat}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, contentFormat: value as "markdown" | "html" }))}
                  >
                    <SelectTrigger className="min-w-[200px]">
                      <SelectValue placeholder="Choose format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="markdown">
                        <div className="flex items-center gap-2">
                          <Code2 className="h-4 w-4 shrink-0" />
                          <span>Markdown</span>
                          <span className="ml-auto text-xs text-muted-foreground">plain text</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="html">
                        <div className="flex items-center gap-2">
                          <LayoutDashboard className="h-4 w-4 shrink-0" />
                          <span>HTML</span>
                          <span className="ml-auto text-xs text-muted-foreground">rich text</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="content">Article Content</Label>
                    <span className="text-sm text-muted-foreground">
                      {formData.contentFormat === "html" ? "HTML" : "Markdown"}
                    </span>
                  </div>
                  <Tabs defaultValue="write">
                    <TabsList variant="segmented" className="touch-target">
                      <TabsTrigger value="write">Write</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                    <TabsContent value="write">
                      {formData.contentFormat === "markdown" ? (
                        <Textarea
                          id="content"
                          name="content"
                          rows={24}
                          placeholder={"# Hello World\n\nWrite your article here using markdown."}
                          value={formData.content}
                          onChange={handleChange}
                          className="font-mono text-sm h-64 min-h-[400px] overflow-y-auto border border-rule rounded-md bg-surface-sunken dark:bg-surface-900 dark:border-surface-800"
                        />
                      ) : (
                        <div className="space-y-2">
                          <Textarea
                            ref={htmlTextareaRef}
                            id="content"
                            name="content"
                            rows={24}
                            placeholder={"<h1>Hello World</h1>\n\nWrite your article here using HTML."}
                            value={formData.content}
                            onChange={handleChange}
                            className="font-mono text-sm h-64 min-h-[400px] overflow-y-auto border border-rule rounded-md bg-surface-sunken dark:bg-surface-900 dark:border-surface-800"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const postUrl = await generateArticleImageUploadUrl({});
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = "image/*";
                                input.onchange = async (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (!file) return;
                                  if (file.size > 5 * 1024 * 1024) {
                                    return toast.error("Image must be under 5 MB");
                                  }
                                  if (!file.type.startsWith("image/")) {
                                    return toast.error("Only image files are allowed");
                                  }
                                  setIsUploadingVideo(true);
                                  try {
                                    const res = await fetch(postUrl, {
                                      method: "POST",
                                      headers: { "Content-Type": file.type },
                                      body: file,
                                    });
                                    if (!res.ok) throw new Error("Upload failed");
                                    const { storageId } = (await res.json()) as { storageId: string };
                                    const imageUrl = await validateArticleImageUpload({
                                      storageId: storageId as Id<"_storage">,
                                    });
                                    // Insert at the cursor when the textarea knows where it
                                    // was, otherwise append — either way the tag lands in
                                    // `content`, not in a side state.
                                    const imgTag = `<img src="${imageUrl}" alt="" class="max-w-full h-auto" />`;
                                    const el = htmlTextareaRef.current;
                                    setFormData((prev) => {
                                      const start = el?.selectionStart ?? prev.content.length;
                                      const end = el?.selectionEnd ?? prev.content.length;
                                      return {
                                        ...prev,
                                        content: prev.content.slice(0, start) + imgTag + prev.content.slice(end),
                                      };
                                    });
                                    toast.success("Image inserted");
                                  } catch {
                                    toast.error("Image upload failed");
                                  } finally {
                                    setIsUploadingVideo(false);
                                  }
                                };
                                input.click();
                              }}
                              disabled={isUploadingVideo}
                            >
                              <Image className="h-3.5 w-3.5" />
                              Insert Image
                            </Button>
                            {isUploadingVideo && <Loader2 className="h-3 w-3 animate-spin" />}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="preview">
                      {formData.content.trim() ? (
                        <div className="min-h-[400px] overflow-y-auto border border-rule bg-surface-sunken p-4 prose prose-sm dark:prose-invert max-w-none">
                          {formData.contentFormat === "html" ? (
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(formData.content) }}
                            />
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {formData.content}
                            </ReactMarkdown>
                          )}
                        </div>
                      ) : (
                        <div className="flex min-h-[400px] items-center justify-center border border-rule text-sm text-muted-foreground">
                          Nothing to preview yet — start writing in the Write tab.
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}

            {formData.contentType === "quiz" && (
              <div className="space-y-6">
                {!quizData ? (
                  <EmptyState
                    icon={HelpCircle}
                    title="No Quiz Found"
                    description="Create a quiz for this lesson to start adding questions."
                    tone="brand"
                    action={
                      <Button type="button" onClick={handleCreateQuiz}>
                        <PlusCircle className="h-4 w-4" />
                        Initialize Quiz
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-6 border-t border-rule pt-6 mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="display-subheading text-lg text-foreground">Quiz Questions</h3>
                      <Dialog>
                        <DialogTrigger render={
                          <Button size="sm" type="button">
                            <PlusCircle className="h-4 w-4" />
                            Add Question
                          </Button>
                        } />
                        <DialogContent className="max-w-2xl">
                          <AddQuestionForm quizId={quizData.quiz._id} />
                        </DialogContent>
                      </Dialog>
                    </div>

                    {quizData.questions.length === 0 ? (
                      <EmptyState
                        icon={HelpCircle}
                        title="No questions added yet."
                        description="Add the first multiple-choice question to this quiz."
                      />
                    ) : (
                      <div className="space-y-4">
                        {quizData.questions.map((q, index) => (
                          <Card key={q.question._id}>
                            <CardHeader className="flex flex-row items-start justify-between gap-3">
                              <CardTitle>
                                <span className="tabular text-muted-foreground">{index + 1}.</span>{" "}
                                {q.question.prompt}
                              </CardTitle>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete question ${index + 1}`}
                                className="-mt-1 -mr-1 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={async () => {
                                  if (confirm("Delete this question?")) {
                                    await deleteQuizQuestion({ questionId: q.question._id });
                                    toast.success("Question deleted");
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {q.options.map((opt) => (
                                  <div
                                    key={opt._id}
                                    className={`flex items-center gap-2 border p-2 text-sm ${
                                      /* Correctness is carried by the tick/cross icon as
                                         well as the tint, never by colour alone. */
                                      correctOptionIds.has(opt._id)
                                        ? "border-green-500/20 bg-green-500/10"
                                        : "border-rule bg-surface-sunken"
                                    }`}
                                  >
                                    {correctOptionIds.has(opt._id) ? (
                                      <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className={correctOptionIds.has(opt._id) ? "font-medium" : "text-muted-foreground"}>
                                      {opt.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Lesson attachments — instructors upload files students can download. */}
          <Card variant="sunken" size="sm" className="gap-3 space-y-2">
            <h2 className="eyebrow">Attachments</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded border border-rule bg-surface-raised px-2 py-1 text-sm cursor-pointer hover:bg-surface-raised/80">
                <Upload className="h-3.5 w-3.5" />
                Upload attachment
                <input
                  name="attachment"
                  type="file"
                  accept="*/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 25 * 1024 * 1024) {
                      return toast.error("File must be under 25 MB");
                    }
                    setIsUploadingVideo(true);
                    try {
                      const postUrl = await generateUploadUrl({});
                      const res = await fetch(postUrl, {
                        method: "POST",
                        headers: { "Content-Type": file.type },
                        body: file,
                      });
                      if (!res.ok) throw new Error("Upload failed");
                      const { storageId } = (await res.json()) as { storageId: string };
                      await registerLessonAttachment({
                        lessonId: lessonId as Id<"lessons">,
                        storageId: storageId as Id<"_storage">,
                        fileName: file.name,
                        mimeType: file.type,
                        sizeBytes: file.size,
                      });
                      toast.success("Attachment uploaded");
                    } catch {
                      toast.error("Attachment upload failed");
                    } finally {
                      setIsUploadingVideo(false);
                      if (e.target instanceof HTMLInputElement) e.target.value = "";
                    }
                  }}
                />
              </label>
              {isUploadingVideo && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>

            {(listLessonAttachments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments yet.</p>
            ) : (
              <ul className="space-y-1">
                {(listLessonAttachments ?? []).map((att) => (
                  <li key={att._id} className="flex items-center justify-between gap-2 rounded bg-surface-sunken px-2 py-1">
                    <span className="flex items-center gap-2 text-sm truncate min-w-0">
                      <File className="h-3.5 w-3.5 shrink-0" />
                      {att.fileName}
                      {att.sizeBytes != null && (
                        <span className="ml-1 text-[10px] text-muted-foreground shrink-0">
                          ({Math.round(att.sizeBytes / 1024)} KB)
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        if (!confirm(`Delete "${att.fileName}"?`)) return;
                        try {
                          await deleteLessonAttachment({ attachmentId: att._id });
                          toast.success("Attachment removed");
                        } catch {
                          toast.error("Failed to remove attachment");
                        }
                      }}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </PageShell>
  );
}

function AddQuestionForm({ quizId }: { quizId: Id<"quizzes"> }) {
  const addQuizQuestion = useMutation(api.quizzes.addQuizQuestion);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
    { text: "", isCorrect: false },
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) return toast.error("Question prompt is required");
    
    const validOptions = options.filter(o => o.text.trim() !== "");
    if (validOptions.length < 2) return toast.error("At least two options are required");
    if (!validOptions.some(o => o.isCorrect)) return toast.error("At least one option must be correct");

    setIsSubmitting(true);
    try {
      await addQuizQuestion({
        quizId,
        prompt,
        options: validOptions,
      });
      toast.success("Question added");
      setPrompt("");
      setOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add question");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Add Quiz Question</DialogTitle>
        <DialogDescription>Create a new multiple choice question.</DialogDescription>
      </DialogHeader>
      
      <div className="grid gap-6 py-4">
        <div className="space-y-1.5">
          <Label>Question</Label>
          <Textarea 
            value={prompt} 
            onChange={e => setPrompt(e.target.value)} 
            placeholder="e.g. What is the capital of France?" 
            required
          />
        </div>
        
        <div className="space-y-3">
          <Label>Options</Label>
          <RadioGroup
            value={String(Math.max(0, options.findIndex((o) => o.isCorrect)))}
            onValueChange={(value) => {
              const idx = Number(value);
              setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === idx })));
            }}
            className="gap-3"
          >
            {options.map((option, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-3">
                <RadioGroupItem value={String(idx)} id={`option-${idx}`} aria-label={`Mark option ${idx + 1} as correct`} />
                <Input
                  value={option.text}
                  onChange={e => {
                    const text = e.target.value;
                    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, text } : o)));
                  }}
                  placeholder={`Option ${idx + 1}`}
                  className={option.isCorrect ? "border-green-600 dark:border-green-500" : ""}
                />
              </div>
            ))}
          </RadioGroup>
          <p className="text-xs leading-[1.5] text-muted-foreground">
            Select the radio button next to the correct option. Leave extra options blank to omit them.
          </p>
        </div>
      </div>
      
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Add Question
        </Button>
      </DialogFooter>
    </form>
  );
}
