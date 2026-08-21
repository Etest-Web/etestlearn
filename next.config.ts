import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "laudable-cuttlefish-591.eu-west-1.convex.cloud",
      },
      {
        protocol: "https",
        hostname: "laudable-cuttlefish-591.eu-west-1.convex.site",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
