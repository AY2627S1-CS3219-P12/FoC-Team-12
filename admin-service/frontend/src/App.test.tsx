import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
function session(role = 'ADMIN') {
  sessionStorage.setItem(
    'foc.user-session',
    JSON.stringify({
      accessToken: 'signed-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      userId: 'actor',
      username: 'Darryl',
      role,
      availableRoles: ['REQUESTER', 'COURIER', 'ADMIN'],
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())
it('shows sign-in without loading protected data', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(
    screen.getByRole('heading', { name: 'Sign in to continue' }),
  ).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
})
it('opens tools only after live authorization', async () => {
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'actor', role: 'ADMIN' }),
    }),
  )
  render(<App />)
  expect(await screen.findByText('Access verified')).toBeVisible()
  expect(screen.getByRole('heading', { name: /Manage users/ })).toBeVisible()
  expect(screen.getByText('Coming later')).toBeVisible()
})
it('denies a participant without exposing administrative tools', async () => {
  session('REQUESTER')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
  render(<App />)
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
  expect(
    screen.queryByText('Open account management →'),
  ).not.toBeInTheDocument()
})
it('distinguishes an expired session from dependency failure and retries', async () => {
  session()
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: false, status: 401 })
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t verify your access',
  )
  fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
  expect(await screen.findByText('Sign in to continue')).toBeVisible()
})
it('removes successful access when the identity changes', async () => {
  session()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: 'actor', role: 'ADMIN' }),
      })
      .mockResolvedValue({ ok: false, status: 403 }),
  )
  render(<App />)
  await screen.findByText('Access verified')
  const s = JSON.parse(sessionStorage.getItem('foc.user-session')!)
  s.accessToken = 'participant-token'
  s.userId = 'participant'
  s.role = 'REQUESTER'
  sessionStorage.setItem('foc.user-session', JSON.stringify(s))
  fireEvent(window, new Event('foc:session-changed'))
  await waitFor(() =>
    expect(screen.queryByText('Access verified')).not.toBeInTheDocument(),
  )
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
})
it('switches workspace through User and rechecks Admin access with the replacement token', async () => {
  session('REQUESTER')
  const replacement = {
    ...JSON.parse(sessionStorage.getItem('foc.user-session')!),
    role: 'ADMIN',
    accessToken: 'admin-token',
  }
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 403 })
    .mockResolvedValueOnce({ ok: true, json: async () => replacement })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ userId: 'actor', role: 'ADMIN' }),
    })
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  await screen.findByText('This workspace is for administrators')
  fireEvent.click(screen.getByLabelText('Open account menu for Darryl'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }))
  expect(await screen.findByText('Access verified')).toBeVisible()
  expect(fetcher).toHaveBeenCalledWith(
    '/api/users/me/session-role',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ role: 'ADMIN' }),
      headers: expect.objectContaining({
        Authorization: 'Bearer signed-token',
      }),
    }),
  )
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/admin/session',
    expect.objectContaining({
      headers: { Authorization: 'Bearer admin-token' },
    }),
  )
})
it('keeps access denied when User cannot change the workspace', async () => {
  session('REQUESTER')
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 503 }),
  )
  render(<App />)
  await screen.findByText('This workspace is for administrators')
  fireEvent.click(screen.getByLabelText('Open account menu for Darryl'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Admin' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to change workspace',
  )
  expect(screen.queryByText('Access verified')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Open account management →'),
  ).not.toBeInTheDocument()
})
