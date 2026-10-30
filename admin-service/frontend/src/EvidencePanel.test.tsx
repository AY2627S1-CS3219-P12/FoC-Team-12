import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  EvidencePanel,
  type EvidenceRecord,
  type Timeline,
} from './EvidencePanel'
import { saveSession } from './auth/session'

const caseId = '10000000-0000-4000-8000-000000000001'
const orderId = '20000000-0000-4000-8000-000000000001'
const actor = '30000000-0000-4000-8000-000000000001'
const at = '2026-10-29T10:00:00Z'
const snapshot = {
  orderId,
  requesterId: actor,
  courierId: null,
  status: 'OPEN',
  title: 'Campus lunch',
  description: 'Historical order description',
  creditReward: 10,
  pickupDeadline: at,
  pickupLocationId: actor,
  dropoffLocationId: caseId,
  pickupLocationName: null,
  dropoffLocationName: null,
}
function record(id = caseId, sequence = 1): EvidenceRecord {
  return {
    eventId: id,
    source: 'admin-service',
    stream: 'admin.events',
    sourceSequence: sequence,
    orderId,
    action: 'CaseOpened',
    actorUserId: actor,
    occurredAt: at,
    ingestedAt: at,
    data: {
      kind: 'ADMIN',
      caseId,
      operationId: null,
      targetUserId: null,
      result: null,
    },
  }
}
function timeline(): Timeline {
  return {
    caseId,
    orderId,
    evidenceRevision: 'revision-1',
    order: snapshot,
    participants: [
      {
        userId: actor,
        relationship: 'HISTORICAL_COURIER',
        assignedAt: at,
        unassignedAt: at,
      },
    ],
    records: [record()],
    coverage: {
      status: 'COMPLETE',
      asOf: at,
      checkpoints: [
        {
          source: 'admin-service',
          stream: 'admin.events',
          aggregateId: caseId,
          committedSequence: 2,
          projectedSequence: 2,
          checkedAt: at,
        },
      ],
      blockingGaps: [],
    },
    nextCursor: null,
  }
}
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}
beforeEach(() => {
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-jwt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
it('leads with readable activity and participants, keeping diagnostics collapsed', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(timeline())))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('Complete through verified coverage limits'),
  ).toBeVisible()
  expect(screen.getByText(/Newer activity may not be included/)).toBeVisible()
  expect(screen.getByText('Historical courier')).toBeVisible()
  expect(screen.getByText(/Assigned .*Unassigned/)).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Case opened' })).toBeVisible()
  expect(screen.getByText('Recorded actor: Courier 1')).toBeVisible()
  const event = screen
    .getByRole('heading', { name: 'Case opened' })
    .closest('article')!
  expect(
    within(event)
      .getByText(/Occurred/)
      .querySelector('time'),
  ).toHaveAttribute('datetime', at)
  expect(
    within(event).getByText('admin-service / admin.events'),
  ).not.toBeVisible()
  expect(screen.getByText('revision-1')).not.toBeVisible()
  expect(screen.getByText(`Account ID: ${actor}`)).not.toBeVisible()
  await user.click(within(event).getByText('Technical details'))
  expect(within(event).getByText('admin-service / admin.events')).toBeVisible()
  expect(
    within(event)
      .getByText('Added to evidence')
      .nextElementSibling?.querySelector('time'),
  ).toHaveAttribute('datetime', at)
  await user.click(screen.getByText('Coverage technical details'))
  expect(screen.getByText('revision-1')).toBeVisible()
  expect(screen.getByText('Campus lunch')).toBeVisible()
})
it('does not equate an empty page and absent gaps with complete coverage', async () => {
  const data = timeline()
  data.coverage.status = 'UNKNOWN'
  data.coverage.checkpoints = []
  data.records = []
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('Coverage unknown')).toBeVisible()
  expect(screen.getByText(/empty result is not proof/)).toBeVisible()
  expect(screen.getByText(/No producer checkpoints/)).not.toBeVisible()
  expect(
    screen.queryByText('Complete through verified coverage limits'),
  ).not.toBeInTheDocument()
})
it('uses consistent account labels across assignment periods and typed activity without inventing names', async () => {
  const data = timeline()
  const courier = '40000000-0000-4000-8000-000000000001'
  data.participants = [
    {
      userId: actor,
      relationship: 'REQUESTER',
      assignedAt: null,
      unassignedAt: null,
    },
    {
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: at,
    },
    {
      userId: courier,
      relationship: 'HISTORICAL_COURIER',
      assignedAt: at,
      unassignedAt: null,
    },
  ]
  const order = record()
  order.action = 'WITHDRAW'
  order.actorUserId = courier
  order.data = {
    kind: 'ORDER',
    fromState: 'ACCEPTED',
    toState: 'OPEN',
    requesterId: actor,
    courierId: null,
    previousCourierId: courier,
    snapshot,
  }
  const credit = record(orderId, 2)
  credit.action = 'CreditsReleased'
  credit.data = {
    kind: 'CREDIT',
    operationId: caseId,
    result: 'APPLIED',
    reasonCode: null,
    ledgerEntries: [
      {
        ledgerEntryId: orderId,
        userId: actor,
        availableDelta: 10,
        reservedDelta: -10,
        availableBalance: 20,
        reservedBalance: 0,
      },
    ],
  }
  data.records = [order, credit]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByRole('heading', { name: 'Courier withdrew' }),
  ).toBeVisible()
  expect(screen.getByText('Recorded actor: Courier 1')).toBeVisible()
  expect(
    screen.getByText('Courier: Unassigned · Previous courier: Courier 1'),
  ).toBeVisible()
  expect(screen.getAllByText('Courier 1', { selector: 'strong' })).toHaveLength(
    2,
  )
  expect(screen.queryByText('Courier 2')).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Credits released' }),
  ).toBeVisible()
  expect(screen.getByText('Outcome: Applied')).toBeVisible()
  expect(
    screen.getByText(/Available: \+10 \(balance 20\).*Reserved: -10/),
  ).toBeVisible()
  for (const id of [actor, courier, caseId, orderId]) {
    for (const element of screen.getAllByText(id, { exact: false })) {
      expect(element).not.toBeVisible()
    }
  }
})
it('keeps absent actors and accounts outside supplied history explicit', async () => {
  const data = timeline()
  data.records[0]!.actorUserId = null
  const other = record(orderId, 2)
  other.actorUserId = orderId
  other.action = 'CaseClaimed'
  data.records.push(other)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('Actor not recorded')).toBeVisible()
  expect(
    screen.getByText(
      'Recorded actor: Account outside supplied participant history',
    ),
  ).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Case claimed' })).toBeVisible()
})
it('shows test-only markers from supplied fixtures and never substitutes them on failure', async () => {
  const data = timeline()
  data.order = { ...snapshot, title: 'TEST ONLY — synthetic errand timeline' }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue(response({}, 503)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('TEST ONLY — synthetic errand timeline'),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh evidence' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'evidence service is unavailable',
  )
  expect(
    screen.queryByText('TEST ONLY — synthetic errand timeline'),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Case opened' }),
  ).not.toBeInTheDocument()
})
it('shows known gaps and projection lag', async () => {
  const data = timeline()
  data.coverage.status = 'INCOMPLETE'
  data.coverage.checkpoints[0]!.projectedSequence = 0
  data.coverage.blockingGaps = [
    {
      source: 'order-service',
      stream: 'order.lifecycle.events',
      aggregateId: orderId,
      fromSequence: 1,
      toSequence: 4,
      reason: 'MISSING_SEQUENCE',
    },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(await screen.findByText('Evidence is incomplete')).toBeVisible()
  expect(
    screen.getByText('Errand history: Some activity is missing'),
  ).toBeVisible()
  expect(screen.getByText(/Sequences 1–4/)).not.toBeVisible()
  expect(screen.getByText(/Some history is still catching up/)).toBeVisible()
  expect(screen.getByText(/Behind/)).not.toBeVisible()
})
it('retries an unavailable page with the same cursor, preserving records and deduplicating overlap', async () => {
  const first = timeline()
  first.nextCursor = 'opaque+/cursor'
  const second = timeline()
  second.records = [record(), record(orderId, 2)]
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response(second))
  vi.stubGlobal('fetch', fetcher)
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'cannot verify whether the evidence is complete',
  )
  expect(
    screen.getByText('Coverage cannot currently be verified'),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Retry evidence page' }))
  expect(await screen.findByText('2 loaded')).toBeVisible()
  expect(fetcher.mock.calls[1]![0]).toBe(fetcher.mock.calls[2]![0])
  expect(fetcher.mock.calls[1]![0]).toContain('cursor=opaque%2B%2Fcursor')
  expect(screen.getAllByRole('heading', { name: 'Case opened' })).toHaveLength(
    2,
  )
})
it('never merges a changed revision and restarts from the first page', async () => {
  const first = timeline()
  first.nextCursor = 'cursor'
  const changed = timeline()
  changed.evidenceRevision = 'revision-2'
  changed.records = [record(orderId, 2)]
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first))
    .mockResolvedValueOnce(response(changed))
    .mockResolvedValueOnce(response(timeline()))
  vi.stubGlobal('fetch', fetcher)
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Restart the timeline',
  )
  expect(screen.getByText('1 loaded')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Restart timeline' }))
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  )
  expect(fetcher.mock.calls[2]![0]).toBe(
    `cases/${caseId}/timeline?limit=20`.replace(/^/, '/api/admin/'),
  )
})
it('clears protected evidence if pagination is denied after revocation', async () => {
  const first = timeline()
  first.nextCursor = 'cursor'
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response({}, 403)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no longer have access',
  )
  expect(
    screen.queryByText('Historical order description'),
  ).not.toBeInTheDocument()
})
it.each([
  'conflicting record',
  'repeated cursor',
  'changed coverage',
  'out of order',
])('requires restart for %s without merging records', async (problem) => {
  const first = timeline()
  first.nextCursor = 'cursor'
  const second = timeline()
  if (problem === 'conflicting record')
    second.records[0]!.action = 'Changed event content'
  if (problem === 'repeated cursor') second.nextCursor = 'cursor'
  if (problem === 'changed coverage')
    second.coverage.asOf = '2026-10-29T11:00:00Z'
  if (problem === 'out of order') {
    second.records = [record(orderId, 2)]
    second.records[0]!.occurredAt = '2026-10-28T10:00:00Z'
  }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second)),
  )
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more evidence' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Restart the timeline',
  )
  expect(screen.getByText('1 loaded')).toBeVisible()
  expect(
    screen.queryByText('Complete through verified coverage limits'),
  ).not.toBeInTheDocument()
})
