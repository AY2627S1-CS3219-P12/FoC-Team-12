import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from './App'

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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      accessToken: 'signed.jwt', tokenType: 'Bearer', expiresAt: '2030-01-01T00:15:00Z',
      userId: 'c3e8d15c-0bb4-443f-989e-b6fda9f38993', username: 'Alice', role: 'USER',
    }),
  }))
  render(<App />)
  const user = await fillLogin()

  await user.click(within(screen.getByRole('form', { name: 'Sign in form' })).getByRole('button', { name: 'Sign in' }))

  expect(fetch).toHaveBeenCalledWith('/api/users/login', expect.objectContaining({ method: 'POST' }))
  await screen.findByRole('heading', { name: 'You’re signed in' })
  expect(screen.getByText('Alice')).toBeInTheDocument()
  expect(JSON.parse(sessionStorage.getItem('foc.user-session') ?? '{}')).toMatchObject({ accessToken: 'signed.jwt' })
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
  await screen.findByText('Registration successful. You can now sign in.')
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
