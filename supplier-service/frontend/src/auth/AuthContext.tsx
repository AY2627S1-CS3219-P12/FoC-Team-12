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
import { readUiMode, saveUiMode, uiModeKey, type UiMode } from './uiMode'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessDenied, setAccessDenied] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(() =>
    readSession(),
  )
  const [uiMode, setUiModeState] = useState<UiMode>(() =>
    readUiMode(session?.role),
  )

  useEffect(() => {
    const refresh = () => {
      const nextSession = readSession()
      setSession(nextSession)
      setUiModeState(readUiMode(nextSession?.role))
    }
    const denyAccess = () => setAccessDenied(true)
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === sessionKey || event.key === uiModeKey) refresh()
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
      uiMode,
      setUiMode: (mode: UiMode) => {
        setUiModeState(saveUiMode(mode, session?.role))
      },
      signOut: () => {
        clearSession()
        setAccessDenied(false)
        setSession(null)
      },
    }),
    [accessDenied, session, uiMode],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
