import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Use CLERK_JWT_ISSUER_DOMAIN from your .env and Convex dashboard
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

