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
  window.history.replaceState({}, '', '/admin/reports/new')
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
  fireEvent.change(screen.getByLabelText('Errand ID'), {
    target: { value: order },
  })
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
  expect(first.headers.Authorization).toBe('Bearer user-jwt')
  expect(sessionStorage.getItem('foc.report-pending.' + actor)).toBeNull()
})
it('resumes a pending report after reload instead of generating another request', async () => {
  window.history.replaceState({}, '', '/admin/reports/new')
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
  expect(await screen.findByText(/Access denied/)).toBeVisible()
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
  expect(await screen.findByText('No cases match these filters.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Status'), {
    target: { value: 'OPEN' },
  })
  fireEvent.change(screen.getByLabelText('Case or errand ID'), {
    target: { value: order },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
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
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This case has changed',
  )
  const call = fetcher.mock.calls[2]!
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
  expect(await screen.findByText(/Access denied/)).toBeVisible()
  expect(screen.queryByText('Case ' + id)).not.toBeInTheDocument()
})
