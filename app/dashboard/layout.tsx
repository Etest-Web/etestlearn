"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { Search, Mail, Bell, LayoutDashboard, Inbox, BookOpen, ClipboardList, Users, Settings, LogOut, UserCircle2, GraduationCap } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

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
  SidebarTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Input,
  ModeToggle
} from "@/components/ui";

const MOCK_FRIENDS = [
  { name: "Bagas Mahpie", role: "Friend", img: "https://i.pravatar.cc/100?u=1" },
  { name: "Sir Dandy", role: "Old Friend", img: "https://i.pravatar.cc/100?u=2" },
  { name: "Jhon Tosan", role: "Friend", img: "https://i.pravatar.cc/100?u=3" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const dbUser = useQuery(api.users.getCurrentUser);
  const isInstructor = dbUser?.role === "instructor" || dbUser?.role === "admin";
  const isAdmin = dbUser?.role === "admin";

  return (
    <SidebarProvider>
      <Sidebar className="border-r bg-sidebar" collapsible="icon">
        <SidebarHeader className="py-6 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5340FF] text-white shadow-md">
              <GraduationCap size={16} />
            </div>
            <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
              Etest Learn
            </span>
          </div>
        </SidebarHeader>
        
        <SidebarContent className="px-3 gap-6">
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-[#B3B4B9] mb-2 px-3">
              Overview
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                <SidebarMenuItem>
                  <SidebarMenuButton isActive className="bg-accent text-accent-foreground font-medium rounded-xl px-4 py-5 [&>svg]:size-5">
                    <LayoutDashboard className="text-[#5340FF]" />
                    <Link href="/dashboard" className="text-[15px]">Dashboard</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger render={<SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />}>
                      <Inbox />
                      <span className="text-[15px] font-medium">Inbox</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground">
                    <BookOpen />
                    <Link href="/dashboard/courses" className="text-[15px] font-medium">Lesson</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger render={<SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />}>
                      <ClipboardList />
                      <span className="text-[15px] font-medium">Task</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger render={<SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />}>
                      <Users />
                      <span className="text-[15px] font-medium">Group</span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-[#B3B4B9] mb-2 px-3">
              Friends
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-4 mt-2">
                {MOCK_FRIENDS.map((f, i) => (
                  <Tooltip key={i} >
                    <TooltipTrigger>
                      <div className="flex items-center gap-3 px-3 cursor-pointer group">
                        <img src={f.img} alt={f.name} className="w-10 h-10 rounded-full border border-border shadow-sm" />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground hover:text-[#5340FF] transition-colors">{f.name}</span>
                          <span className="text-xs text-muted-foreground">{f.role}</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                  </Tooltip>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 mt-auto space-y-2">
          {isInstructor && (
            <Link href="/dashboard/instructor" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors">
              <UserCircle2 size={20} />
              Instructor Tools
            </Link>
          )}
          {isAdmin && (
            <Link href="/dashboard/admin/users" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors">
              <Users size={20} />
              Admin Console
            </Link>
          )}
          <SidebarGroup className="flex items-center gap-2 px-3">
            <Tooltip>
              <TooltipTrigger render={<Link href="/dashboard/settings" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors" />}>
                <Settings size={15} />
                Settings
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-foreground text-background font-medium">Customize your dashboard and your account</TooltipContent>
            </Tooltip>
            <ModeToggle />
          </SidebarGroup>
          <Tooltip>
            <TooltipTrigger render={<button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-[#FF4949] hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors" />}>
              <LogOut size={20} />
              Logout
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-foreground text-background font-medium">Sign out via profile</TooltipContent>
          </Tooltip>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background min-h-screen">
        <header className="flex h-20 items-center justify-between px-8 bg-transparent">
          <div className="flex items-center gap-4 flex-1">
            <SidebarTrigger className="lg:hidden" />
            <form action="/dashboard/search" method="get" className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input 
                name="q"
                type="search"
                placeholder="Search your course...." 
                className="pl-11 h-12 rounded-full border-0 bg-card shadow-sm ring-1 ring-border text-[15px] focus-visible:ring-[#5340FF]/20"
              />
            </form>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button className="relative w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors">
                <Mail size={18} className="text-muted-foreground" />
              </button>
              <button className="relative w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors">
                <Bell size={18} className="text-muted-foreground" />
                <span className="absolute top-2.5 right-3 w-1.5 h-1.5 bg-[#FF4949] rounded-full" />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-border">
              <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
              <span className="font-semibold text-foreground hidden sm:block">
                {user?.fullName || "Student"}
              </span>
            </div>
          </div>
        </header>

        <main className="p-8 pt-2">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
