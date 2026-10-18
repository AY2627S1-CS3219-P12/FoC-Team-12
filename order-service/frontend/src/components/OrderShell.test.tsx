import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { REQUESTER_ID, signIn } from '../test/fixtures'
import { ErrandTabs } from './ErrandTabs'
import { OrderShell } from './OrderShell'

describe('OrderShell', () => {
  afterEach(() => sessionStorage.clear())

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
  it('links the three errand screens and marks the current one', () => {
    render(
      <MemoryRouter initialEntries={['/errands/mine']}>
        <ErrandTabs />
      </MemoryRouter>,
    )

    const tabs = screen.getByRole('navigation', { name: 'Errands' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/errands/new', '/errands/browse', '/errands/mine'])
    expect(
      within(tabs).getByRole('link', { name: 'My errands' }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
