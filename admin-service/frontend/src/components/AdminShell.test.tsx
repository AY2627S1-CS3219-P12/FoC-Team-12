import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AdminShell } from './AdminShell'

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

it('preserves the participant report destination in the header sign-in link', () => {
  window.history.replaceState(null, '', '/admin/reports/new?orderId=test-errand')
  render(<AdminShell administratorAccess={false}>Report</AdminShell>)
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/?returnTo=%2Fadmin%2Freports%2Fnew%3ForderId%3Dtest-errand',
  )
})
