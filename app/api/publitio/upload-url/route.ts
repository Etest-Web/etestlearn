import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getPublitioUploadUrl } from "@/lib/publitio";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
