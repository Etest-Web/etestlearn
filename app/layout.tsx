import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Montserrat,
  Bebas_Neue,
  Poppins,
  Inter,
  Outfit,
} from "next/font/google";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider, ThemeProvider } from "@/components/ui";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Navbar } from "@/components/navbar";
import { EnsureCurrentUser } from "@/components/ensure-current-user";
import { Toaster } from "sonner";
import { siteConfig } from "@/lib/site";

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

const poppins = Poppins({
  weight: "800",
  variable: "--font-poppins",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Match the browser chrome to the brand so the URL bar and the notch area
  // don't read as a white band above a purple page. Values mirror --brand
  // (light) and --background (dark) in app/globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#945DA3" },
    { media: "(prefers-color-scheme: dark)", color: "#231C27" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `proxy.ts` mints a fresh nonce per request and forwards it on `X-Nonce`
  // (alongside the CSP header itself).
  //
  // Next.js reads the nonce back off the request's Content-Security-Policy
  // and stamps it onto every script it renders, so the only tag that needs it
  // handed over explicitly is next-themes' inline theme script — an inline
  // script with no nonce is exactly what `script-src` blocks.
  //
  // Reading headers() here also opts this tree into per-request rendering,
  // which a nonce requires: a statically prerendered page would bake a
  // build-time nonce into its HTML, and that value would never match any
  // request's CSP — the fix would silently not work in production.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-outfit", outfit.variable, inter.variable)}
    >
      <body
        className={`${geistSans.variable} ${bebasNeue.variable} ${poppins.variable} ${mont.variable} ${geistMono.variable} ${outfit.className} antialiased`}
      >
        <ThemeProvider
          nonce={nonce}
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
