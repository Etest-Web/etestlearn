"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutList, PlusCircle } from "lucide-react";
import { InstructorGuard } from "@/components/instructor-guard";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard/instructor", label: "My Courses", icon: LayoutList },
  { href: "/dashboard/instructor/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/instructor/courses/new", label: "New Course", icon: PlusCircle },
];

export default function InstructorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <InstructorGuard>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          {/* Console name, not a page title: each page below carries its own
              <h1> through PageHeader, so this is the one label above the rule
              rather than a second heading competing with them. */}
          <p className="eyebrow">Instructor Panel</p>
          {/* Three tabs run ~374px — wrap rather than overflow the phone. */}
          <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {/* Section nav carries the same hairline + brand bar as the `rule`
                tab strip: selection reads as position and weight, not a filled
                lozenge. */}
            <div className="inline-flex w-max min-w-full items-center gap-5 border-b border-rule sm:gap-7">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/dashboard/instructor"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex shrink-0 items-center gap-2 py-2.5 pl-0.5 pr-0.5 text-[15px] font-medium text-foreground/55 transition-colors touch-target",
                      "after:absolute after:inset-x-0.5 after:-bottom-px after:h-0.5 after:origin-left after:scale-x-0 after:bg-brand after:transition-transform hover:text-foreground",
                      active && "font-semibold text-foreground after:scale-x-100",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
        {children}
      </div>
    </InstructorGuard>
  );
}