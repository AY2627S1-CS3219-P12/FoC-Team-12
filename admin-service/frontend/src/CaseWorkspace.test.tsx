import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { saveSession } from './auth/session'

const id = '10000000-0000-4000-8000-000000000001'
const actor = '20000000-0000-4000-8000-000000000001'
const order = '30000000-0000-4000-8000-000000000001'
const summary = {
  caseId: id,
  orderId: order,
  state: 'OPEN',
  reviewerId: null,
  revision: 1,
  createdAt: '2026-10-29T10:00:00Z',
}
function session(
  role: 'ADMIN' | 'REQUESTER' = 'REQUESTER',
  accessToken = 'user-jwt',
) {
  saveSession({
    userId: actor,
    username: 'Tester',
    role,
    accessToken,
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    availableRoles: ['REQUESTER', 'ADMIN'],
  })
}
function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data }
}
beforeEach(() => {
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/admin')
})

it('submits in participant mode and retries the same key and body after an uncertain response', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost response'))
    .mockResolvedValueOnce(
      response(
        {
          case: summary,
          ownStatement: {
            reporterId: actor,
            description: 'Missing item',
            submittedAt: summary.createdAt,
          },
        },
        201,
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(screen.getByText(order)).toBeVisible()
  expect(
    screen.queryByRole('textbox', { name: 'Errand ID' }),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('What happened?'), {
    target: { value: 'Missing item' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit report' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'required service is unavailable',
  )
  expect(screen.getByLabelText('What happened?')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
  expect(await screen.findByText('Your report was submitted')).toBeVisible()
  const first = fetcher.mock.calls[0]![1]
  const second = fetcher.mock.calls[1]![1]
  expect(first.headers['Idempotency-Key']).toBe(
    second.headers['Idempotency-Key'],
  )
  expect(first.body).toBe(second.body)
  expect(JSON.parse(first.body)).toEqual({
    orderId: order,
    description: 'Missing item',
  })
  expect(first.headers.Authorization).toBe('Bearer user-jwt')
  expect(sessionStorage.getItem('foc.report-pending.' + actor)).toBeNull()
})
it('requires errand context and does not advertise reporting in administrator navigation', () => {
  window.history.replaceState({}, '', '/admin/reports/new')
  session()
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(screen.getByText('Choose an errand to report')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Go to my errands' }),
  ).toHaveAttribute('href', '/errands/mine')
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Case navigation' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Reports' }),
  ).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})
it('does not move an uncertain statement to another errand', () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + id)
  session()
  sessionStorage.setItem(
    'foc.report-pending.' + actor,
    JSON.stringify({
      key: id,
      body: { orderId: order, description: 'Existing pending statement' },
    }),
  )
  render(<App />)
  expect(screen.getByText('Finish your pending report')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Resume pending report' }),
  ).toHaveAttribute('href', '/admin/reports/new?orderId=' + order)
  expect(
    screen.queryByRole('button', { name: 'Submit report' }),
  ).not.toBeInTheDocument()
})
it('preserves queue context in case detail without participant navigation links', async () => {
  const context = '?page=2&size=20&status=UNDER_REVIEW&query=' + order
  window.history.replaceState({}, '', '/admin/cases/' + id + context)
  session('ADMIN')
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
      .mockResolvedValue(response({ case: summary, statements: [] })),
  )
  render(<App />)
  await screen.findByText('Case details')
  expect(
    screen.getByRole('link', { name: 'Back to report queue' }),
  ).toHaveAttribute('href', '/admin' + context)
  expect(
    screen.queryByRole('link', { name: 'Participant reports' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: 'Case navigation' }),
  ).not.toBeInTheDocument()
})
it('opens the queue directly on the dashboard and restores filters and page from the URL', async () => {
  window.history.replaceState(
    {},
    '',
    '/admin?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [{ ...summary, state: 'UNDER_REVIEW' }],
        page: 2,
        size: 20,
        totalElements: 45,
        totalPages: 3,
      }),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  const review = await screen.findByRole('link', { name: 'Review case ' + id })
  expect(fetcher.mock.calls[1]![0]).toBe(
    '/api/admin/cases?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
  expect(screen.getByRole('button', { name: 'Under review' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByText('Page 3 of 3')).toBeVisible()
  expect(review).toHaveAttribute(
    'href',
    '/admin/cases/' + id + '?page=2&size=20&status=UNDER_REVIEW&query=' + order,
  )
})
it('keeps all-reports selection on a reload without sending the UI marker to the API', async () => {
  window.history.replaceState({}, '', '/admin?status=ALL')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      }),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(
    await screen.findByText('No reports match these filters'),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'All reports' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(fetcher.mock.calls[1]![0]).toBe('/api/admin/cases?page=0&size=20')
})
it('resumes a pending report after reload instead of generating another request', async () => {
  window.history.replaceState({}, '', '/admin/reports/new?orderId=' + order)
  session()
  sessionStorage.setItem(
    'foc.report-pending.' + actor,
    JSON.stringify({
      key: id,
      body: { orderId: order, description: 'Pending statement' },
    }),
  )
  const fetcher = vi
    .fn()
    .mockResolvedValue(response({ detail: 'Already submitted.' }, 409))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(screen.getByLabelText('What happened?')).toHaveValue(
    'Pending statement',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Already submitted.',
  )
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(id)
  expect(screen.getByLabelText('What happened?')).toBeEnabled()
})
it('shows only the reporters own statement and hides it on identity replacement', async () => {
  window.history.replaceState({}, '', '/admin/reports/' + id)
  session()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      response({
        case: summary,
        ownStatement: {
          reporterId: actor,
          description: 'My private statement',
          submittedAt: summary.createdAt,
        },
      }),
    ),
  )
  render(<App />)
  expect(await screen.findByText('My private statement')).toBeVisible()
  expect(screen.queryByText('Participant statements')).not.toBeInTheDocument()
  session('ADMIN', 'replacement')
  await waitFor(() =>
    expect(screen.queryByText('My private statement')).not.toBeInTheDocument(),
  )
})
it('does not query the queue until live administrator eligibility is confirmed', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi.fn().mockResolvedValue(response({}, 403))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]![0]).toBe('/api/admin/session')
})
it('loads queue filters and empty results from the live API', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValue(
      response({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      }),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(await screen.findByText('No open reports')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  fireEvent.change(screen.getByLabelText('Find a case or errand'), {
    target: { value: order },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      '/api/admin/cases?page=0&size=20&status=OPEN&query=' + order,
    ),
  )
})
it('claims using the displayed revision and explains conflicts without claiming success', async () => {
  window.history.replaceState({}, '', '/admin/cases/' + id)
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValueOnce(response({ case: summary, statements: [] }))
    .mockResolvedValue(
      response(
        { detail: 'This case has changed. Refresh it before claiming.' },
        409,
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Claim case' }))
  expect(
    await screen.findByText(
      'This case has changed. Refresh it before claiming.',
    ),
  ).toBeVisible()
  const call = fetcher.mock.calls.find((call) => call[1]?.method === 'POST')!
  expect(call[0]).toBe('/api/admin/cases/' + id + '/claim')
  expect(JSON.parse(call[1].body)).toEqual({ expectedRevision: 1 })
  expect(screen.queryByText('Case assigned to you.')).not.toBeInTheDocument()
})
it('removes protected queue data when a later live administrator check denies access', async () => {
  window.history.replaceState({}, '', '/admin/cases')
  session('ADMIN')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ userId: actor, role: 'ADMIN' }))
    .mockResolvedValueOnce(
      response({
        content: [summary],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }),
    )
    .mockResolvedValue(response({}, 403))
  vi.stubGlobal('fetch', fetcher)
  render(<App />)
  expect(await screen.findByText('Case ' + id)).toBeVisible()
  fireEvent.focus(window)
  expect(
    await screen.findByText('This workspace is for administrators'),
  ).toBeVisible()
  expect(screen.queryByText('Case ' + id)).not.toBeInTheDocument()
})
