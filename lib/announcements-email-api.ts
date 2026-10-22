import { makeFunctionReference } from "convex/server";

export const sendPlatformAnnouncement = makeFunctionReference<
  "action",
  {
    title: string;
    body: string;
    publishedAt: number;
    onlyUsers?: string[];
  },
  number | void
>("emailCampaigns:sendPlatformAnnouncement");
