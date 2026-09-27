import { createContext } from 'react'
import type { AuthSession } from './session'

export interface AuthContextValue {
  accessDenied: boolean
  session: AuthSession | null
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
