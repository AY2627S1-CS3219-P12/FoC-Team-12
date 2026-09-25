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

type EmailVerificationRequest = {
  email: string
  code: string
}

type EmailVerificationResendRequest = {
  email: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
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
    const retryAfter = response.headers?.get?.('Retry-After')
    const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number.parseInt(retryAfter, 10) : undefined
    throw new ApiError(response.status, body?.detail ?? 'Request could not be completed.', retryAfterSeconds)
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
  verifyEmail(requestBody: EmailVerificationRequest) {
    return request<void>('/api/users/email-verifications', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
  resendEmailVerification(requestBody: EmailVerificationResendRequest) {
    return request<void>('/api/users/email-verification-resends', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
  },
}
