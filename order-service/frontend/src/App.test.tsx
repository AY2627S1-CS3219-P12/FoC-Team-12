import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './App'
import { sessionKey } from './auth/session'

function signIn(role: 'REQUESTER' | 'COURIER' = 'COURIER') {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      userId: '5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10',
      username: 'Alex',
      role,
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

describe('AppRoutes', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('asks a signed-out visitor to sign in', () => {
    render(
      <MemoryRouter initialEntries={['/errands/browse']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in to see errands' })).toBeInTheDocument()
  })

  it('sends /errands to the browse screen', () => {
    signIn()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/errands']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Run an errand' })).toBeInTheDocument()
  })
})
