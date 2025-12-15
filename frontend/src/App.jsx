import { useState } from 'react'
import viteLogo from '/vite.svg'
import './App.css'
import { SignedIn, SignedOut, SignInButton, UserButton, SignOutButton } from '@clerk/clerk-react';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      
      <h1>Welcome to Sign In</h1>
        <SignedOut>
          <SignInButton mode='modal'>
            <button>
              Login
            </button>
          </ SignInButton>
        </SignedOut>
        <SignedIn>
          <SignOutButton />
        </SignedIn>
        <UserButton/>
    </>
  )
}

export default App
