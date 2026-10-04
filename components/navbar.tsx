"use client";

import { ModeToggle } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserButton, useUser } from "@clerk/nextjs";
import { BookOpen, LayoutDashboard, Menu, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_LINKS = [
  { href: "/courses", label: "Browse Courses", icon: BookOpen },
  { href: "/become-instructor", label: "Become an Instructor", icon: Sparkles },
] as const;

export function Navbar() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard")) {
    return null;
  }

  const links = user
    ? [...NAV_LINKS, { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }]
    : NAV_LINKS;

  return (
    /* The rule under the bar is the same `--rule` hairline the dashboard
       sidebar sits on, so the chrome reads as one surface across the two
       shells. Kept as a translucent plate because the hero scrolls under it. */
    <header className="sticky top-0 z-60 border-b border-rule bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-h-20 max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2 group">
          <div className="flex w-30 items-center justify-center rounded-sm transition-transform group-hover:scale-105">
            <Image width={10} height={10} alt="Glypha" src={"/Logo.svg"} className="w-full" />
          </div>
          {/*<span className="text-sm font-bold tracking-tight sm:text-base">Glypha Learning</span>*/}
        </Link>

        {/* Navigation — full labels only once there's room for them */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => router.push(href)}
            >
              <Icon className="mr-1.5 h-4 w-4" />
              {label}
            </Button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Below md the links move into the sheet, so the right cluster only
              needs the theme toggle and the account control. */}
          <div className="hidden items-center gap-2 md:flex">
            <ModeToggle />
            {isLoaded &&
              (user ? (
                <UserButton />
              ) : (
                <Button size="sm" onClick={() => router.push("/sign-in")}>
                  Sign in
                </Button>
              ))}
          </div>

          {/* Mobile nav — below md the links live in here; above it the inline nav
              takes over and this trigger would be redundant. */}
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,85vw)]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="sr-only">
                  Navigate Glypha Learning
                </SheetDescription>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                {links.map(({ href, label, icon: Icon }) => (
                  <SheetClose
                    key={href}
                    render={
                      <Link
                        href={href}
                        className="flex items-center gap-3 rounded-sm px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                    }
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {label}
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule px-4 py-4">
                <ModeToggle />
                {isLoaded &&
                  (user ? (
                    <UserButton />
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => router.push("/sign-in")}
                      className="w-full"
                    >
                      Sign in
                    </Button>
                  ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
