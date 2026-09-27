export type AuthSession = {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: string
  userId: string
  username: string
  role: 'USER' | 'ADMIN'
}

export const sessionKey = 'foc.user-session'
export const sessionExpiredEvent = 'foc:session-expired'
export const accessDeniedEvent = 'foc:access-denied'

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AuthSession>
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === 'Bearer' &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now() &&
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0 &&
    typeof candidate.username === 'string' &&
    candidate.username.length > 0 &&
    (candidate.role === 'USER' || candidate.role === 'ADMIN')
  )
}

export function readSession(): AuthSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey)
    if (!value) return null
    const session: unknown = JSON.parse(value)
    if (isAuthSession(session)) return session
  } catch {
    // Invalid browser state is cleared below.
  }
  clearSession()
  return null
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey)
}

export function expireSession() {
  clearSession()
  window.dispatchEvent(new Event(sessionExpiredEvent))
}

export function reportAccessDenied() {
  window.dispatchEvent(new Event(accessDeniedEvent))
}
