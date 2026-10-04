"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui";
import { PageHeader } from "@/components/ui/page-header";
import { Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";

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
      const updated = await user?.setProfileImage({ file });
      const url = updated?.publicUrl;
      if (url) {
        await updateProfile({ imageUrl: url });
      }
      toast.success("Profile photo updated");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <PageHeader title="Settings" />

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
    </div>
  );
}
