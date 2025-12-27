import React from 'react'

import { SignedIn, SignedOut, SignInButton, UserButton, SignOutButton } from '@clerk/clerk-react';
import toast from 'react-hot-toast';

function Hompage() {

  return (
    <div>
      vsf<button className='btn btn-secondary'
      onClick={()=> toast.success("This is success")}>Click here</button>
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
    </div>
  )
}

export default Hompage
