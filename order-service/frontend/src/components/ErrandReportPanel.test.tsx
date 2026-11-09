import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrandReportPanel } from './ErrandReportPanel'
import {
  order,
  signIn,
  REQUESTER_ID,
  STRANGER_ID,
  stubFetch,
} from '../test/fixtures'
import {
  sessionChangedEvent,
  sessionExpiredEvent,
  readSession,
} from '../auth/session'

const id = order().id
const caseId = '10000000-0000-4000-8000-000000000001'
afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('clears the prior report link when identity changes and offers sign-in after expiry', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body:
        readSession()?.userId === REQUESTER_ID
          ? { orderId: id, status: 'OWN_REPORT', caseId, state: 'OPEN' }
          : { orderId: id, status: 'INELIGIBLE', caseId: null, state: null },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByRole('link', { name: 'View your report' }),
  ).toBeVisible()
  act(() => {
    signIn(STRANGER_ID, 'COURIER')
    window.dispatchEvent(new Event(sessionChangedEvent))
  })
  await waitFor(() => {
    expect(
      screen.queryByText('Need help with this errand?'),
    ).not.toBeInTheDocument()
  })
  expect(
    screen.queryByRole('link', { name: 'View your report' }),
  ).not.toBeInTheDocument()
  act(() => {
    sessionStorage.clear()
    window.dispatchEvent(new Event(sessionExpiredEvent))
  })
  expect(
    screen.getByRole('link', { name: 'Sign in to view your report' }),
  ).toHaveAttribute(
    'href',
    '/?returnTo=' + encodeURIComponent('/errands/' + id),
  )
})
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ErrandReportPanel orderId={id} />
    </QueryClientProvider>,
  )
}
it.each(['REQUESTER', 'COURIER'] as const)(
  'offers reporting only after Admin verifies a %s participant',
  async (role) => {
    signIn(REQUESTER_ID, role)
    const { fetchMock, calls } = stubFetch(() => ({
      body: { orderId: id, status: 'ELIGIBLE', caseId: null, state: null },
    }))
    vi.stubGlobal('fetch', fetchMock)
    show()
    expect(
      await screen.findByRole('link', { name: 'Report an issue' }),
    ).toHaveAttribute('href', `/admin/reports/new?orderId=${id}`)
    expect(calls[0]?.url).toBe(`/api/admin/orders/${id}/report-context`)
  },
)
it('links only to the callers own existing report including resolved status', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: { orderId: id, status: 'OWN_REPORT', caseId, state: 'RESOLVED' },
    })).fetchMock,
  )
  show()
  expect(
    await screen.findByRole('link', { name: 'View your report' }),
  ).toHaveAttribute('href', `/admin/reports/${caseId}`)
  expect(screen.getByText(/Your report is resolved/)).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Report an issue' }),
  ).not.toBeInTheDocument()
})
it('distinguishes an unavailable dependency from ineligibility and retries', async () => {
  signIn(REQUESTER_ID, 'COURIER')
  let failed = true
  vi.stubGlobal(
    'fetch',
    stubFetch(() =>
      failed
        ? { status: 503, body: { detail: 'Chat unavailable' } }
        : {
            body: {
              orderId: id,
              status: 'INELIGIBLE',
              caseId: null,
              state: null,
            },
          },
    ).fetchMock,
  )
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We can’t load reports right now',
  )
  expect(
    screen.queryByRole('link', { name: 'Report an issue' }),
  ).not.toBeInTheDocument()
  failed = false
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Retry report access' }))
  await waitFor(() => {
    expect(
      screen.queryByText('Need help with this errand?'),
    ).not.toBeInTheDocument()
  })
})
it('fails closed on malformed context rather than offering reporting', async () => {
  signIn(REQUESTER_ID, 'REQUESTER')
  vi.stubGlobal(
    'fetch',
    stubFetch(() => ({
      body: { orderId: id, status: 'OWN_REPORT', caseId: null, state: null },
    })).fetchMock,
  )
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We can’t load reports right now',
  )
})
