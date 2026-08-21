import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Montserrat,
  Bebas_Neue,
  Inter,
  Outfit,
} from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider, ThemeProvider } from "@/components/ui";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Navbar } from "@/components/navbar";
import { EnsureCurrentUser } from "@/components/ensure-current-user";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const mont = Montserrat({
  variable: "--font-mont",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas-neue",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Etest Learning",
  description: "Creating the Best in the World...",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-outfit", outfit.variable, inter.variable)}
    >
      <body
        className={`${geistSans.variable} ${bebasNeue.variable} ${mont.variable} ${geistMono.variable} ${outfit.className} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider>
            <ConvexClientProvider>
              <EnsureCurrentUser />
              <Navbar/>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster richColors position="top-right" />
            </ConvexClientProvider>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
