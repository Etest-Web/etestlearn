import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Inter, Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AnalyticsWrapper } from "@/components/analytics-wrapper";
import { LocalizationProvider } from "@/components/localization-provider";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Navbar } from "@/components/navbar";
import { EnsureCurrentUser } from "@/components/ensure-current-user";
import { Toaster } from "sonner";
import { siteConfig } from "@/lib/site";
import JsonLd from "@/components/seo/jsonld";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
} from "@/components/seo/schemas";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
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
  keywords: siteConfig.keywords,
  // The application name and the author are two more places a search engine
  // can read the site's name from. `application-name` in particular is one of
  // the few machine-readable statements of "what is this site called" that
  // does not depend on a page title.
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "education",
  classification: "Online Learning Platform",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/SmallLogo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/SmallLogo.svg" }],
  },
  verification: {
    google: "wFwCJGycYcPHfP8xZ3zVFS9bCobqpYTcgpJH4tS2Q_s",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: "en_US",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    // Deliberately no `images` here (and none in `twitter` below).
    //
    // `app/opengraph-image.tsx` generates the real card, and Next only applies
    // a file-based image when the segment's own metadata does not carry the
    // key at all — see `mergeStaticMetadata` in Next's
    // `lib/metadata/resolve-metadata.js`, which gates on
    // `openGraph.hasOwnProperty("images")`. Writing `images: undefined` still
    // satisfies hasOwnProperty and would silently suppress the generated card,
    // so the key has to be absent rather than empty.
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    // Same reason as the openGraph comment above: no `images`, so the
    // file-based route fills it. There is no `twitter-image.tsx` — Next falls
    // back to `opengraph-image.tsx` for the twitter card when none exists.
    // Site handle — lets Twitter/X know who owns the account.
    site: "@glypha_learn",
    creator: "@glypha_learn",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <html
        lang="en"
        suppressHydrationWarning
        className={cn("font-outfit", outfit.variable, inter.variable)}
      >
        <head>
          <meta name="google-site-verification" content="wFwCJGycYcPHfP8xZ3zVFS9bCobqpYTcgpJH4tS2Q_s" />
          {/*
            The site's own identity, as structured data, in the initial HTML.

            `WebSite` is the document Google reads to decide what to call the
            site in search results, and `Organization` is the entity behind it.
            Both are here rather than on the homepage alone because the site
            name has to be discoverable from any page that represents the site,
            and because the WebPage/Course schemas reference them by `@id`.

            Server-rendered on purpose: a schema injected after hydration is
            invisible to a crawler that does not run JavaScript.
          */}
          <JsonLd
            schema={[buildWebSiteSchema(), buildOrganizationSchema()]}
            id="site-schema"
          />
        </head>
        <body
          className={`${archivo.variable} ${geistMono.variable} ${outfit.className} antialiased`}
        >
          <AnalyticsWrapper />
          <LocalizationProvider>
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
          </LocalizationProvider>
        </body>
      </html>
    </>
  );
}
