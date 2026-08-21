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
      <Sidebar className="border-r border-gray-100 bg-white" collapsible="icon">
        <SidebarHeader className="py-6 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5340FF] text-white shadow-md">
              <GraduationCap size={16} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
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
                  <SidebarMenuButton isActive className="bg-[#F8F9FA] text-white font-medium hover:bg-gray-100 hover:text-gray-900 rounded-xl px-4 py-5 [&>svg]:size-5">
                    <LayoutDashboard className="text-[#5340FF]" />
                    <Link href="/dashboard" className="text-[15px]">Dashboard</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Tooltip>
                  <TooltipTrigger>
                    <SidebarMenuItem className="opacity-70">
                      <SidebarMenuButton className="px-4 py-5 hover:bg-gray-50 rounded-xl [&>svg]:size-5 text-gray-600">
                        <Inbox />
                        <span className="text-[15px] font-medium">Inbox</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Coming soon</TooltipContent>
                </Tooltip>

                <SidebarMenuItem>
                  <SidebarMenuButton className="px-4 py-5 hover:bg-gray-100 dark:hover:bg-gray-50 dark:hover:text-gray-900 rounded-xl [&>svg]:size-5 dark:text-white">
                    <BookOpen />
                    <Link href="/dashboard/courses" className="text-[15px] font-medium">Lesson</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Tooltip>
                  <TooltipTrigger>
                    <SidebarMenuItem className="opacity-70">
                      <SidebarMenuButton className="px-4 py-5 hover:bg-gray-50 rounded-xl [&>svg]:size-5 text-gray-600">
                        <ClipboardList />
                        <span className="text-[15px] font-medium">Task</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Coming soon</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger>
                    <SidebarMenuItem className="opacity-70">
                      <SidebarMenuButton className="px-4 py-5 hover:bg-gray-50 rounded-xl [&>svg]:size-5 text-gray-600">
                        <Users />
                        <span className="text-[15px] font-medium">Group</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Coming soon</TooltipContent>
                </Tooltip>

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
                        <img src={f.img} alt={f.name} className="w-10 h-10 rounded-full border border-gray-100 shadow-sm" />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold dark:text-white text-gray-800 hover:text-[#5340FF] transition-colors">{f.name}</span>
                          <span className="text-xs text-gray-400">{f.role}</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Coming soon</TooltipContent>
                  </Tooltip>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 mt-auto space-y-2">
          {isInstructor && (
            <Link href="/dashboard/instructor" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors">
              <UserCircle2 size={20} />
              Instructor Tools
            </Link>
          )}
          {isAdmin && (
            <Link href="/dashboard/admin/users" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors">
              <Users size={20} />
              Admin Console
            </Link>
          )}
          <SidebarGroup className="flex">
          <Tooltip>
            <TooltipTrigger>
              <Link href="/dashboard/settings" className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:hover:bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors">
                <Settings size={15} />
                Settings
               <ModeToggle/>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Customize your dashboard and your account</TooltipContent>
          </Tooltip>
          </SidebarGroup>
          <Tooltip>
            <TooltipTrigger>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-[#FF4949] hover:bg-red-50 rounded-xl transition-colors">
                <LogOut size={20} />
                Logout
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-gray-900 text-white font-medium">Sign out via profile</TooltipContent>
          </Tooltip>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-[#F8F9FA] min-h-screen">
        <header className="flex h-20 items-center justify-between px-8 bg-transparent">
          <div className="flex items-center gap-4 flex-1">
            <SidebarTrigger className="lg:hidden" />
            <form action="/dashboard/search" method="get" className="relative max-w-md w-full hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input 
                name="q"
                type="search"
                placeholder="Search your course...." 
                className="pl-11 h-12 text-black rounded-full border-0 bg-white shadow-sm ring-1 ring-gray-100 text-[15px] focus-visible:ring-[#5340FF]/20"
              />
            </form>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-sm border border-gray-100 transition-colors">
                <Mail size={18} className="text-gray-600" />
              </button>
              <button className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-50 shadow-sm border border-gray-100 transition-colors">
                <Bell size={18} className="text-gray-600" />
                <span className="absolute top-2.5 right-3 w-1.5 h-1.5 bg-[#FF4949] rounded-full" />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
              <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
              <span className="font-semibold text-gray-900 hidden sm:block">
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
