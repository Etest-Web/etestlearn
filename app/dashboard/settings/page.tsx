"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, ModeToggle } from "@/components/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/dashboard-shell";
import { Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";

/** Decodable by `createImageBitmap`; anything else (SVG, HEIC) is passed
 *  through untouched so Clerk, not this function, decides what it rejects. */
const RASTER = /^image\/(jpeg|png|webp|gif|avif)$/;

/**
 * Downscales an avatar before it goes to Clerk.
 *
 * Clerk's `/v1/me/profile_image` answers a bare `413` for an oversized body, so
 * the old path failed for any modern phone photo (3-8 MB) with nothing to show
 * the user. Canvas + `createImageBitmap` do the resize for free; `ponytail:`
 * assuming Clerk's cap stays above ~100 KB of JPEG — if it ever drops, step the
 * quality down here rather than reintroducing a client-side image library.
 */
async function fitForClerk(file: File, maxEdge = 512): Promise<File> {
  if (!RASTER.test(file.type) || file.size <= 200 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot resize images");
    // JPEG has no alpha, so transparent pixels would otherwise become black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("Could not process that image");
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export default function SettingsPage() {
  const { user } = useUser();
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);

  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser && name === "") {
      setName(currentUser.name ?? "");
    }
  }, [currentUser, name]);

  // This page had no loading state at all: while `getCurrentUser` was in flight
  // it rendered the whole form with empty values and a disabled Save, which is
  // indistinguishable from a genuinely blank profile — and `name` stayed ""
  // until the effect above fired, so the field visibly popped.
  if (currentUser === undefined) {
    return (
      <PageShell width="form" className="gap-6" aria-busy>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <span className="sr-only">Loading your settings…</span>
      </PageShell>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await updateProfile({ name });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setIsUploadingAvatar(true);
    try {
      // Clerk is the source of truth for profile fields (see convex/users.ts):
      // the photo is uploaded to Clerk, which fires a user.updated webhook that
      // syncs imageUrl into Convex. Writing it to Convex here too keeps the UI
      // instant instead of waiting for the webhook round-trip, and avoids
      // storing a Convex signed URL that expires — Clerk CDN URLs do not.
      const updated = await user?.setProfileImage({
        file: await fitForClerk(file),
      });
      const url = updated?.publicUrl;
      if (url) {
        await updateProfile({ imageUrl: url });
      }
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  return (
    <PageShell width="form" className="gap-6">
      {/* The sidebar tooltip promises "customize your dashboard and your
          account" and puts the theme toggle beside this link, so the page
          explains that rather than leaving a bare heading. */}
      <PageHeader
        title="Settings"
        description="Your profile as it appears across Glypha Learn — in courses, discussions and on certificates."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            How you appear across the platform — in courses, discussions, and certificates.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSave}>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="h-16 w-16">
                {(user?.imageUrl || currentUser?.imageUrl) ? (
                  <AvatarImage src={user?.imageUrl || currentUser?.imageUrl} alt={currentUser?.name ?? "Profile"} />
                ) : null}
                <AvatarFallback>
                  {(currentUser?.name ?? "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingAvatar || !currentUser}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Change photo
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={currentUser?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">
                Email is managed by your sign-in provider.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={isSaving || !currentUser}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save changes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            The sidebar toggle below switches between light, dark and your
            system&apos;s setting, and applies immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">Theme</p>
            <ModeToggle />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
