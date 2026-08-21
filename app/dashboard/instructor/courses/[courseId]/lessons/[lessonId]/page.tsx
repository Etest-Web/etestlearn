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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { ArrowLeft, Loader2, Save, Trash2, Video, FileText, HelpCircle, PlusCircle, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
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
  const updateQuiz = useMutation(api.quizzes.updateQuiz);
  const addQuizQuestion = useMutation(api.quizzes.addQuizQuestion);
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
    if (!window.confirm("Are you sure you want to delete this lesson? This action cannot be undone.")) {
      return;
    }
    
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
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
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
             <Skeleton className="h-12 w-full" />
             <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (courseData === null || !lesson) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h2 className="text-xl font-semibold">Lesson not found</h2>
        <Button onClick={() => router.push(`/dashboard/instructor/courses/${courseId}`)}>
          Back to Course Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/instructor/courses/${courseId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Edit Lesson</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Lesson Details</CardTitle>
            <CardDescription>Update the content and metadata for this lesson.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Lesson Title *</Label>
                <Input
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (Minutes)</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min="0"
                  value={formData.durationMinutes}
                  onChange={handleChange}
                  placeholder="e.g. 15"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type</Label>
              <Select
                value={formData.contentType}
                onValueChange={(value: any) => setFormData((prev) => ({ ...prev, contentType: value }))}
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
              <div className="space-y-2">
                <Label htmlFor="content">Video URL</Label>
                <Input
                  id="content"
                  name="content"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={formData.content}
                  onChange={handleChange}
                />
                <p className="text-xs text-muted-foreground">Enter a link to YouTube, Vimeo, or a direct MP4 file.</p>
              </div>
            )}

            {formData.contentType === "article" && (
              <div className="space-y-2">
                <Label htmlFor="content">Article Content (Markdown)</Label>
                <Tabs defaultValue="write">
                  <TabsList>
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
                      className="font-mono text-sm rounded-t-none border-t-0"
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    {formData.content.trim() ? (
                      <div className="min-h-[240px] rounded-lg border p-4 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {formData.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex min-h-[240px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
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
                  <div className="rounded-md border p-6 text-center bg-muted/20">
                    <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No Quiz Found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create a quiz for this lesson to start adding questions.
                    </p>
                    <Button type="button" onClick={handleCreateQuiz}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Initialize Quiz
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6 border-t pt-6 mt-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Quiz Questions</h3>
                      <Dialog>
                        <DialogTrigger>
                          <Button size="sm" type="button">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Question
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <AddQuestionForm quizId={quizData.quiz._id} />
                        </DialogContent>
                      </Dialog>
                    </div>

                    {quizData.questions.length === 0 ? (
                      <div className="rounded-md border p-8 text-center border-dashed">
                        <p className="text-sm text-muted-foreground">No questions added yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {quizData.questions.map((q, index) => (
                          <Card key={q.question._id}>
                            <CardHeader className="py-4 flex flex-row items-start justify-between space-y-0">
                              <div className="space-y-1">
                                <CardTitle className="text-base font-medium">
                                  {index + 1}. {q.question.prompt}
                                </CardTitle>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2"
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
                            <CardContent className="py-0 pb-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {q.options.map((opt) => (
                                  <div
                                    key={opt._id}
                                    className={`flex items-center gap-2 p-2 rounded-md border text-sm ${
                                      correctOptionIds.has(opt._id) ? "bg-green-500/10 border-green-500/20" : "bg-muted/50"
                                    }`}
                                  >
                                    {correctOptionIds.has(opt._id) ? (
                                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
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
          <CardFooter className="flex justify-end border-t pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
        <div className="space-y-2">
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
          {options.map((option, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="radio"
                name="correct-option"
                checked={option.isCorrect}
                onChange={() => {
                  const newOptions = [...options];
                  newOptions.forEach((o, i) => o.isCorrect = i === idx);
                  setOptions(newOptions);
                }}
                className="h-4 w-4"
              />
              <Input
                value={option.text}
                onChange={e => {
                  const newOptions = [...options];
                  newOptions[idx].text = e.target.value;
                  setOptions(newOptions);
                }}
                placeholder={`Option ${idx + 1}`}
                className={option.isCorrect ? "border-green-500" : ""}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2">
            Select the radio button next to the correct option. Leave extra options blank to omit them.
          </p>
        </div>
      </div>
      
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Question
        </Button>
      </DialogFooter>
    </form>
  );
}
