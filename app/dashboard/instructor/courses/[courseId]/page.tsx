"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Switch } from "@/components/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { ArrowLeft, Loader2, Save, Trash2, Globe, LayoutList, PlusCircle, AlignJustify, Video, FileText, HelpCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function CourseEditPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  
  const courseData = useQuery(api.courses.getCourseById, { courseId: courseId as Id<"courses"> });
  const updateCourse = useMutation(api.courses.updateCourse);
  const createLesson = useMutation(api.courses.createLesson);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingLesson, setIsCreatingLesson] = useState(false);
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  
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
    published: false,
  });

  useEffect(() => {
    if (courseData?.course) {
      setFormData({
        title: courseData.course.title,
        slug: courseData.course.slug,
        description: courseData.course.description,
        category: courseData.course.category || "",
        level: courseData.course.level || "",
        published: courseData.course.published,
      });
    }
  }, [courseData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    setFormData((prev) => ({ ...prev, title, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateCourse({
        courseId: courseId as Id<"courses">,
        ...formData,
      });
      toast.success("Course updated successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update course");
    } finally {
      setIsSubmitting(false);
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
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  const course = courseData.course;

  return (
    <div className="flex flex-col gap-6 w-full pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/instructor")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Edit Course</h2>
        </div>
        <div className="flex gap-2">
          {/* Actions will go here */}
        </div>
      </div>
      
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="details"
            className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            value="content"
            className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Curriculum
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-6">
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Course Details</CardTitle>
                    <CardDescription>Update the metadata for this course.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="published">Published</Label>
                    <Switch
                      id="published"
                      checked={formData.published}
                      onCheckedChange={(checked: boolean) => setFormData((prev) => ({ ...prev, published: checked }))}
                    />
                  </div>
                </div>
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
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t pt-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </form>
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
                  <DialogTrigger>
                    <Button size="sm" type="button">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Lesson
                    </Button>
                  </DialogTrigger>
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
                            onValueChange={(value: any) => setNewLessonData({ ...newLessonData, contentType: value })}
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
                        className="flex items-center justify-between p-3 bg-muted/50 border rounded-lg hover:bg-muted transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <button className="cursor-grab text-muted-foreground hover:text-foreground">
                            <AlignJustify className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-medium w-6 text-muted-foreground">
                            {index + 1}.
                          </span>
                          <div className="flex items-center gap-2">
                            {getIconForType(lesson.contentType)}
                            <span className="font-medium text-sm">{lesson.title}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize text-xs font-normal">
                            {lesson.contentType}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
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
      </Tabs>
    </div>
  );
}
