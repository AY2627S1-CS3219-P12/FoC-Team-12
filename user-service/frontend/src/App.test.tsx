import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from './App'
import { saveSession } from './auth/session'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

const fillLogin = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  return user
}

test('signs in successfully and stores the browser session', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Persisted Alice',
        role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
      }),
    }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/login', expect.objectContaining({ method: 'POST' }))
  await screen.findByRole('heading', { name: 'Your profile' })
  expect(await screen.findByText('Persisted Alice')).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me', expect.objectContaining({ method: 'GET' }))
  expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  expect(JSON.parse(sessionStorage.getItem('foc.user-session') ?? '{}')).toMatchObject({ accessToken: 'signed.jwt' })
})

test('shows an accessible error when the live profile cannot be loaded', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
        userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
      }),
    })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ detail: 'Unavailable' }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your profile. Please sign out and sign in again.')
})

test('reloads the live profile when restoring a browser session', async () => {
  saveSession({
    accessToken: 'restored.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
    userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Stale name', role: 'USER',
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', email: 'alice@u.nus.edu', username: 'Persisted Alice',
      role: 'USER', status: 'ACTIVE', createdAt: '2030-01-01T00:00:00Z',
    }),
  }))

  render(<App />)

  expect(await screen.findByText('Persisted Alice')).toBeInTheDocument()
  const [, options] = vi.mocked(fetch).mock.calls[0]
  expect((options?.headers as Headers).get('Authorization')).toBe('Bearer restored.jwt')
})

test('shows one generic failure for failed login', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'Invalid email or password' }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in with those credentials.')
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
})

test('preserves registration from the account switcher', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/registrations', expect.objectContaining({ method: 'POST' }))
  await screen.findByText('Registration successful. Check your email for a verification code before signing in.')
  expect(screen.getByRole('button', { name: 'Verify email' })).toBeInTheDocument()
})

test('keeps registration failures clear when the API is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error('not JSON') } }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Registration could not be completed. Please try again.')
})

test('requests a password reset with generic success feedback and never exposes an OTP', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(within(screen.getByRole('form', { name: 'Request password reset form' })).getByRole('button', { name: 'Send reset code' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/password-reset-requests', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('status')).toHaveTextContent('If an eligible active account matches that email, a reset code has been sent.')
  expect(screen.queryByText(/123456/)).not.toBeInTheDocument()
})

test('shows an accessible generic failure when a reset request cannot be completed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'Unavailable' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to request a password reset right now. Please try again.')
})

test('verifies a registered email with the live verification API', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))
  await user.click(await screen.findByRole('button', { name: 'Verify email' }))
  await user.type(screen.getByLabelText('Verification code'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify email' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/email-verifications', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Email verified. You can now sign in.')
})

test('shows a clear cooldown error when resending an email verification code', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    headers: new Headers({ 'Retry-After': '90' }),
    json: async () => ({ detail: 'Email verification resend is not available yet' }),
  }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Verify email' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Resend verification code' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/email-verification-resends', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 90 seconds before requesting another code.')
})

test('confirms that a resend request was accepted without exposing a code', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Verify email' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Resend verification code' }))

  expect(await screen.findByRole('status')).toHaveTextContent('A new verification code has been sent.')
  expect(screen.queryByText(/123456/)).not.toBeInTheDocument()
})

test('confirms a reset code and lets the user return to sign in', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await user.click(await screen.findByRole('button', { name: 'Enter reset code' }))
  await user.type(screen.getByLabelText('Reset code'), '123456')
  await user.type(screen.getByLabelText('New password'), 'new-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/password-reset-confirmations', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your password has been updated. You can now sign in.')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test('shows a generic confirmation failure for an invalid or expired code', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'Invalid or expired password reset code' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  await user.click(await screen.findByRole('button', { name: 'Enter reset code' }))
  await user.type(screen.getByLabelText('Reset code'), '000000')
  await user.type(screen.getByLabelText('New password'), 'new-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('The code is invalid or expired. Request a new code and try again.')
})
