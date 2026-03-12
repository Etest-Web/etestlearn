"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui";
import { ModeToggle } from "@/components/ui";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const dbUser = useQuery(api.users.getCurrentUser);
  
  const isInstructor = dbUser?.role === "instructor" || dbUser?.role === "admin";

  return (
    <SidebarProvider>
      <Sidebar className="bg-sidebar text-sidebar-foreground" collapsible="icon">
        <SidebarHeader>
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className="text-sm font-semibold tracking-tight">
                Etest Dashboard
              </span>
            </SidebarGroupLabel>
          </SidebarGroup>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Link href="/dashboard">My Courses</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Link href="/dashboard/progress">Progress</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Link href="/dashboard/certificates">Certificates</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                
                {isInstructor && (
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Link href="/dashboard/instructor">Instructor Tools</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between gap-2 rounded-md bg-sidebar-accent/60 px-2 py-1.5 text-xs">
            <div className="flex flex-col items-start gap-2">
              <span className="text-sidebar-foreground/80">Signed in</span>
              <span className="text-sidebar-foreground font-bold text-md">{user?.fullName}</span>
              <span className="text-sidebar-foreground/80">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
            <UserButton />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ModeToggle />
          </div>
        </header>
        <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 px-4 py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

