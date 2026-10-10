"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, ModeToggle } from "@/components/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/dashboard-shell";
import { Loader2, Save, Upload, User, Palette, Accessibility, Bell, Shield, Eye } from "lucide-react";
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
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [birthday, setBirthday] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser && name === "") {
      setName(currentUser.name ?? "");
      setBio(currentUser.bio ?? "");
      setLocation(currentUser.location ?? "");
      setWebsite(currentUser.website ?? "");
      setPhone(currentUser.phone ?? "");
      setPronouns(currentUser.pronouns ?? "");
      if (currentUser.birthday) {
        setBirthday(new Date(currentUser.birthday).toISOString().split('T')[0]);
      }
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
      await updateProfile({ 
        name, 
        bio, 
        location, 
        website, 
        phone, 
        pronouns,
        birthday: birthday ? new Date(birthday).getTime() : undefined
      });
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

      <Tabs defaultValue="profile" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="accessibility" className="flex items-center gap-2">
            <Accessibility className="h-4 w-4" />
            <span className="hidden sm:inline">Accessibility</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Privacy</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Content</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                How you appear across the platform — in courses, discussions, and certificates.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSave}>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar className="h-20 w-20">
                    {(user?.imageUrl || currentUser?.imageUrl) ? (
                      <AvatarImage src={user?.imageUrl || currentUser?.imageUrl} alt={currentUser?.name ?? "Profile"} />
                    ) : null}
                    <AvatarFallback className="text-lg">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us a bit about yourself..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pronouns">Pronouns</Label>
                    <Input
                      id="pronouns"
                      value={pronouns}
                      onChange={(e) => setPronouns(e.target.value)}
                      placeholder="e.g., they/them, he/him, she/her"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthday">Birthday</Label>
                    <Input
                      id="birthday"
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, Country"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
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
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Theme & Layout</CardTitle>
              <CardDescription>
                Customize the look and feel of your dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Switch between light, dark and system theme.
                  </p>
                </div>
                <ModeToggle />
              </div>

              <div className="space-y-2">
                <Label htmlFor="layoutDensity">Layout Density</Label>
                <Select defaultValue="comfortable">
                  <SelectTrigger>
                    <SelectValue placeholder="Select density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Show Avatars</Label>
                  <p className="text-sm text-muted-foreground">
                    Display user profile pictures throughout the platform.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Show Online Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Show when you're online to friends and instructors.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accessibility">
          <Card>
            <CardHeader>
              <CardTitle>Accessibility Settings</CardTitle>
              <CardDescription>
                Customize the interface to meet your accessibility needs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="reducedMotion">Reduced Motion</Label>
                  <p className="text-sm text-muted-foreground">
                    Minimize animations and transitions.
                  </p>
                </div>
                <Switch id="reducedMotion" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="highContrast">High Contrast</Label>
                  <p className="text-sm text-muted-foreground">
                    Increase color contrast for better visibility.
                  </p>
                </div>
                <Switch id="highContrast" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="focusVisible">Enhanced Focus Indicators</Label>
                  <p className="text-sm text-muted-foreground">
                    Show clearer focus outlines for keyboard navigation.
                  </p>
                </div>
                <Switch id="focusVisible" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dyslexiaFriendly">Dyslexia-Friendly Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Use optimized fonts and spacing for readability.
                  </p>
                </div>
                <Switch id="dyslexiaFriendly" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="screenReaderMode">Screen Reader Optimizations</Label>
                  <p className="text-sm text-muted-foreground">
                    Enhanced ARIA labels and semantic markup.
                  </p>
                </div>
                <Switch id="screenReaderMode" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fontSize">Font Size</Label>
                <Select defaultValue="medium">
                  <SelectTrigger>
                    <SelectValue placeholder="Select font size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium (Default)</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                    <SelectItem value="xl">Extra Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Control how and when you receive notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNotifications">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive updates via email.
                  </p>
                </div>
                <Switch id="emailNotifications" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="pushNotifications">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive in-app and browser notifications.
                  </p>
                </div>
                <Switch id="pushNotifications" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="courseUpdates">Course Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    New lessons, announcements from enrolled courses.
                  </p>
                </div>
                <Switch id="courseUpdates" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="discussionReplies">Discussion Replies</Label>
                  <p className="text-sm text-muted-foreground">
                    Replies to your discussion posts and comments.
                  </p>
                </div>
                <Switch id="discussionReplies" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="achievementNotifications">Achievements</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications when you earn certificates or badges.
                  </p>
                </div>
                <Switch id="achievementNotifications" defaultChecked />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="marketingEmails">Marketing Emails</Label>
                  <p className="text-sm text-muted-foreground">
                    Updates about new courses and features.
                  </p>
                </div>
                <Switch id="marketingEmails" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Visibility</CardTitle>
              <CardDescription>
                Control who can see your profile and activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="profileVisibility">Profile Visibility</Label>
                <Select defaultValue="public">
                  <SelectTrigger>
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public - Anyone can see</SelectItem>
                    <SelectItem value="friends">Friends only</SelectItem>
                    <SelectItem value="private">Private - Only you</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showEmail">Show Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Display your email on your public profile.
                  </p>
                </div>
                <Switch id="showEmail" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showLocation">Show Location</Label>
                  <p className="text-sm text-muted-foreground">
                    Display your location on your profile.
                  </p>
                </div>
                <Switch id="showLocation" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showWebsite">Show Website</Label>
                  <p className="text-sm text-muted-foreground">
                    Display your website on your profile.
                  </p>
                </div>
                <Switch id="showWebsite" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showActivity">Show Learning Activity</Label>
                  <p className="text-sm text-muted-foreground">
                    Share your learning progress with others.
                  </p>
                </div>
                <Switch id="showActivity" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>Content Preferences</CardTitle>
              <CardDescription>
                Customize how content is displayed and played.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="autoplayVideos">Autoplay Videos</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically play lesson videos when opened.
                  </p>
                </div>
                <Switch id="autoplayVideos" />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="showSubtitles">Show Subtitles by Default</Label>
                  <p className="text-sm text-muted-foreground">
                    Display subtitles for video content when available.
                  </p>
                </div>
                <Switch id="showSubtitles" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
