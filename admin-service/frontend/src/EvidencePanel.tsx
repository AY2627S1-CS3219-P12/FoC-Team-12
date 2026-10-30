import { useEffect, useRef, useState } from 'react'
import { CaseError, request } from './cases'
import { formatSingaporeTime as date } from './time'

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

const readable = (value: string) => {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const historyName = (source: string) => {
  const names: Record<string, string> = {
    'order-service': 'Errand history',
    'credit-service': 'Credit history',
    'admin-service': 'Case history',
  }
  return Object.hasOwn(names, source) ? names[source] : 'Other history source'
}
const categoryName = {
  ORDER: 'Errand',
  CREDIT: 'Credits',
  ADMIN: 'Case review',
}
function activityTitle(record: EvidenceRecord) {
  const orderActions: Record<string, string> = {
    SUBMIT: 'Errand submitted',
    OPEN: 'Errand opened',
    FAIL_RESERVATION: 'Credit reservation failed',
    CANCEL: 'Errand cancelled',
    EXPIRE: 'Errand expired',
    ACCEPT: 'Errand accepted',
    WITHDRAW: 'Courier withdrew',
    PICK_UP: 'Errand picked up',
    DELIVER: 'Errand delivered',
    COMPLETE: 'Errand completed',
    EDIT: 'Errand details updated',
    REWARD_CHANGE_APPLIED: 'Reward change applied',
    REWARD_CHANGE_REJECTED: 'Reward change rejected',
  }
  const caseActions: Record<string, string> = {
    CaseOpened: 'Case opened',
    CaseClaimed: 'Case claimed',
    CaseActionCompleted: 'Case action completed',
    CaseResolved: 'Case resolved',
  }
  const actions =
    record.data.kind === 'ORDER'
      ? orderActions
      : record.data.kind === 'ADMIN'
        ? caseActions
        : {}
  return Object.hasOwn(actions, record.action)
    ? actions[record.action]
    : readable(record.action)
}
function participantLabels(participants: Participant[]) {
  const couriers = [
    ...new Set(
      participants
        .filter((p) => p.relationship === 'HISTORICAL_COURIER')
        .map((p) => p.userId),
    ),
  ].sort()
  return (id: string) => {
    const roles: string[] = []
    if (
      participants.some(
        (p) => p.userId === id && p.relationship === 'REQUESTER',
      )
    )
      roles.push('Requester')
    const courier = couriers.indexOf(id)
    if (courier >= 0) roles.push(`Courier ${courier + 1}`)
    return roles.join(' · ') || 'Account outside supplied participant history'
  }
}
function EvidenceTime({ value }: { value: string }) {
  return <time dateTime={value}>{date(value)}</time>
}
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
function EvidenceData({
  record,
  participant,
}: {
  record: EvidenceRecord
  participant: (id: string) => string
}) {
  const data = record.data
  if (data.kind === 'ORDER')
    return (
      <div className="evidence-data">
        <p>
          {data.fromState ? readable(data.fromState) : 'Initial state'} →{' '}
          {readable(data.toState)}
        </p>
        <p>Requester: {participant(data.requesterId)}</p>
        <p>
          Courier: {data.courierId ? participant(data.courierId) : 'Unassigned'}
          {data.previousCourierId &&
            ` · Previous courier: ${participant(data.previousCourierId)}`}
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
          Outcome: {readable(data.result)}
          {data.reasonCode && ` · ${readable(data.reasonCode)}`}
        </p>
        {data.ledgerEntries.length ? (
          <ul>
            {data.ledgerEntries.map((entry) => (
              <li key={entry.ledgerEntryId}>
                <p>{participant(entry.userId)}</p>
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
      {data.targetUserId && (
        <p>Affected account: {participant(data.targetUserId)}</p>
      )}
      {data.result && <p>Outcome: {readable(data.result)}</p>}
    </div>
  )
}

function RecordDetails({ record }: { record: EvidenceRecord }) {
  const data = record.data
  return (
    <details className="evidence-technical">
      <summary>Technical details</summary>
      <dl className="evidence-identifiers">
        <div>
          <dt>Event ID</dt>
          <dd>{record.eventId}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{record.action}</dd>
        </div>
        <div>
          <dt>Source / broker stream</dt>
          <dd>
            {record.source} / {record.stream}
          </dd>
        </div>
        <div>
          <dt>Source sequence</dt>
          <dd>{record.sourceSequence}</dd>
        </div>
        <div>
          <dt>Errand ID</dt>
          <dd>{record.orderId}</dd>
        </div>
        <div>
          <dt>Actor ID</dt>
          <dd>{record.actorUserId || 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Added to evidence</dt>
          <dd>
            <EvidenceTime value={record.ingestedAt} />
          </dd>
        </div>
        {data.kind === 'ORDER' && (
          <>
            <div>
              <dt>Requester ID</dt>
              <dd>{data.requesterId}</dd>
            </div>
            <div>
              <dt>Courier ID</dt>
              <dd>{data.courierId || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Previous courier ID</dt>
              <dd>{data.previousCourierId || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Pickup location ID</dt>
              <dd>{data.snapshot.pickupLocationId}</dd>
            </div>
            <div>
              <dt>Drop-off location ID</dt>
              <dd>{data.snapshot.dropoffLocationId}</dd>
            </div>
          </>
        )}
        {data.kind === 'ADMIN' && (
          <>
            <div>
              <dt>Case ID</dt>
              <dd>{data.caseId}</dd>
            </div>
            <div>
              <dt>Operation ID</dt>
              <dd>{data.operationId || 'Not supplied'}</dd>
            </div>
            <div>
              <dt>Target account ID</dt>
              <dd>{data.targetUserId || 'Not supplied'}</dd>
            </div>
          </>
        )}
        {data.kind === 'CREDIT' && (
          <>
            <div>
              <dt>Operation ID</dt>
              <dd>{data.operationId}</dd>
            </div>
            <div>
              <dt>Reason code</dt>
              <dd>{data.reasonCode || 'Not supplied'}</dd>
            </div>
            {data.ledgerEntries.map((entry) => (
              <div key={entry.ledgerEntryId}>
                <dt>Ledger entry / account ID</dt>
                <dd>
                  {entry.ledgerEntryId} / {entry.userId}
                </dd>
              </div>
            ))}
          </>
        )}
      </dl>
    </details>
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
  const participant = participantLabels(snapshot?.participants || [])
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
        Review errand, credit and case activity. Loading all pages does not by
        itself establish a complete history.
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
                ? 'Complete through verified coverage limits'
                : error || restartRequired
                  ? 'Coverage cannot currently be verified'
                  : snapshot.coverage.status === 'UNKNOWN'
                    ? 'Coverage unknown'
                    : 'Evidence is incomplete'}
            </h3>
            <p>
              {trustworthy
                ? 'All history is accounted for through the coverage limits supplied by each service. Newer activity may not be included. See coverage technical details for the exact limits.'
                : 'Missing or unverified evidence must not be treated as a complete case history.'}
            </p>
            <p>
              Coverage checked <EvidenceTime value={snapshot.coverage.asOf} />
            </p>
          </section>
          <section className="evidence-section">
            <h3>Errand snapshot</h3>
            <h4>{snapshot.order.title}</h4>
            <p className="statement-text">{snapshot.order.description}</p>
            <dl className="case-facts">
              <div>
                <dt>State</dt>
                <dd>{readable(snapshot.order.status)}</dd>
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
                    <strong>{participant(p.userId)}</strong>
                    {p.relationship === 'HISTORICAL_COURIER' && (
                      <span className="role-chip">Historical courier</span>
                    )}
                    {p.relationship === 'HISTORICAL_COURIER' && (
                      <span>
                        {p.assignedAt ? (
                          <>
                            Assigned <EvidenceTime value={p.assignedAt} />
                          </>
                        ) : (
                          'Assignment start unavailable'
                        )}{' '}
                        ·{' '}
                        {p.unassignedAt ? (
                          <>
                            Unassigned <EvidenceTime value={p.unassignedAt} />
                          </>
                        ) : (
                          'No end recorded in this snapshot'
                        )}
                      </span>
                    )}
                    <details className="evidence-technical">
                      <summary>Participant technical details</summary>
                      <p>Account ID: {p.userId}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No participants supplied in this snapshot. This does not prove
                that no historical participants exist.
              </p>
            )}
            <p className="evidence-meta">
              Labels identify accounts within this timeline; names are not
              supplied. A numbered courier can have more than one assignment
              period.
            </p>
          </section>
          <details className="evidence-section evidence-technical">
            <summary>Coverage technical details</summary>
            <dl className="evidence-identifiers">
              <div>
                <dt>Snapshot revision</dt>
                <dd>{snapshot.evidenceRevision}</dd>
              </div>
              <div>
                <dt>Case ID</dt>
                <dd>{snapshot.caseId}</dd>
              </div>
              <div>
                <dt>Errand ID</dt>
                <dd>{snapshot.orderId}</dd>
              </div>
              <div>
                <dt>Reported coverage status</dt>
                <dd>{snapshot.coverage.status}</dd>
              </div>
              <div>
                <dt>Pickup location ID</dt>
                <dd>{snapshot.order.pickupLocationId}</dd>
              </div>
              <div>
                <dt>Drop-off location ID</dt>
                <dd>{snapshot.order.dropoffLocationId}</dd>
              </div>
            </dl>
            <h4>
              Coverage checkpoints ({snapshot.coverage.checkpoints.length})
            </h4>
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
                    <strong>
                      {historyName(gap.source)}:{' '}
                      {gap.reason === 'MISSING_SEQUENCE'
                        ? 'Some activity is missing'
                        : readable(gap.reason)}
                    </strong>
                    <details className="evidence-technical">
                      <summary>Gap technical details</summary>
                      <p>Reason: {gap.reason}</p>
                      <p>
                        {gap.source} / {gap.stream} · Sequences{' '}
                        {gap.fromSequence}–{gap.toSequence}
                      </p>
                      <p>Aggregate ID: {gap.aggregateId}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No blocking gaps reported in this snapshot. This alone does not
                establish complete coverage.
              </p>
            )}
            {snapshot.coverage.checkpoints.some(
              (cp) => cp.projectedSequence < cp.committedSequence,
            ) && (
              <p className="evidence-lag">
                Some history is still catching up:{' '}
                {[
                  ...new Set(
                    snapshot.coverage.checkpoints
                      .filter(
                        (cp) => cp.projectedSequence < cp.committedSequence,
                      )
                      .map((cp) => historyName(cp.source)),
                  ),
                ].join(', ')}
                . Review the coverage technical details for progress.
              </p>
            )}
          </section>
          <section className="evidence-section">
            <div className="section-heading">
              <h3>Activity timeline</h3>
              <span>{records.length} loaded</span>
            </div>
            {records.length ? (
              <ol className="evidence-records">
                {records.map((record) => (
                  <li key={record.eventId}>
                    <article>
                      <div className="section-heading">
                        <h4>{activityTitle(record)}</h4>
                        <span className="role-chip">
                          {categoryName[record.data.kind]}
                        </span>
                      </div>
                      <p className="evidence-meta">
                        Occurred <EvidenceTime value={record.occurredAt} />
                      </p>
                      <p className="evidence-meta">
                        {record.actorUserId
                          ? `Recorded actor: ${participant(record.actorUserId)}`
                          : 'Actor not recorded'}
                      </p>
                      <EvidenceData record={record} participant={participant} />
                      <RecordDetails record={record} />
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
                End of this snapshot. The coverage warnings and limits above
                still apply.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  )
}
