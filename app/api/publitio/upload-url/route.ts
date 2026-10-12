import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getPublitioUploadUrl } from "@/lib/publitio";

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const token = await getToken({ template: "convex" });
  if (!convexUrl || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  const me = await convex.query(api.users.getCurrentUser);
  if (!me || (me.role !== "instructor" && me.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.PUBLITIO_API_KEY;
  const apiSecret = process.env.PUBLITIO_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Publit.io credentials not configured on server" },
      { status: 500 }
    );
  }

  try {
    const uploadUrl = getPublitioUploadUrl(apiKey, apiSecret);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign upload URL" },
      { status: 500 }
    );
  }
}
