import { SignUp } from '@clerk/nextjs'
import React from 'react'

const SignupPage = () => {
  return (
    /* Mirrors the sign-in page: centre the card and give the viewport room to
       breathe on a phone instead of letting Clerk sit flush to the edges. */
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full flex-col items-center justify-center">
        <h1 className="mb-2 text-center text-2xl font-bold text-balance sm:text-3xl">
          Join Glypha Learning
        </h1>
        <p className="mb-8 text-center text-base text-muted-foreground sm:text-lg">
          Create your free account to start learning.
        </p>
        <SignUp />
      </div>
    </main>
  )
}

export default SignupPage