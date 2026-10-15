import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { sessionKey } from './auth/session'

const balance = {
  userId: '10000000-0000-0000-0000-000000000000',
  availableBalance: 4,
  reservedBalance: 6,
  totalBalance: 10,
  updatedAt: '2026-10-15T09:00:00Z',
}

const transaction = {
  id: '30000000-0000-0000-0000-000000000000',
  operationId: '40000000-0000-0000-0000-000000000000',
  reservationId: '50000000-0000-0000-0000-000000000000',
  type: 'RESERVATION_CREATED',
  availableDelta: -6,
  reservedDelta: 6,
  availableBalanceAfter: 4,
  reservedBalanceAfter: 6,
  createdAt: '2026-10-15T09:00:00Z',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':
        status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })
}

function signedIn() {
  sessionStorage.setItem(
    sessionKey,
    JSON.stringify({
      accessToken: 'valid-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      userId: balance.userId,
      username: 'alex',
      role: 'REQUESTER',
      availableRoles: ['REQUESTER', 'COURIER'],
    }),
  )
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

function mockSuccessfulApi(totalPages = 1) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/credits/me') return response(balance)
    if (url.includes('/api/credits/me/transactions')) {
      const page = Number(
        new URL(url, 'http://localhost').searchParams.get('page'),
      )
      return response({
        content: [
          { ...transaction, id: `${transaction.id.slice(0, -1)}${page}` },
        ],
        page,
        size: 8,
        totalElements: totalPages,
        totalPages,
      })
    }
    return response({}, 404)
  })
}

describe('Credit dashboard', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('asks a signed-out visitor to authenticate without calling the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderApp()

    expect(
      screen.getByRole('heading', { name: 'Sign in to view your credits' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sign in to FoC' }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the authenticated balance and immutable ledger history', async () => {
    signedIn()
    const fetchMock = mockSuccessfulApi()
    vi.stubGlobal('fetch', fetchMock)

    renderApp()

    expect(
      await screen.findByRole('heading', { name: /4 available/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('4 of 10 credits available'),
    ).toBeInTheDocument()
    expect(screen.getByText('Reserved for an errand')).toBeInTheDocument()
    expect(screen.getByText('4 available · 6 reserved')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/credits/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    )
  })

  it('requests the next zero-based transaction page', async () => {
    signedIn()
    const fetchMock = mockSuccessfulApi(2)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/credits/me/transactions?page=1&size=8',
        expect.anything(),
      )
    })
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  })

  it('shows a recoverable pending-account state for a 404', async () => {
    signedIn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ detail: 'Credit account not found' }, 404)),
    )

    renderApp()

    expect(
      await screen.findByRole('heading', {
        name: 'Your credits are being prepared',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Check again' }),
    ).toBeInTheDocument()
  })

  it('clears an expired session after a 401 response', async () => {
    signedIn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ detail: 'A valid bearer token is required' }, 401),
      ),
    )

    renderApp()

    expect(
      await screen.findByRole('heading', { name: 'Please sign in again' }),
    ).toBeInTheDocument()
    expect(sessionStorage.getItem(sessionKey)).toBeNull()
  })
})
