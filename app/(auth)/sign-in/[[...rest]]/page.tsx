import { SignIn } from '@clerk/nextjs'
import React from 'react'

const SigninPage = () => {
  return (
    <main className='flex items-center justify-center h-screen'>
      <div className='flex flex-col items-center justify-center'>
        <h1 className='text-4xl font-bold mb-4'>Welcome to Etest Learning</h1>
        <p className='text-lg text-gray-600 mb-8 font-bebas-neue'>Creating the Best in the World...</p>
        <SignIn />
      </div>
    </main>
  )
}

export default SigninPage
