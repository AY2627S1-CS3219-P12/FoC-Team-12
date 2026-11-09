import { render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { saveSession } from '../auth/session'
import { NotificationShell } from './NotificationShell'

vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }))

afterEach(() => sessionStorage.clear())

it('omits participant destinations from the header in Admin mode', () => {
  saveSession({
    accessToken: 'admin-token',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    userId: 'admin-id',
    username: 'Admin',
    role: 'ADMIN',
    availableRoles: ['REQUESTER', 'ADMIN'],
  })

  render(<NotificationShell>Notifications</NotificationShell>)

  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getAllByRole('link').map((link) => link.textContent))
    .toEqual(['Home', 'Suppliers', 'Admin'])
  expect(within(nav).queryByRole('link', { name: 'Errands' })).not.toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument()
})
