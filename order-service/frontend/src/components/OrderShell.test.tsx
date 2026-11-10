import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { COURIER_ID, REQUESTER_ID, signIn } from '../test/fixtures'
import { ErrandTabs } from './ErrandTabs'
import { OrderShell } from './OrderShell'

describe('OrderShell', () => {
  afterEach(() => sessionStorage.clear())
  it('shows only administrator destinations in Admin mode', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    const session = JSON.parse(sessionStorage.getItem('foc.user-session')!)
    session.role = 'ADMIN'
    sessionStorage.setItem('foc.user-session', JSON.stringify(session))
    render(<OrderShell>content</OrderShell>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Home', 'Suppliers', 'Admin'])
    expect(within(nav).queryByRole('link', { name: 'Errands' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument()
  })

  it('uses the same main navigation as the User, Supplier and Credit headers, plus Errands', () => {
    signIn(REQUESTER_ID, 'REQUESTER')
    render(<OrderShell>content</OrderShell>)

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Errands', 'Suppliers', 'Credits'])
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
    return within(screen.getByRole('navigation', { name: /Errands/i }))
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

  it('shows route-backed open and past tabs to a courier', () => {
    signIn(COURIER_ID, 'COURIER')
    const nav = tabs('/errands/browse')

    expect(nav.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Open requests', '/errands/browse'],
      ['Past errands', '/errands/mine'],
    ])
    expect(nav.getByRole('link', { name: 'Open requests' })).toHaveAttribute('aria-current', 'page')
  })
})
