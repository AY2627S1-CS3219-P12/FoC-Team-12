import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  CaseConversations,
  ParticipantConversationStatus,
} from './CaseConversations'
import { ConversationThread } from './ConversationThread'
import { saveSession } from './auth/session'
import { conversation, messagePage, type Conversation } from './conversations'
import type { Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001',
  participant = '20000000-0000-4000-8000-000000000001',
  caseId = '30000000-0000-4000-8000-000000000001',
  orderId = '40000000-0000-4000-8000-000000000001',
  conversationId = '50000000-0000-4000-8000-000000000001',
  secondId = '60000000-0000-4000-8000-000000000001'
const reference: Conversation = {
  conversationId,
  caseId,
  orderId,
  participantUserId: participant,
  readOnly: false,
}
const summary: Summary = {
  caseId,
  orderId,
  reviewerId: actor,
  state: 'UNDER_REVIEW',
  revision: 2,
  createdAt: '2026-10-29T10:00:00Z',
}
function response(value: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => value }
}
function message(
  id = caseId,
  sequence = 1,
  text = 'Hello from the participant',
) {
  return {
    id,
    sequence,
    conversationId,
    senderUserId: participant,
    createdAt: '2026-10-29T10:00:00Z',
    text,
    attachment: null,
  }
}
function thread(props: Partial<Parameters<typeof ConversationThread>[0]> = {}) {
  return (
    <ConversationThread
      reference={reference}
      actorId={actor}
      reviewerId={actor}
      writable={true}
      {...props}
    />
  )
}
beforeEach(() => {
  sessionStorage.clear()
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('gates other administrators and participant discovery without inventing lookup', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(
    <>
      <CaseConversations
        summary={summary}
        actorId={participant}
        participantIds={[participant]}
      />
      <ParticipantConversationStatus summary={summary} />
    </>,
  )
  expect(
    screen.getByText(/Only the assigned reviewer can initiate/),
  ).toBeVisible()
  expect(screen.getByText(/Chat’s private conversation lookup/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Open private conversation' }),
  ).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})
it('retries initiation with the same key and isolates selected participants', async () => {
  const openings: RequestInit[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.startsWith('/api/admin/')) {
        openings.push(options)
        if (openings.length === 1) throw new TypeError('lost response')
        return response(reference)
      }
      return response(
        url.includes('/messages')
          ? { content: [message()], nextCursor: null }
          : reference,
      )
    }),
  )
  render(
    <CaseConversations
      summary={summary}
      actorId={actor}
      participantIds={[participant, secondId]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Participant 1' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Open private conversation' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Messaging is unavailable',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry opening conversation' }),
  )
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(
    (openings[0]!.headers as Record<string, string>)['Idempotency-Key'],
  ).toBe((openings[1]!.headers as Record<string, string>)['Idempotency-Key'])
  expect(openings[0]!.body).toBe(openings[1]!.body)
  fireEvent.click(screen.getByRole('button', { name: 'Participant 2' }))
  expect(
    screen.queryByText('Hello from the participant'),
  ).not.toBeInTheDocument()
})
it('retries an uncertain send with the original clientMessageId and no optimistic delivery', async () => {
  const sends: { clientMessageId: string; text: string }[] = []
  const sentMessage = {
    ...message(orderId, 2, 'Please clarify the pickup'),
    senderUserId: actor,
  }
  let accepted = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      if (options.method === 'POST') {
        sends.push(JSON.parse(String(options.body)))
        if (sends.length === 1) throw new TypeError('lost reply')
        accepted = true
        return response(sentMessage, 201)
      }
      return response(
        url.includes('/messages')
          ? {
              content: accepted ? [message(), sentMessage] : [message()],
              nextCursor: null,
            }
          : reference,
      )
    }),
  )
  render(thread())
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(screen.getByText('29 Oct 2026, 6:00:00 pm SGT')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'Please clarify the pickup' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no delivery is assumed',
  )
  expect(
    screen.queryByText('Please clarify the pickup', { selector: 'p' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry same message' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry same message' }))
  expect(await screen.findByText('Message accepted by Chat.')).toBeVisible()
  expect(sends).toHaveLength(2)
  expect(sends[0]).toEqual(sends[1])
})
it('preserves readable history and disables replies when Chat says read-only', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      response(
        url.includes('/messages')
          ? { content: [message()], nextCursor: null }
          : { ...reference, readOnly: true },
      ),
    ),
  )
  render(thread())
  expect(await screen.findByText('Hello from the participant')).toBeVisible()
  expect(screen.getByLabelText('Message')).toBeDisabled()
})
it('denies a different participant before requesting history', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(thread({ participantView: true }))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'cannot view another participant',
  )
  expect(fetcher).not.toHaveBeenCalled()
})
it('prepares replies for a participant with their own validated reference', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      response(
        url.includes('/messages')
          ? { content: [message()], nextCursor: null }
          : reference,
      ),
    ),
  )
  render(thread({ actorId: participant, participantView: true }))
  expect(await screen.findByText('You')).toBeVisible()
  expect(screen.getByLabelText('Message')).toBeEnabled()
})
it('retries the same cursor, deduplicates overlap and clears history after revocation', async () => {
  let pages = 0
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('cursor=')) {
        pages++
        if (pages === 1) return response({}, 503)
        if (pages === 3) return response({}, 403)
        return response({
          content: [message(), message(orderId, 2, 'Next message')],
          nextCursor: 'next-cursor',
        })
      }
      return response(
        url.includes('/messages')
          ? { content: [message()], nextCursor: 'opaque+/cursor' }
          : reference,
      )
    }),
  )
  render(thread())
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more messages' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Messaging is unavailable',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry message page' }))
  expect(await screen.findByText('Next message')).toBeVisible()
  expect(screen.getAllByText('Hello from the participant')).toHaveLength(1)
  expect(urls.filter((u) => u.includes('opaque%2B%2Fcursor'))).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Load more messages' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'unavailable to your account',
  )
  expect(
    screen.queryByText('Hello from the participant'),
  ).not.toBeInTheDocument()
})
it('rejects wrong-case references, wrong-thread messages and conflicting sequences', () => {
  expect(() =>
    conversation({ ...reference, caseId: orderId }, reference),
  ).toThrow()
  expect(() =>
    messagePage(
      {
        content: [{ ...message(), conversationId: secondId }],
        nextCursor: null,
      },
      conversationId,
    ),
  ).toThrow()
  expect(() =>
    messagePage(
      { content: [message(), message(orderId, 1)], nextCursor: null },
      conversationId,
    ),
  ).toThrow()
})
it('rechecks read-only access before a send and never posts after closure', async () => {
  let references = 0
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/messages'))
      return response({ content: [message()], nextCursor: null })
    references++
    return response({ ...reference, readOnly: references > 1 })
  })
  vi.stubGlobal('fetch', fetcher)
  render(thread())
  await screen.findByText('Hello from the participant')
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'A reply' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('read-only')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
