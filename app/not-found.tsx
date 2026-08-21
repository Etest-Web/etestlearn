import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="text-center space-y-5 max-w-md">
        <div className="flex items-center justify-center gap-2">
          <GraduationCap className="h-6 w-6 text-[#5340FF]" />
          <span className="text-lg font-bold tracking-tight">Etest Learning</span>
        </div>
        <p className="text-7xl font-black tracking-tighter text-[#5340FF]">404</p>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex justify-center gap-3 pt-1">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-[#5340FF] px-4 text-sm font-medium text-white hover:bg-[#4433dd]"
          >
            Back home
          </Link>
          <Link
            href="/courses"
            className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
          >
            Browse courses
          </Link>
        </div>
      </div>
    </main>
  );
}
