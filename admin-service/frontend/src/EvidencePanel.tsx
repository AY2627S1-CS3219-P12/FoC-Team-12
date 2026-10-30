import { useEffect, useRef, useState } from 'react'
import { CaseError, request } from './cases'

type Checkpoint = {
  source: string
  stream: string
  aggregateId: string
  committedSequence: number
  projectedSequence: number
  checkedAt: string
}
type Gap = {
  source: string
  stream: string
  aggregateId: string
  fromSequence: number
  toSequence: number
  reason: string
}
type Participant = {
  userId: string
  relationship: 'REQUESTER' | 'HISTORICAL_COURIER'
  assignedAt: string | null
  unassignedAt: string | null
}
type Snapshot = {
  orderId: string
  requesterId: string
  courierId: string | null
  status: string
  title: string
  description: string
  creditReward: number
  pickupDeadline: string
  pickupLocationId: string
  dropoffLocationId: string
  pickupLocationName: string | null
  dropoffLocationName: string | null
}
type Data =
  | {
      kind: 'ORDER'
      fromState: string | null
      toState: string
      requesterId: string
      courierId: string | null
      previousCourierId: string | null
      snapshot: Snapshot
    }
  | {
      kind: 'CREDIT'
      operationId: string
      result: string
      reasonCode: string | null
      ledgerEntries: {
        ledgerEntryId: string
        userId: string
        availableDelta: number
        reservedDelta: number
        availableBalance: number
        reservedBalance: number
      }[]
    }
  | {
      kind: 'ADMIN'
      caseId: string
      operationId: string | null
      targetUserId: string | null
      result: string | null
    }
export type EvidenceRecord = {
  eventId: string
  source: string
  stream: string
  sourceSequence: number
  orderId: string
  action: string
  actorUserId: string | null
  occurredAt: string
  ingestedAt: string
  data: Data
}
export type Timeline = {
  caseId: string
  orderId: string
  evidenceRevision: string
  order: Snapshot
  participants: Participant[]
  records: EvidenceRecord[]
  coverage: {
    status: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN'
    asOf: string
    checkpoints: Checkpoint[]
    blockingGaps: Gap[]
  }
  nextCursor: string | null
}

const date = (value: string) => new Date(value).toLocaleString()
function compare(a: EvidenceRecord, b: EvidenceRecord) {
  return (
    Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
    a.sourceSequence - b.sourceSequence ||
    (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
  )
}
function complete(timeline: Timeline) {
  const c = timeline.coverage
  return (
    c.status === 'COMPLETE' &&
    !c.blockingGaps.length &&
    c.checkpoints.length > 0 &&
    c.checkpoints.every((p) => p.projectedSequence >= p.committedSequence)
  )
}
function failure(error: unknown) {
  if (error instanceof CaseError) {
    if (error.status === 401)
      return 'Your session expired. Sign in again to view evidence.'
    if (error.status === 403 || error.status === 404)
      return 'You no longer have access to this case evidence.'
    if (error.status === 409)
      return 'The evidence snapshot changed or expired. Restart the timeline to load a consistent snapshot.'
  }
  return 'The evidence service is unavailable. We cannot verify whether the evidence is complete. Please retry.'
}
function EvidenceData({ record }: { record: EvidenceRecord }) {
  const data = record.data
  if (data.kind === 'ORDER')
    return (
      <div className="evidence-data">
        <p>
          {data.fromState
            ? data.fromState.replaceAll('_', ' ')
            : 'Initial state'}{' '}
          → {data.toState.replaceAll('_', ' ')}
        </p>
        <p>Requester: {data.requesterId}</p>
        <p>
          Courier: {data.courierId || 'Unassigned'}
          {data.previousCourierId &&
            ` · Previous courier: ${data.previousCourierId}`}
        </p>
        <details>
          <summary>Errand snapshot at this event</summary>
          <p>{data.snapshot.title}</p>
          <p className="statement-text">{data.snapshot.description}</p>
          <p>
            {data.snapshot.creditReward} credits · Deadline{' '}
            {date(data.snapshot.pickupDeadline)}
          </p>
          <p>
            {data.snapshot.pickupLocationName || 'Pickup name unavailable'} →{' '}
            {data.snapshot.dropoffLocationName || 'Drop-off name unavailable'}
          </p>
        </details>
      </div>
    )
  if (data.kind === 'CREDIT')
    return (
      <div className="evidence-data">
        <p>
          {data.result}
          {data.reasonCode && ` · ${data.reasonCode}`}
        </p>
        <p>Operation: {data.operationId}</p>
        {data.ledgerEntries.length ? (
          <ul>
            {data.ledgerEntries.map((entry) => (
              <li key={entry.ledgerEntryId}>
                <p>Account {entry.userId}</p>
                <p>
                  Available: {entry.availableDelta > 0 ? '+' : ''}
                  {entry.availableDelta} (balance {entry.availableBalance}) ·
                  Reserved: {entry.reservedDelta > 0 ? '+' : ''}
                  {entry.reservedDelta} (balance {entry.reservedBalance})
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No ledger entries for this outcome.</p>
        )}
      </div>
    )
  return (
    <div className="evidence-data">
      <p>Case {data.caseId}</p>
      {data.operationId && <p>Operation: {data.operationId}</p>}
      {data.targetUserId && <p>Target: {data.targetUserId}</p>}
      {data.result && <p>Result: {data.result}</p>}
    </div>
  )
}

export function EvidencePanel({
  caseId,
  orderId,
}: {
  caseId: string
  orderId: string
}) {
  const [snapshot, setSnapshot] = useState<Timeline>()
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [restartRequired, setRestartRequired] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(Symbol())
  const busy = useRef(false)
  const loaded = useRef<Timeline | undefined>(undefined)
  const knownRecords = useRef<EvidenceRecord[]>([])
  const cursors = useRef(new Set<string>())
  const focused = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let active = true
    const currentGeneration = Symbol()
    generation.current = currentGeneration
    loaded.current = undefined
    knownRecords.current = []
    cursors.current.clear()
    async function firstPage() {
      busy.current = true
      setLoading(true)
      const abort = new AbortController()
      controller.current = abort
      const timeout = window.setTimeout(() => abort.abort(), 8000)
      try {
        const data = await request<Timeline>(
          `cases/${caseId}/timeline?limit=20`,
          abort.signal,
        )
        if (!active || generation.current !== currentGeneration) return
        if (
          data.caseId !== caseId ||
          data.orderId !== orderId ||
          !data.coverage ||
          !Array.isArray(data.records) ||
          !Array.isArray(data.participants)
        )
          throw new Error('Mismatched evidence')
        loaded.current = data
        knownRecords.current = data.records
        setSnapshot(data)
        setRecords(data.records)
      } catch (e) {
        if (active) setError(failure(e))
      } finally {
        clearTimeout(timeout)
        if (active) {
          busy.current = false
          setLoading(false)
        }
      }
    }
    void firstPage()
    return () => {
      active = false
      generation.current = Symbol()
      controller.current?.abort()
      busy.current = false
    }
  }, [caseId, orderId, attempt])

  async function more() {
    const previous = loaded.current
    if (busy.current || !previous?.nextCursor || restartRequired) return
    busy.current = true
    setLoading(true)
    setError('')
    const requestGeneration = generation.current
    const abort = new AbortController()
    controller.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 8000)
    try {
      const cursor = previous.nextCursor
      const data = await request<Timeline>(
        `cases/${caseId}/timeline?limit=20&cursor=${encodeURIComponent(cursor)}`,
        abort.signal,
      )
      if (generation.current !== requestGeneration) return
      if (
        data.caseId !== caseId ||
        data.orderId !== orderId ||
        data.evidenceRevision !== previous.evidenceRevision ||
        JSON.stringify(data.order) !== JSON.stringify(previous.order) ||
        JSON.stringify(data.participants) !==
          JSON.stringify(previous.participants) ||
        JSON.stringify(data.coverage) !== JSON.stringify(previous.coverage) ||
        (data.nextCursor &&
          (data.nextCursor === cursor || cursors.current.has(data.nextCursor)))
      ) {
        throw new CaseError(409, 'Changed snapshot')
      }
      const existing = new Map(
        knownRecords.current.map((record) => [record.eventId, record]),
      )
      const additions: EvidenceRecord[] = []
      for (const record of data.records) {
        const duplicate = existing.get(record.eventId)
        if (duplicate) {
          if (JSON.stringify(duplicate) !== JSON.stringify(record))
            throw new CaseError(409, 'Conflicting evidence')
          continue
        }
        const last = additions.at(-1) || knownRecords.current.at(-1)
        if (last && compare(last, record) > 0)
          throw new CaseError(409, 'Unordered evidence')
        additions.push(record)
        existing.set(record.eventId, record)
      }
      if (!additions.length && data.nextCursor)
        throw new CaseError(409, 'Non-progressing evidence')
      cursors.current.add(cursor)
      loaded.current = data
      knownRecords.current = [...knownRecords.current, ...additions]
      setRecords(knownRecords.current)
      setSnapshot(data)
    } catch (e) {
      if (generation.current !== requestGeneration) return
      setError(failure(e))
      if (e instanceof CaseError && e.status === 409) setRestartRequired(true)
      if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
        setSnapshot(undefined)
        setRecords([])
        loaded.current = undefined
      }
    } finally {
      clearTimeout(timeout)
      if (generation.current === requestGeneration) {
        busy.current = false
        setLoading(false)
      }
    }
  }
  function restart() {
    controller.current?.abort()
    generation.current = Symbol()
    setSnapshot(undefined)
    setRecords([])
    setError('')
    setRestartRequired(false)
    setAttempt((n) => n + 1)
    focused.current?.focus()
  }
  const trustworthy =
    snapshot && !error && !restartRequired && complete(snapshot)
  return (
    <section
      className="case-panel evidence-panel"
      aria-labelledby="evidence-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Case evidence</p>
          <h2 id="evidence-title" ref={focused} tabIndex={-1}>
            Timeline and participants
          </h2>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={restart}
        >
          Refresh evidence
        </button>
      </div>
      <p>
        Evidence is supplied by Chat from producer history. Its coverage is
        separate from the number of records loaded.
      </p>
      {loading && (
        <p role="status">
          {snapshot ? 'Loading more evidence…' : 'Loading evidence…'}
        </p>
      )}
      {error && (
        <div role="alert" className="evidence-notice evidence-warning">
          <h3>
            Evidence {restartRequired ? 'snapshot changed' : 'unavailable'}
          </h3>
          <p>{error}</p>
          {snapshot && (
            <p>
              Previously loaded records are shown below for reference. They are
              not a verified current view.
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={snapshot && !restartRequired ? () => void more() : restart}
          >
            {snapshot && !restartRequired
              ? 'Retry evidence page'
              : 'Restart timeline'}
          </button>
        </div>
      )}
      {snapshot && (
        <>
          <section
            className={
              'evidence-notice ' +
              (trustworthy ? 'evidence-complete' : 'evidence-warning')
            }
            aria-labelledby="coverage-title"
          >
            <h3 id="coverage-title">
              {trustworthy
                ? 'Complete through the displayed checkpoints'
                : error || restartRequired
                  ? 'Coverage cannot currently be verified'
                  : snapshot.coverage.status === 'UNKNOWN'
                    ? 'Coverage unknown'
                    : 'Evidence is incomplete'}
            </h3>
            <p>
              {trustworthy
                ? 'This confirms coverage only through those producer checkpoints. It does not mean the evidence is current forever.'
                : 'Missing or unverified evidence must not be treated as a complete case history.'}
            </p>
            <p>
              Coverage checked {date(snapshot.coverage.asOf)} · Snapshot
              revision {snapshot.evidenceRevision}
            </p>
          </section>
          <section className="evidence-section">
            <h3>Errand snapshot</h3>
            <h4>{snapshot.order.title}</h4>
            <p className="statement-text">{snapshot.order.description}</p>
            <dl className="case-facts">
              <div>
                <dt>State</dt>
                <dd>{snapshot.order.status.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Reward</dt>
                <dd>{snapshot.order.creditReward} credits</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>
                  {snapshot.order.pickupLocationName ||
                    'Historical location name unavailable'}
                </dd>
              </div>
              <div>
                <dt>Drop-off</dt>
                <dd>
                  {snapshot.order.dropoffLocationName ||
                    'Historical location name unavailable'}
                </dd>
              </div>
              <div>
                <dt>Pickup deadline</dt>
                <dd>{date(snapshot.order.pickupDeadline)}</dd>
              </div>
            </dl>
          </section>
          <section className="evidence-section">
            <h3>Historical participants</h3>
            {snapshot.participants.length ? (
              <ul className="evidence-participants">
                {snapshot.participants.map((p, index) => (
                  <li key={`${p.userId}:${p.assignedAt}:${index}`}>
                    <span className="role-chip">
                      {p.relationship === 'REQUESTER'
                        ? 'Requester'
                        : 'Historical courier'}
                    </span>
                    <strong>{p.userId}</strong>
                    {p.relationship === 'HISTORICAL_COURIER' && (
                      <span>
                        {p.assignedAt
                          ? 'Assigned ' + date(p.assignedAt)
                          : 'Assignment start unavailable'}{' '}
                        ·{' '}
                        {p.unassignedAt
                          ? 'Unassigned ' + date(p.unassignedAt)
                          : 'No end recorded in this snapshot'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No participants supplied in this snapshot. This does not prove
                that no historical participants exist.
              </p>
            )}
          </section>
          <details
            className="evidence-section"
            open={snapshot.coverage.status !== 'COMPLETE'}
          >
            <summary>
              Coverage checkpoints ({snapshot.coverage.checkpoints.length})
            </summary>
            {snapshot.coverage.checkpoints.length ? (
              <div className="evidence-table-scroll">
                <table>
                  <caption className="visually-hidden">
                    Producer committed sequences and Chat projection progress
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Source / stream</th>
                      <th scope="col">Aggregate</th>
                      <th scope="col">Committed</th>
                      <th scope="col">Projected</th>
                      <th scope="col">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.coverage.checkpoints.map((cp) => (
                      <tr key={`${cp.source}:${cp.stream}:${cp.aggregateId}`}>
                        <th scope="row">
                          {cp.source}
                          <small>{cp.stream}</small>
                        </th>
                        <td>{cp.aggregateId}</td>
                        <td>{cp.committedSequence}</td>
                        <td>
                          {cp.projectedSequence}
                          {cp.projectedSequence < cp.committedSequence && (
                            <span> · Behind</span>
                          )}
                        </td>
                        <td>{date(cp.checkedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No producer checkpoints available. Completeness cannot be
                established.
              </p>
            )}
          </details>
          <section className="evidence-section">
            <h3>Known gaps ({snapshot.coverage.blockingGaps.length})</h3>
            {snapshot.coverage.blockingGaps.length ? (
              <ul className="evidence-gaps">
                {snapshot.coverage.blockingGaps.map((gap, index) => (
                  <li key={index}>
                    <strong>{gap.reason.replaceAll('_', ' ')}</strong>
                    <p>
                      {gap.source} / {gap.stream} · Sequences {gap.fromSequence}
                      –{gap.toSequence}
                    </p>
                    <p>Aggregate {gap.aggregateId}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No blocking gaps reported in this snapshot. This alone does not
                establish complete coverage.
              </p>
            )}
          </section>
          <section className="evidence-section">
            <div className="section-heading">
              <h3>Evidence records</h3>
              <span>{records.length} loaded</span>
            </div>
            {records.length ? (
              <ol className="evidence-records">
                {records.map((record) => (
                  <li key={record.eventId}>
                    <article>
                      <div className="section-heading">
                        <h4>{record.action.replaceAll('_', ' ')}</h4>
                        <span className="role-chip">{record.data.kind}</span>
                      </div>
                      <p>
                        {record.source} / {record.stream} · Sequence{' '}
                        {record.sourceSequence}
                      </p>
                      <p>
                        Occurred {date(record.occurredAt)} · Ingested{' '}
                        {date(record.ingestedAt)}
                      </p>
                      <p>Actor: {record.actorUserId || 'Not recorded'}</p>
                      <EvidenceData record={record} />
                      <details>
                        <summary>Record identity</summary>
                        <p>{record.eventId}</p>
                      </details>
                    </article>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                No evidence records on this page. An empty result is not proof
                of complete history.
              </p>
            )}
            {snapshot.nextCursor ? (
              <button
                disabled={loading || restartRequired || !!error}
                type="button"
                onClick={() => void more()}
              >
                Load more evidence
              </button>
            ) : (
              <p>
                End of this snapshot. Coverage is determined by the checkpoints
                and gaps above.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  )
}
