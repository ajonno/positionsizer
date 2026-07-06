import { useEffect, useRef, useState } from 'react'
import { auth, googleProvider } from './firebase'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { AuthContext } from './auth-context'

// Optional: Add allowed emails for restricted access
const ALLOWED_EMAILS = [
  'ajonno68@gmail.com',
  // Add more emails here if needed
]

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const isLocalDevAuthBypass = import.meta.env.DEV && LOCAL_DEV_HOSTS.has(window.location.hostname)
const localDevUser = {
  uid: 'local-dev-user',
  email: 'local-dev@localhost',
  displayName: 'Local Dev',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(isLocalDevAuthBypass ? localDevUser : null)
  const [loading, setLoading] = useState(!isLocalDevAuthBypass)
  const [error, setError] = useState(null)
  const deniedDuringSignOutRef = useRef(false)

  useEffect(() => {
    if (isLocalDevAuthBypass) {
      return undefined
    }

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
    if (isLocalDevAuthBypass) {
      setUser(localDevUser)
      setError(null)
      return
    }

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
    if (isLocalDevAuthBypass) {
      setUser(localDevUser)
      setError(null)
      return
    }

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
