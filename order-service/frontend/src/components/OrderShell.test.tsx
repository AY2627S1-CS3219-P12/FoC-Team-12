import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { COURIER_ID, REQUESTER_ID, signIn } from '../test/fixtures'
import { ErrandTabs } from './ErrandTabs'
import { OrderShell } from './OrderShell'

describe('OrderShell', () => {
  afterEach(() => sessionStorage.clear())
  it('provides an Admin dashboard tab in Admin mode', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    const session = JSON.parse(sessionStorage.getItem('foc.user-session')!)
    session.role = 'ADMIN'
    sessionStorage.setItem('foc.user-session', JSON.stringify(session))
    render(<OrderShell>content</OrderShell>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(within(nav).getByRole('link', { name: 'Errands' })).toHaveAttribute('aria-current', 'page')
  })

  it('uses the same main navigation as the User, Supplier and Credit headers, plus Errands', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    render(<OrderShell>content</OrderShell>)

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Profile', 'Suppliers', 'Credits', 'Errands'])
    expect(within(nav).getByRole('link', { name: 'Errands' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('ErrandTabs', () => {
  afterEach(() => sessionStorage.clear())

  const tabs = (path: string) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ErrandTabs />
      </MemoryRouter>,
    )
    return within(screen.getByRole('navigation', { name: 'Errands' }))
  }

  it('shows Request help and My errands to a requester, marking the current one', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    const nav = tabs('/errands/mine')

    expect(nav.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Request help', '/errands/new'],
      ['My errands', '/errands/mine'],
    ])
    expect(nav.getByRole('link', { name: 'My errands' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Request help' })).not.toHaveAttribute('aria-current')
  })

  it('shows Run errands and My errands to a courier', () => {
    signIn(COURIER_ID, 'COURIER')
    const nav = tabs('/errands/browse')

    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Run errands', 'My errands'])
    expect(nav.getByRole('link', { name: 'Run errands' })).toHaveAttribute('aria-current', 'page')
  })
})
