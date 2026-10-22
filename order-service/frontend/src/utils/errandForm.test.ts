import { describe, expect, it } from 'vitest'
import { creditCheck, reservationOutcome } from './errandForm'

describe('creditCheck', () => {
  it('allows posting when the reward fits, including exactly equal', () => {
    expect(creditCheck({ kind: 'loaded', available: 10 }, 3)).toEqual({
      canPost: true,
      message: null,
    })
    expect(creditCheck({ kind: 'loaded', available: 10 }, 10).canPost).toBe(
      true,
    )
  })

  it('blocks a reward above the available credits and says the limit', () => {
    expect(creditCheck({ kind: 'loaded', available: 10 }, 11)).toEqual({
      canPost: false,
      message: 'You have 10 credits available. Lower the reward to 10 or less.',
    })
    expect(creditCheck({ kind: 'loaded', available: 1 }, 2).message).toBe(
      'You have 1 credit available. Lower the reward to 1 or less.',
    )
  })

  it('does not block before a reward is entered', () => {
    expect(creditCheck({ kind: 'loaded', available: 0 }, null).canPost).toBe(
      true,
    )
  })

  it('blocks until the balance is confirmed', () => {
    expect(creditCheck({ kind: 'loading' }, 3).canPost).toBe(false)
    expect(creditCheck({ kind: 'no-account' }, 3).canPost).toBe(false)
  })

  it('blocks when Credit is unavailable', () => {
    const result = creditCheck({ kind: 'unavailable' }, 3)
    expect(result.canPost).toBe(false)
    expect(result.message).toContain('posting is paused')
  })
})

describe('reservationOutcome', () => {
  it('keeps waiting while the errand is pending credit and opens otherwise', () => {
    expect(reservationOutcome('PENDING_CREDIT', null, 3)).toEqual({ kind: 'waiting' })
    expect(reservationOutcome('OPEN', null, 3)).toEqual({ kind: 'reserved' })
  })

  it('explains each rejection reason', () => {
    expect(reservationOutcome('RESERVATION_FAILED', 'INSUFFICIENT_CREDITS', 1)).toMatchObject({
      kind: 'failed',
      message: 'Not enough credits to reserve 1 credit. Lower the reward and post again.',
      setUpCredits: false,
    })
    expect(
      reservationOutcome('RESERVATION_FAILED', 'CREDIT_ACCOUNT_NOT_FOUND', 3),
    ).toMatchObject({ kind: 'failed', setUpCredits: true })
    expect(
      reservationOutcome('RESERVATION_FAILED', 'CREDIT_RESERVATION_REJECTED', 3),
    ).toMatchObject({ kind: 'failed', message: expect.stringContaining('Please try again') })
  })

  it('reports a deadline that passed while waiting', () => {
    expect(reservationOutcome('EXPIRED', 'PICKUP_DEADLINE_PASSED', 3)).toMatchObject({
      kind: 'failed',
      message: expect.stringContaining('pickup time passed'),
    })
  })
})
