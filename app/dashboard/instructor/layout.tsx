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
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Instructor Panel</h1>
          <nav className="flex gap-2">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/dashboard/instructor"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#945DA3] text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </InstructorGuard>
  );
}
