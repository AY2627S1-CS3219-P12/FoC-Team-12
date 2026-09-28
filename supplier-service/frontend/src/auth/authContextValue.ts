import { createContext } from 'react'
import type { AuthSession } from './session'
import type { UiMode } from './uiMode'

export interface AuthContextValue {
  accessDenied: boolean
  session: AuthSession | null
  uiMode: UiMode
  setUiMode: (mode: UiMode) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
