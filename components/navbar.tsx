"use client";

import { ModeToggle } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { UserButton, useUser } from "@clerk/nextjs";
import { BookOpen, LayoutDashboard, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function Navbar() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const pathname = usePathname();

    if (pathname.startsWith("/dashboard")) {
        return null;
    }

    return (
        <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                        <Image width={40} height={40} alt="Glypha" src={"/Logo.svg"} className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold tracking-tight sm:text-base">Glypha Learning</span>
                </Link>

                {/* Navigation */}
                <nav className="hidden items-center gap-1 sm:flex">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => router.push("/courses")}
                    >
                        <BookOpen className="mr-1.5 h-4 w-4" />
                        Browse Courses
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => router.push("/become-instructor")}
                    >
                        <Sparkles className="mr-1.5 h-4 w-4" />
                        Become an Instructor
                    </Button>
                    {user && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => router.push("/dashboard")}
                        >
                            <LayoutDashboard className="mr-1.5 h-4 w-4" />
                            Dashboard
                        </Button>
                    )}
                </nav>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    <ModeToggle />
                    {isLoaded && (
                        <>
                            {user ? (
                                <UserButton />
                            ) : (
                                <Button size="sm" onClick={() => router.push("/sign-in")}>
                                    Sign in
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
