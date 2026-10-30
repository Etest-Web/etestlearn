import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: "Glypha",
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#945DA3",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/SmallLogo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
