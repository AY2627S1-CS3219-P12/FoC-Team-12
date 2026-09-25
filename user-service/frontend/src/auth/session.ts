export type AuthSession = {
  accessToken: string
  tokenType: string
  expiresAt: string
  userId: string
  username: string
  role: 'USER' | 'ADMIN'
}

const sessionKey = 'foc.user-session'

export function readSession(): AuthSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey)
    return value ? (JSON.parse(value) as AuthSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession) {
  sessionStorage.setItem(sessionKey, JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey)
}
