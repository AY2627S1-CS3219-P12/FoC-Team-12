import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from './App'
import { saveSession } from './auth/session'

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const fillLogin = async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  return user
}

test('signs in successfully and stores the browser session', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
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
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  expect(screen.getByLabelText('Email')).toHaveValue('alice@u.nus.edu')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveFocus()
  expect(sessionStorage.getItem('foc.user-session')).toBeNull()
})

test('adds neutral wait-or-reset guidance after two generic failures for the same email', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()
  const form = within(screen.getByRole('form', { name: 'Sign in form' }))

  await user.click(form.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password. If you’ve made several attempts, wait 30 seconds or reset your password.')
  expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeEnabled()
})

test('tracks generic login failures separately for each email', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Incorrect email or password' }) }))
  render(<App />)
  const user = await fillLogin()
  const form = within(screen.getByRole('form', { name: 'Sign in form' }))

  await user.click(form.getByRole('button', { name: 'Sign in' }))
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('If you’ve made several attempts')

  await user.clear(screen.getByLabelText('Email'))
  await user.type(screen.getByLabelText('Email'), 'bob@u.nus.edu')
  await user.type(screen.getByLabelText('Password'), 'password-with-at-least-15-chars')
  await user.click(form.getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
})

test('replaces the registration fields with six OTP boxes after account creation', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/registrations', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(screen.getByText(/Verification code sent to/)).toBeInTheDocument()
  expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
  const digits = screen.getAllByRole('textbox', { name: /Verification code digit/ })
  expect(digits).toHaveLength(6)
  expect(digits[0]).toHaveFocus()
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

test('requests a password reset and opens a six-box code validation screen without exposing an OTP', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202, headers: new Headers({ 'Retry-After': '37' }) }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(within(screen.getByRole('form', { name: 'Request password reset form' })).getByRole('button', { name: 'Send reset code' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/password-reset-requests', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  expect(screen.getAllByRole('textbox', { name: /Verification code digit/ })).toHaveLength(6)
  expect(screen.getByRole('button', { name: 'Request another code in 37s' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeEnabled()
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
  const digits = await screen.findAllByRole('textbox', { name: /Verification code digit/ })
  await user.click(digits[0])
  await user.paste('123456')

  expect(await screen.findByRole('status')).toHaveTextContent('Email verified. You can now sign in.')
  expect(fetch).toHaveBeenLastCalledWith('/api/users/email-verifications', expect.objectContaining({ method: 'POST' }))
  expect(screen.queryByRole('button', { name: 'Verify email' })).not.toBeInTheDocument()
})

test('clears a rejected verification code and returns focus to its first digit', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: 'The verification code is invalid or expired.' }) }))
  render(<App />)
  const user = userEvent.setup()
  await openVerificationAfterRegistration(user)
  const digits = screen.getAllByRole('textbox', { name: /Verification code digit/ })
  await user.paste('000000')

  expect(await screen.findByRole('alert')).toHaveTextContent('The verification code is invalid or expired.')
  digits.forEach(digit => expect(digit).toHaveValue(''))
  expect(digits[0]).toHaveFocus()
})

test('redirects to OTP only when the API confirmed correct credentials require verification', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ code: 'EMAIL_VERIFICATION_REQUIRED', detail: 'Email verification is required before signing in' }),
  }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  expect(screen.getByText('alice@u.nus.edu')).toBeInTheDocument()
  expect(screen.getAllByRole('textbox', { name: /Verification code digit/ })).toHaveLength(6)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
})

test('keeps the generic login failure when verification was not confirmed', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Incorrect email or password' }),
  }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  expect(screen.queryByRole('heading', { name: 'Verify your email' })).not.toBeInTheDocument()
})

const openVerificationAfterRegistration = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.type(screen.getByLabelText('Username'), 'Alice')
  await user.type(screen.getByLabelText('Password'), '123456789012345')
  await user.click(within(screen.getByRole('form', { name: 'Create account form' })).getByRole('button', { name: 'Create account' }))
  await screen.findByRole('heading', { name: 'Verify your email' })
}

test('shows a live, disabled resend cooldown after registration', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) }))
  render(<App />)
  const user = userEvent.setup()
  await openVerificationAfterRegistration(user)

  expect(screen.getByRole('button', { name: 'Resend in 90s' })).toBeDisabled()
})

test('uses a conventional accessible password visibility toggle', async () => {
  render(<App />)
  const user = userEvent.setup()
  const password = screen.getByLabelText('Password')

  expect(password).toHaveAttribute('type', 'password')
  await user.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password).toHaveAttribute('type', 'text')
  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(password).toHaveAttribute('type', 'password')
})

test('places focus at the first field and advances through registration fields with Enter', async () => {
  render(<App />)
  const user = userEvent.setup()
  expect(screen.getByLabelText('Email')).toHaveFocus()

  await user.click(screen.getByRole('button', { name: 'Create account', pressed: false }))
  const email = screen.getByLabelText('Email')
  expect(email).toHaveFocus()
  await user.type(email, 'alice@u.nus.edu{Enter}')
  expect(screen.getByLabelText('Username')).toHaveFocus()
  await user.type(screen.getByLabelText('Username'), 'Alice{Enter}')
  expect(screen.getByLabelText('Password')).toHaveFocus()
})

test('applies a server-provided cooldown when a resend is too early', async () => {
  sessionStorage.setItem('foc.email-verification-resend:alice@u.nus.edu', String(Date.now() - 1))
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ code: 'EMAIL_VERIFICATION_REQUIRED', detail: 'Email verification is required before signing in' }) })
    .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '45' }), json: async () => ({ detail: 'Email verification resend is not available yet' }) }))
  render(<App />)
  const user = await fillLogin()
  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))
  await screen.findByRole('heading', { name: 'Verify your email' })
  expect(screen.getByRole('button', { name: 'Resend verification code' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Resend verification code' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/email-verification-resends', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 45 seconds before requesting another code.')
  expect(screen.getByRole('button', { name: 'Resend in 45s' })).toBeDisabled()
})

test('confirms a reset code and lets the user return to sign in', async () => {
  sessionStorage.setItem('foc.login-failures:alice@u.nus.edu', '2')
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 202 })
    .mockResolvedValueOnce({ ok: true, status: 204 })
    .mockResolvedValueOnce({ ok: true, status: 204 }))
  render(<App />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  await user.type(screen.getByLabelText('Email'), 'alice@u.nus.edu')
  await user.click(screen.getByRole('button', { name: 'Send reset code' }))
  expect(await screen.findByRole('heading', { name: 'Verify reset code' })).toBeInTheDocument()
  await user.paste('123456')
  expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/password-reset-verifications', expect.objectContaining({ method: 'POST' }))
  await user.type(screen.getByLabelText('New password'), 'new-password-with-15-chars')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password-with-15-chars')
  await user.click(screen.getByRole('button', { name: 'Update password' }))

  expect(fetch).toHaveBeenLastCalledWith('/api/users/password-reset-confirmations', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument()
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Confirm new password')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Request another code' })).not.toBeInTheDocument()
  expect(sessionStorage.getItem('foc.login-failures:alice@u.nus.edu')).toBeNull()
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
  const digits = await screen.findAllByRole('textbox', { name: /Verification code digit/ })
  await user.paste('000000')

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired password reset code')
  digits.forEach(digit => expect(digit).toHaveValue(''))
  expect(digits[0]).toHaveFocus()
  expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument()
})
