import { useEffect, useRef, useState } from 'react'
import { auth, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { AuthContext } from './auth-context'

// Optional: Add allowed emails for restricted access
const ALLOWED_EMAILS = [
  'ajonno68@gmail.com',
  // Add more emails here if needed
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const deniedDuringSignOutRef = useRef(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (nextUser && ALLOWED_EMAILS.length > 0) {
        // Check if user's email is in the allowed list
        if (ALLOWED_EMAILS.includes(nextUser.email)) {
          deniedDuringSignOutRef.current = false
          setUser(nextUser)
          setError(null)
        } else {
          // Sign out unauthorized users
          deniedDuringSignOutRef.current = true
          void signOut(auth).catch((err) => {
            console.error('Unauthorized sign out error:', err)
          })
          setUser(null)
          setError('Access denied. Your email is not authorized.')
        }
      } else {
        setUser(nextUser)

        if (deniedDuringSignOutRef.current) {
          deniedDuringSignOutRef.current = false
        } else {
          setError(null)
        }
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const signInWithGoogle = async () => {
    try {
      deniedDuringSignOutRef.current = false
      setError(null)
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      setError('Failed to sign in. Please try again.')
      console.error('Sign in error:', err)
    }
  }

  const logout = async () => {
    try {
      deniedDuringSignOutRef.current = false
      setError(null)
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
