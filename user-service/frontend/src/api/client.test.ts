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

  const [, options] = vi.mocked(fetch).mock.calls[0]
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer signed.jwt')
})
