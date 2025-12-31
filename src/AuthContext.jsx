import { createContext, useContext, useEffect, useState } from 'react'
import { auth, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'

const AuthContext = createContext()

// Optional: Add allowed emails for restricted access
const ALLOWED_EMAILS = [
  'ajonno68@gmail.com',
  // Add more emails here if needed
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && ALLOWED_EMAILS.length > 0) {
        // Check if user's email is in the allowed list
        if (ALLOWED_EMAILS.includes(user.email)) {
          setUser(user)
          setError(null)
        } else {
          // Sign out unauthorized users
          signOut(auth)
          setUser(null)
          setError('Access denied. Your email is not authorized.')
        }
      } else {
        setUser(user)
        setError(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const signInWithGoogle = async () => {
    try {
      setError(null)
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      setError('Failed to sign in. Please try again.')
      console.error('Sign in error:', err)
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
