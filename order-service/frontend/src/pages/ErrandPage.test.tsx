import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../api/orderApi'
import { COURIER_ID, order, REQUESTER_ID, signIn, STRANGER_ID, stubFetch } from '../test/fixtures'
import { ErrandPage } from './ErrandPage'

const ORDER_URL = '/api/orders/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64'

/** Serves `current` for GET and applies `next` for a POST action (or a problem). */
function serve(current: Order, onAction?: (action: string) => { status?: number; body: unknown }) {
  return stubFetch((url, init) => {
    if (init?.method === 'POST' && onAction) return onAction(url.split('/').at(-1) ?? '')
    return { body: current }
  })
}

function renderErrand() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64']}>
        <Routes>
          <Route element={<ErrandPage />} path="/errands/:orderId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ErrandPage', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  describe('for a courier browsing an open errand (Errand details)', () => {
    it('shows the reward card and asks for confirmation before accepting (F5.1.1, F5.1.2)', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const { fetchMock, calls } = serve(order(), () => ({ body: order({ state: 'ACCEPTED', courierId: STRANGER_ID }) }))
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(await screen.findByRole('heading', { name: 'Collect my printed notes' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Earn 18 credits' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Accept errand' }))
      const dialog = screen.getByRole('dialog', { name: 'Accept this errand?' })
      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(0)

      await user.click(within(dialog).getByRole('button', { name: 'Accept errand' }))
      expect(await screen.findByRole('heading', { name: "You're the courier" })).toBeInTheDocument()
      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(`${ORDER_URL}/accept`)
    })

    it('cancelling the popup does not accept', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const { fetchMock, calls } = serve(order())
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Accept errand' }))
      await user.click(screen.getByRole('button', { name: 'Not now' }))

      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(0)
    })

    it('explains losing an acceptance race (F5.3.1) and shows the latest state', async () => {
      signIn(STRANGER_ID, 'COURIER')
      const taken = order({ state: 'ACCEPTED', courierId: COURIER_ID })
      let accepted = false
      const fetchMock = stubFetch((_url, init) => {
        if (init?.method === 'POST') {
          accepted = true
          return { status: 409, body: { detail: 'taken', code: 'ORDER_ALREADY_ACCEPTED', currentState: 'ACCEPTED' } }
        }
        return { body: accepted ? taken : order() }
      }).fetchMock
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Accept errand' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept errand' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Another courier accepted this errand first.')
    })

    it('explains an errand that expired before acceptance (F5.4.2)', async () => {
      signIn(STRANGER_ID, 'COURIER')
      vi.stubGlobal(
        'fetch',
        serve(order(), () => ({ status: 409, body: { detail: 'x', code: 'ORDER_EXPIRED', currentState: 'EXPIRED' } }))
          .fetchMock,
      )
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Accept errand' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept errand' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('expired before it could be accepted')
    })
  })

  describe('for the assigned courier (Courier active order)', () => {
    it('offers pickup, then delivery', async () => {
      signIn(COURIER_ID, 'COURIER')
      let current = order({ state: 'ACCEPTED', courierId: COURIER_ID })
      const { fetchMock, calls } = stubFetch((url, init) => {
        if (init?.method === 'POST') {
          current = order({ state: url.endsWith('/pickup') ? 'PICKED_UP' : 'DELIVERED', courierId: COURIER_ID })
        }
        return { body: current }
      })
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(await screen.findByRole('heading', { name: "You're the courier" })).toBeInTheDocument()
      expect(screen.getByText(/Next: collect the item/)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Mark as picked up' }))
      await user.click(await screen.findByRole('button', { name: 'Mark as delivered' }))

      expect(await screen.findByText(/Waiting for the requester to confirm/)).toBeInTheDocument()
      expect(calls.filter((call) => call.init?.method === 'POST').map((call) => call.url)).toEqual([
        `${ORDER_URL}/pickup`,
        `${ORDER_URL}/deliver`,
      ])
    })

    it('confirms before withdrawing', async () => {
      signIn(COURIER_ID, 'COURIER')
      const { fetchMock, calls } = serve(order({ state: 'ACCEPTED', courierId: COURIER_ID }), () => ({
        body: order(),
      }))
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw' }))

      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(`${ORDER_URL}/withdraw`)
    })

    it('tells the user to switch role when the session role is wrong', async () => {
      signIn(COURIER_ID, 'REQUESTER')
      vi.stubGlobal(
        'fetch',
        serve(order({ state: 'ACCEPTED', courierId: COURIER_ID }), () => ({ status: 403, body: { detail: 'no' } }))
          .fetchMock,
      )
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Mark as picked up' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Switch to the right role')
    })
  })

  describe('for the requester (Requester active order)', () => {
    it('asks for confirmation before confirming receipt and transferring the reward (F6.3)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      const { fetchMock, calls } = serve(order({ state: 'DELIVERED', courierId: COURIER_ID }), () => ({
        body: order({ state: 'COMPLETED', courierId: COURIER_ID }),
      }))
      vi.stubGlobal('fetch', fetchMock)
      const user = userEvent.setup()
      renderErrand()

      expect(await screen.findByRole('heading', { name: 'Have you received your item?' })).toBeInTheDocument()
      expect(screen.getByText('Confirm only after you receive the items')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Confirm receipt · Transfer 18 credits' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Confirm receipt/ }))

      expect(await screen.findByRole('heading', { name: 'Errand completed' })).toBeInTheDocument()
      expect(calls.find((call) => call.init?.method === 'POST')?.url).toBe(`${ORDER_URL}/complete`)
    })

    it('warns about compensation when cancelling an accepted errand (F3.3)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal('fetch', serve(order({ state: 'ACCEPTED', courierId: COURIER_ID })).fetchMock)
      const user = userEvent.setup()
      renderErrand()

      await user.click(await screen.findByRole('button', { name: 'Cancel errand' }))

      expect(screen.getByRole('dialog')).toHaveTextContent('receive 20% of the reward as compensation')
    })

    it('offers no cancel once the item is picked up (F3.4)', async () => {
      signIn(REQUESTER_ID, 'REQUESTER')
      vi.stubGlobal('fetch', serve(order({ state: 'PICKED_UP', courierId: COURIER_ID })).fetchMock)
      renderErrand()

      expect(await screen.findByRole('heading', { name: 'Your item has been picked up' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel errand' })).not.toBeInTheDocument()
    })
  })

  it('shows a not-found state for a hidden or missing errand', async () => {
    signIn(STRANGER_ID, 'COURIER')
    vi.stubGlobal('fetch', stubFetch(() => ({ status: 404, body: { code: 'ORDER_NOT_FOUND' } })).fetchMock)
    renderErrand()

    expect(await screen.findByRole('heading', { name: 'Errand not found' })).toBeInTheDocument()
  })
})
