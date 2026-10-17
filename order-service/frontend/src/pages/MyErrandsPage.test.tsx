import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COURIER_ID, order, page, REQUESTER_ID, signIn, stubFetch } from '../test/fixtures'
import { MyErrandsPage } from './MyErrandsPage'

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MyErrandsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MyErrandsPage', () => {
  beforeEach(() => signIn(REQUESTER_ID, 'REQUESTER'))
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it("shows the requester's finished errands first (F9.1)", async () => {
    const { fetchMock, calls } = stubFetch(() => ({
      body: page([order({ state: 'COMPLETED', courierId: COURIER_ID }), order({ id: 'b', state: 'CANCELLED', title: 'Pick up my coffee' })]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Collect my printed notes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pick up my coffee' })).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(calls[0]?.url).toContain('/api/orders/me/requested')
    expect(screen.getByRole('tab', { name: 'Errands I requested' })).toHaveAttribute('aria-selected', 'true')
  })

  it("switches to the courier's completed deliveries (F9.2)", async () => {
    const { fetchMock, calls } = stubFetch((url) => ({
      body: url.includes('delivered') ? page([order({ state: 'COMPLETED', title: 'Bring my parcel' })]) : page([]),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Nothing here yet' })

    await user.click(screen.getByRole('tab', { name: 'Errands I delivered' }))

    expect(await screen.findByRole('heading', { name: 'Bring my parcel' })).toBeInTheDocument()
    await waitFor(() => expect(calls.at(-1)?.url).toContain('/api/orders/me/delivered'))
  })

  it('explains an empty history', async () => {
    vi.stubGlobal('fetch', stubFetch(() => ({ body: page([]) })).fetchMock)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Nothing here yet' })).toBeInTheDocument()
    expect(screen.getByText(/once they're completed, cancelled or expired/)).toBeInTheDocument()
  })
})
