import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
it('shows scoped coverage, historical assignments, checkpoint progress and both timestamps', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(timeline())))
  render(<EvidencePanel caseId={caseId} orderId={orderId} />)
  expect(
    await screen.findByText('Complete through the displayed checkpoints'),
  ).toBeVisible()
  expect(
    screen.getByText(/does not mean the evidence is current forever/),
  ).toBeVisible()
  expect(screen.getByText('Historical courier')).toBeVisible()
  expect(screen.getByText(/Assigned .*Unassigned/)).toBeVisible()
  expect(screen.getByText(/Occurred .*Ingested/)).toBeVisible()
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
  expect(screen.getByText(/No producer checkpoints/)).toBeVisible()
  expect(
    screen.queryByText('Complete through the displayed checkpoints'),
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
  expect(screen.getByText('MISSING SEQUENCE')).toBeVisible()
  expect(screen.getByText(/Sequences 1–4/)).toBeVisible()
  expect(screen.getByText(/Behind/)).toBeVisible()
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
  expect(screen.getAllByText('CaseOpened')).toHaveLength(2)
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
    screen.queryByText('Complete through the displayed checkpoints'),
  ).not.toBeInTheDocument()
})
