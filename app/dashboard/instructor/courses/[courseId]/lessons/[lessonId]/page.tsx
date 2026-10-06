"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/ui";
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
import { ArrowLeft, Loader2, Save, Trash2, Video, FileText, HelpCircle, PlusCircle, CheckCircle, XCircle, SearchX } from "lucide-react";
import { toast } from "sonner";
import { VideoUpload } from "@/components/video-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function LessonEditPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  const lessonId = params.lessonId as string;
  
  // We need a way to fetch just this lesson and its parent course
  // For now we'll fetch the whole course and find the lesson
  const courseData = useQuery(api.courses.getCourseById, { courseId: courseId as Id<"courses"> });
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
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    title: "",
    contentType: "video" as "video" | "article" | "quiz",
    durationMinutes: "",
    content: "", // For article/video url
  });

  const lesson = courseData?.lessons?.find((l) => l._id === lessonId);

  useEffect(() => {
    if (lesson) {
      setFormData({
        title: lesson.title,
        contentType: lesson.contentType as "video" | "article" | "quiz",
        durationMinutes: lesson.durationMinutes?.toString() || "",
        content: lesson.content || "",
      });
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
    <div className="flex flex-col gap-6 w-full pb-20">
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
        title="Edit Lesson"
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
                onValueChange={(value) => setFormData((prev) => ({ ...prev, contentType: value as "video" | "article" | "quiz" }))}
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

            {formData.contentType === "video" && (
              <div className="space-y-4">
                <VideoUpload lessonId={lessonId as Id<"lessons">} />
                <div className="space-y-1.5">
                  <Label htmlFor="content">Video URL</Label>
                  <Input
                    id="content"
                    name="content"
                    placeholder="Publit.io URL, YouTube, Vimeo, or direct MP4..."
                    value={formData.content}
                    onChange={handleChange}
                  />
                  <p className="text-xs leading-[1.5] text-muted-foreground">Automatically filled when uploading with Publit.io above, or paste an external video link.</p>
                </div>
              </div>
            )}

            {formData.contentType === "article" && (
              <div className="space-y-1.5">
                <Label htmlFor="content">Article Content (Markdown)</Label>
                {/* Write and Preview are two views of the same text, so they get
                    the `segmented` variant rather than a section rule. */}
                <Tabs defaultValue="write">
                  <TabsList variant="segmented" className="touch-target">
                    <TabsTrigger value="write">Write</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="write">
                    <Textarea
                      id="content"
                      name="content"
                      rows={15}
                      placeholder="# Hello World&#10;&#10;Write your article here using markdown."
                      value={formData.content}
                      onChange={handleChange}
                      className="font-mono text-sm"
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    {formData.content.trim() ? (
                      <div className="min-h-[240px] border border-rule bg-surface-sunken p-4 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {formData.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex min-h-[240px] items-center justify-center border border-rule text-sm text-muted-foreground">
                        Nothing to preview yet — start writing in the Write tab.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
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

          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
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
