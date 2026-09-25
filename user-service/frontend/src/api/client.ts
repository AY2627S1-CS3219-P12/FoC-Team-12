import { type AuthSession, readSession } from '../auth/session'

type RegistrationRequest = {
  email: string
  username: string
  password: string
}

type LoginRequest = {
  email: string
  password: string
}

type PasswordResetRequest = {
  email: string
}

type PasswordResetConfirmation = {
  email: string
  code: string
  password: string
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const session = readSession()

  if (session) {
    headers.set('Authorization', `${session.tokenType} ${session.accessToken}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body?.detail ?? 'Request could not be completed.')
  }
  if (response.status === 202 || response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  register(requestBody: RegistrationRequest) {
    return request('/api/users/registrations', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  login(requestBody: LoginRequest) {
    return request<AuthSession>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  requestPasswordReset(requestBody: PasswordResetRequest) {
    return request<void>('/api/users/password-reset-requests', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  confirmPasswordReset(requestBody: PasswordResetConfirmation) {
    return request<void>('/api/users/password-reset-confirmations', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
}
