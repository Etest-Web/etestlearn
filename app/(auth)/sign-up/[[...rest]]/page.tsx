import { SignUp } from '@clerk/nextjs'
import React from 'react'

const SignupPage = () => {
  return (
    /* Mirrors the sign-in page: centre the card and give the viewport room to
       breathe on a phone instead of letting Clerk sit flush to the edges. */
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full flex-col items-center justify-center">
        {/* Display face on the h1 — the same voice every other page title
           uses. PageHeader is not used here because it is left-aligned on
           desktop, and an auth screen reads better centred. */}
        <h1 className="display-heading mb-3 text-center text-3xl text-balance sm:text-5xl">
          Join Glypha Learning
        </h1>
        <p className="mb-8 max-w-[46ch] text-center text-sm leading-body text-muted-foreground sm:text-base">
          Create your free account to start learning.
        </p>
        <SignUp />
      </div>
    </main>
  )
}

export default SignupPage
