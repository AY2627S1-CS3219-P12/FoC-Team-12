import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ChatMessage } from '../api/chatApi'
import { MessageBubble } from './ChatPage'

describe('chat lifecycle activity', () => {
  test('renders a lifecycle event as a timestamped system entry instead of a participant bubble', () => {
    const message: ChatMessage = {
      id: '10000000-0000-4000-8000-000000000001',
      conversationId: '20000000-0000-4000-8000-000000000001',
      senderUserId: null,
      sequence: 1,
      clientMessageId: null,
      messageType: 'SYSTEM',
      originalLanguage: null,
      quickReplyKey: null,
      text: 'Courier marked the errand as picked up.',
      attachment: null,
      sourceEventId: '30000000-0000-4000-8000-000000000001',
      sourceSequence: 4,
      lifecycleAction: 'PICK_UP',
      lifecycleFromState: 'ACCEPTED',
      lifecycleToState: 'PICKED_UP',
      createdAt: '2026-11-08T04:30:00Z',
    }

    const { container } = render(<MessageBubble message={message} mine={false} />)

    expect(screen.getByText('Courier marked the errand as picked up.')).toBeInTheDocument()
    expect(container.querySelector('.system-message')).toBeInTheDocument()
    expect(container.querySelector('.message-author')).not.toBeInTheDocument()
    expect(screen.getByText(/2026/).closest('time')).toHaveAttribute('datetime', message.createdAt)
  })
})
