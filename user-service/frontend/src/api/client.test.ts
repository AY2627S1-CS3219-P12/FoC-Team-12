import { afterEach, expect, test, vi } from 'vitest'

import { api } from './client'
import { clearSession, saveSession } from '../auth/session'

afterEach(() => {
  clearSession()
  vi.restoreAllMocks()
})

test('attaches the browser session token through the shared API client', async () => {
  saveSession({
    accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))

  await api.register({ email: 'alice@u.nus.edu', username: 'Alice', password: '123456789012345' })
  await api.getProfile()

  const [, options] = vi.mocked(fetch).mock.calls[1]
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/me', expect.objectContaining({ method: 'GET' }))
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer signed.jwt')
})

test('handles password reset responses with no response body', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))

  await api.requestPasswordReset({ email: 'alice@u.nus.edu' })
  await api.verifyPasswordReset({ email: 'alice@u.nus.edu', code: '123456' })
  await api.confirmPasswordReset({ email: 'alice@u.nus.edu', code: '123456', password: 'new-password-with-15-chars' })

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/users/password-reset-requests', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/password-reset-verifications', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/users/password-reset-confirmations', expect.objectContaining({ method: 'POST' }))
})

test('handles email verification and resend responses with no response body', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 202 }))

  await api.verifyEmail({ email: 'alice@u.nus.edu', code: '123456' })
  await api.resendEmailVerification({ email: 'alice@u.nus.edu' })

  expect(fetch).toHaveBeenNthCalledWith(1, '/api/users/email-verifications', expect.objectContaining({ method: 'POST' }))
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/users/email-verification-resends', expect.objectContaining({ method: 'POST' }))
})
