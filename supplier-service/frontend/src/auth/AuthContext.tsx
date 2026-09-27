import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContextValue'
import {
  accessDeniedEvent,
  clearSession,
  readSession,
  sessionExpiredEvent,
  sessionKey,
  type AuthSession,
} from './session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessDenied, setAccessDenied] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(() =>
    readSession(),
  )

  useEffect(() => {
    const refresh = () => setSession(readSession())
    const denyAccess = () => setAccessDenied(true)
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === sessionKey) refresh()
    }
    window.addEventListener(sessionExpiredEvent, refresh)
    window.addEventListener(accessDeniedEvent, denyAccess)
    window.addEventListener('storage', refreshFromStorage)
    return () => {
      window.removeEventListener(sessionExpiredEvent, refresh)
      window.removeEventListener(accessDeniedEvent, denyAccess)
      window.removeEventListener('storage', refreshFromStorage)
    }
  }, [])

  const value = useMemo(
    () => ({
      accessDenied,
      session,
      signOut: () => {
        clearSession()
        setAccessDenied(false)
        setSession(null)
      },
    }),
    [accessDenied, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
