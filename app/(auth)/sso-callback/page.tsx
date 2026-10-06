"use client"

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"

export default function SSOCallbackPage() {
  const clerk = useClerk()
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()
  const router = useRouter()
  const hasRun = useRef(false)

  const navigateToSignIn = () => router.push("/sign-in")

  async function finalizeSignIn() {
    await signIn.finalize({
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

  async function finalizeSignUp() {
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

  useEffect(() => {
    ;(async () => {
      if (!clerk.loaded || hasRun.current) return
      hasRun.current = true

      if (signIn.status === "complete") {
        await finalizeSignIn()
        return
      }

      if (signUp.isTransferable) {
        await signIn.create({ transfer: true })
        const status = signIn.status as typeof signIn.status | "complete"
        if (status === "complete") {
          await finalizeSignIn()
          return
        }
        return navigateToSignIn()
      }

      if (
        signIn.status === "needs_first_factor" &&
        !signIn.supportedFirstFactors?.every((f) => f.strategy === "enterprise_sso")
      ) {
        return navigateToSignIn()
      }

      if (signIn.isTransferable) {
        await signUp.create({ transfer: true })
        if (signUp.status === "complete") {
          await finalizeSignUp()
          return
        }
        return router.push("/sign-up")
      }

      if (signUp.status === "complete") {
        await finalizeSignUp()
        return
      }

      if (signIn.status === "needs_second_factor" || signIn.status === "needs_new_password") {
        return navigateToSignIn()
      }

      if (signIn.existingSession || signUp.existingSession) {
        const sessionId =
          signIn.existingSession?.sessionId || signUp.existingSession?.sessionId
        if (sessionId) {
          await clerk.setActive({
            session: sessionId,
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
          return
        }
      }
    })()
  }, [clerk, signIn, signUp])

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      {/* CAPTCHA element for sign-up transfers */}
      <div id="clerk-captcha" />
    </main>
  )
}
