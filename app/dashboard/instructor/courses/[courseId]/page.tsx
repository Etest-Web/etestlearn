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
import { Switch } from "@/components/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { ArrowLeft, Loader2, Save, LayoutList, PlusCircle, AlignJustify, Video, FileText, HelpCircle, ExternalLink, Upload } from "lucide-react";
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
    published: false,
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
        published: courseData.course.published,
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
        published: formData.published,
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
        <div className="flex items-center gap-4">
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
      <div className="flex items-center gap-4">
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
