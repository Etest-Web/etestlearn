import { GraduationCap } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <main className="min-h-dvh flex items-center justify-center px-4 py-12 bg-gradient-to-b from-background to-muted">
            <div className="text-center space-y-5 max-w-md">
                <div className="flex items-center justify-center gap-2">
                    <GraduationCap className="h-6 w-6 text-[#945DA3]" />
                    <span className="text-lg font-bold tracking-tight">Glypha Learning</span>
                </div>
                <p className="text-6xl font-black tracking-tighter text-[#945DA3] sm:text-7xl">404</p>
                <h1 className="text-xl font-bold">Page not found</h1>
                <p className="text-sm text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist or may have moved.
                </p>
                <div className="flex justify-center gap-3 pt-1">
                    <Link
                        href="/"
                        className="inline-flex h-9 items-center rounded-md bg-[#945DA3] px-4 text-sm font-medium text-white hover:bg-[#7F4C8D]"
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
