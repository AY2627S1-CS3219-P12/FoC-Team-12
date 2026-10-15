export type WorkspaceRole = 'REQUESTER' | 'COURIER' | 'ADMIN'

export type AuthSession = {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: string
  userId: string
  username: string
  role: WorkspaceRole | 'USER'
  availableRoles?: WorkspaceRole[]
}

export const sessionKey = 'foc.user-session'

function asWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === 'USER') return 'REQUESTER'
  return value === 'REQUESTER' || value === 'COURIER' || value === 'ADMIN'
    ? value
    : null
}

export function readSession(): AuthSession | null {
  try {
    const stored = sessionStorage.getItem(sessionKey)
    if (!stored) return null
    const candidate = JSON.parse(stored) as Partial<AuthSession>
    const role = asWorkspaceRole(candidate.role)
    if (
      typeof candidate.accessToken !== 'string' ||
      candidate.accessToken.length === 0 ||
      candidate.tokenType !== 'Bearer' ||
      typeof candidate.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.expiresAt)) ||
      Date.parse(candidate.expiresAt) <= Date.now() ||
      typeof candidate.userId !== 'string' ||
      candidate.userId.length === 0 ||
      typeof candidate.username !== 'string' ||
      candidate.username.length === 0 ||
      role === null
    ) {
      clearSession()
      return null
    }
    return { ...candidate, role } as AuthSession
  } catch {
    clearSession()
    return null
  }
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem('foc.ui-mode')
}
