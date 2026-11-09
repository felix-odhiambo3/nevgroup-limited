
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import {
  loginUser,
  getCurrentUser,
  logoutUser,
} from '../../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleLogout = () => {
      setUser(null)
    }

    window.addEventListener('auth:logout', handleLogout)

    const initializeAuth = async () => {
      const accessToken = sessionStorage.getItem('access_token')

      if (!accessToken) {
        setLoading(false)
        return
      }

      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } catch {
        sessionStorage.removeItem('access_token')
        sessionStorage.removeItem('refresh_token')
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    return () => {
      window.removeEventListener('auth:logout', handleLogout)
    }
  }, [])

  const login = async (credentials) => {
    const authenticatedUser = await loginUser(credentials)
    setUser(authenticatedUser)
    return authenticatedUser
  }

  const logout = async () => {
    try {
      await logoutUser()
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
