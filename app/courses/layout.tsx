import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Courses",
  description:
    "Browse published courses across tech, business, and creative skills — free and paid, with quizzes and certificates.",
  alternates: { canonical: "/courses" },
};

export default function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
