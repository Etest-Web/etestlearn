"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { slugify } from "@/lib/slug";

export default function CreateCoursePage() {
  const router = useRouter();
  const createCourse = useMutation(api.courses.createCourse);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    priceNaira: "",
  });

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
    if (!formData.title || !formData.slug || !formData.description) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Price is entered in Naira on the form; Convex stores kobo.
      const naira = parseFloat(formData.priceNaira);
      const price = Number.isFinite(naira) && naira > 0 ? Math.round(naira * 100) : undefined;

      const courseId = await createCourse({
        title: formData.title,
        slug: formData.slug,
        description: formData.description,
        ...(price !== undefined ? { price, currency: "NGN" } : {}),
      });
      toast.success("Course created successfully!");
      router.push(`/dashboard/instructor/courses/${courseId}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create course. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      {/* Back sits above the header rather than inside its action slot, so it
          keeps its place at the leading edge of the page. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to my courses"
        className="-ml-2 self-start"
        onClick={() => router.push("/dashboard/instructor")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <PageHeader title="Create New Course" />

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Course Details</CardTitle>
            <CardDescription>
              Provide the basic information for your new course. You can add more details and content later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Course Title *</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g. Advanced Next.js Patterns"
                value={formData.title}
                onChange={handleTitleChange}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">Course URL Slug *</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="e.g. advanced-nextjs-patterns"
                value={formData.slug}
                onChange={handleChange}
                required
              />
              <p className="text-xs leading-[1.5] text-muted-foreground">
                This will be used in the URL: /courses/{formData.slug || "..."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Short Description *</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Briefly describe what students will learn in this course."
                value={formData.description}
                onChange={handleChange}
                rows={4}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priceNaira">Price (₦, in Naira)</Label>
              <Input
                id="priceNaira"
                name="priceNaira"
                type="number"
                min="0"
                step="100"
                placeholder="Leave empty for a free course (e.g. 15000)"
                value={formData.priceNaira}
                onChange={handleChange}
                className="tabular"
              />
              <p className="text-xs leading-[1.5] text-muted-foreground">
                Paid courses are collected via Paystack. Leave blank to make this course free.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => router.push("/dashboard/instructor")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Course
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
