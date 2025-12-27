import { useState } from 'react'
import viteLogo from '/vite.svg'
import './App.css'
import { SignedIn, SignedOut, SignInButton, UserButton, SignOutButton, useUser } from '@clerk/clerk-react';
import { Routes, Route, Navigate } from 'react-router';
import Hompage from './pages/Hompage';
import AboutPage from './pages/AboutPage';
import ProblemsPage from './pages/ProblemsPage';
import { Toaster } from 'react-hot-toast';

function App() {
  const [count, setCount] = useState(0)
  const {isSignedIn} =useUser();
  return (
    <>
    <Toaster position='top-right' toastOptions={{duration: 2000}}/>
      <Routes>
        {/* <h1 className='text-amber-950 bg-orange-700'>Welcome to Sign In</h1> */}

        <Route path="/" element={<Hompage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/problems" element={isSignedIn ? <ProblemsPage /> : <Navigate to="/" />} />
        
      </Routes>
    </>
  )
}

export default App
