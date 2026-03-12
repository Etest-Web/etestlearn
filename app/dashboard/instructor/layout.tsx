"use client";

import { ReactNode } from "react";
import { InstructorGuard } from "@/components/instructor-guard";

export default function InstructorLayout({ children }: { children: ReactNode }) {
  return (
    <InstructorGuard>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Instructor Panel</h1>
        </div>
        {children}
      </div>
    </InstructorGuard>
  );
}
