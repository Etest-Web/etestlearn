"use client"

import { useSignUp, useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useState } from "react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
} from "@/components/ui"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

export default function SignUpPage() {
  const { signUp, errors, fetchStatus } = useSignUp()
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  const pending = fetchStatus === "fetching"

  async function finalize() {
    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return
        const url = decorateUrl("/dashboard")
        if (url.startsWith("http")) {
          window.location.href = url
        } else {
          router.push(url)
        }
      },
    })
  }

  async function handleSubmit(formData: FormData) {
    const emailAddress = formData.get("email") as string
    const password = formData.get("password") as string
    const firstName = formData.get("firstName") as string
    const lastName = formData.get("lastName") as string

    await signUp.password({ emailAddress, password, firstName, lastName })

    if (signUp.status === "missing_requirements") {
      await signUp.verifications.sendEmailCode()
    }
  }

  async function handleVerify(formData: FormData) {
    const code = formData.get("code") as string
    await signUp.verifications.verifyEmailCode({ code })
    if (signUp.status === "complete") await finalize()
  }

  async function handleSSO(strategy: "oauth_google" | "oauth_github") {
    await signUp.sso({
      strategy,
      redirectUrl: "/dashboard",
      redirectCallbackUrl: "/sign-up/sso-callback",
    })
  }

  if (signUp.status === "complete" || isSignedIn) return null

  // Email verification step
  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <Shell>
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader>
            <CardTitle>Verify your email</CardTitle>
            <CardDescription>
              We sent a code to your email. Enter it below to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleVerify} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Verification code</Label>
                <InputOTP id="code" name="code" maxLength={6}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {errors?.fields?.code && (
                  <p className="text-sm text-destructive">{errors.fields.code.message}</p>
                )}
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending && <Loader2 className="animate-spin" />}
                Verify
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => signUp.verifications.sendEmailCode()}
                disabled={pending}
              >
                Resend code
              </Button>
              {errors?.global?.map((e, i) => (
                <p key={i} className="text-sm text-destructive">{e.message}</p>
              ))}
            </form>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  // Main sign-up form
  return (
    <Shell>
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join Glypha Learning</CardTitle>
          <CardDescription>Create your free account to start learning.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {/* SSO buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSSO("oauth_google")}
                disabled={pending}
              >
                <GoogleIcon />
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSSO("oauth_github")}
                disabled={pending}
              >
                <GithubIcon />
                GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-rule" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Email/password form */}
            <form action={handleSubmit} className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" name="firstName" autoComplete="given-name" />
                  {errors?.fields?.firstName && (
                    <p className="text-sm text-destructive">{errors.fields.firstName.message}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" name="lastName" autoComplete="family-name" />
                  {errors?.fields?.lastName && (
                    <p className="text-sm text-destructive">{errors.fields.lastName.message}</p>
                  )}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
                {errors?.fields?.emailAddress && (
                  <p className="text-sm text-destructive">{errors.fields.emailAddress.message}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors?.fields?.password && (
                  <p className="text-sm text-destructive">{errors.fields.password.message}</p>
                )}
              </div>

              {/* Cloudflare Turnstile CAPTCHA — Clerk renders widget here when
                  bot sign-up protection is enabled in the dashboard. */}
              <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" />

              <Button type="submit" disabled={pending} className="w-full">
                {pending && <Loader2 className="animate-spin" />}
                Create account
              </Button>
              {errors?.global?.map((e, i) => (
                <p key={i} className="text-sm text-destructive">{e.message}</p>
              ))}
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      {children}
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}
