import { readSession } from './auth/session'
import { CaseError, isUuid } from './cases'

export type Conversation = {
  conversationId: string
  caseId: string
  orderId: string
  participantUserId: string
  readOnly: boolean
}
export type ChatMessage = {
  id: string
  conversationId: string
  senderUserId: string
  sequence: number
  createdAt: string
  text: string | null
  attachment: {
    attachmentId: string
    mediaType: string
    sizeBytes: number
  } | null
}
export type MessagePage = { content: ChatMessage[]; nextCursor: string | null }

export async function chatRequest(
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  const session = readSession()
  if (!session)
    throw new CaseError(401, 'Sign in again to read this conversation.')
  const response = await fetch('/api/chat/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new CaseError(response.status, 'Chat request failed')
  return response.json()
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Chat response')
}
export function conversation(
  value: unknown,
  expected: Conversation,
): Conversation {
  object(value)
  for (const field of [
    'conversationId',
    'caseId',
    'orderId',
    'participantUserId',
  ] as const) {
    if (
      typeof value[field] !== 'string' ||
      !isUuid(value[field]) ||
      value[field] !== expected[field]
    )
      throw new Error('Mismatched conversation')
  }
  if (typeof value.readOnly !== 'boolean')
    throw new Error('Missing conversation permission')
  return {
    conversationId: expected.conversationId,
    caseId: expected.caseId,
    orderId: expected.orderId,
    participantUserId: expected.participantUserId,
    readOnly: value.readOnly,
  }
}
export function chatMessage(value: unknown, id: string): ChatMessage {
  object(value)
  if (
    typeof value.id !== 'string' ||
    !isUuid(value.id) ||
    value.conversationId !== id ||
    typeof value.senderUserId !== 'string' ||
    !isUuid(value.senderUserId) ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error('Invalid message identity')
  if (
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    value.text.length <= 4000 &&
    value.attachment === null
  ) {
    return {
      id: value.id,
      conversationId: id,
      senderUserId: value.senderUserId,
      sequence: Number(value.sequence),
      createdAt: value.createdAt,
      text: value.text,
      attachment: null,
    }
  }
  object(value.attachment)
  const a = value.attachment
  if (
    value.text !== null ||
    typeof a.attachmentId !== 'string' ||
    !isUuid(a.attachmentId) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(String(a.mediaType)) ||
    !Number.isSafeInteger(a.sizeBytes) ||
    Number(a.sizeBytes) < 1 ||
    Number(a.sizeBytes) > 5242880
  )
    throw new Error('Invalid attachment')
  return {
    id: value.id,
    conversationId: id,
    senderUserId: value.senderUserId,
    sequence: Number(value.sequence),
    createdAt: value.createdAt,
    text: null,
    attachment: {
      attachmentId: a.attachmentId,
      mediaType: String(a.mediaType),
      sizeBytes: Number(a.sizeBytes),
    },
  }
}
export function messagePage(value: unknown, id: string): MessagePage {
  object(value)
  if (
    !Array.isArray(value.content) ||
    value.content.length > 20 ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === 'string' &&
        value.nextCursor.length > 0 &&
        value.nextCursor.length <= 2000)
    )
  )
    throw new Error('Invalid history page')
  return {
    content: mergeMessages(
      [],
      value.content.map((m) => chatMessage(m, id)),
    ),
    nextCursor: value.nextCursor,
  }
}
export function mergeMessages(known: ChatMessage[], additions: ChatMessage[]) {
  const merged = [...known]
  for (const message of additions) {
    const duplicate = merged.find((m) => m.id === message.id)
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(message))
        throw new Error('Conflicting message')
      continue
    }
    if (
      merged.length &&
      merged[merged.length - 1]!.sequence >= message.sequence
    )
      throw new Error('Conflicting message order')
    merged.push(message)
  }
  return merged
}
export function chatFailure(error: unknown) {
  if (error instanceof CaseError) {
    if (error.status === 401)
      return 'Your session expired. Sign in again to view the conversation.'
    if ([403, 404].includes(error.status))
      return 'This private conversation is unavailable to your account. Refresh case access.'
    if (error.status === 409)
      return 'The conversation is read-only or the request conflicts. Refresh the conversation before continuing.'
  }
  return 'Messaging is unavailable. Retry when Chat is available; no delivery is assumed.'
}
