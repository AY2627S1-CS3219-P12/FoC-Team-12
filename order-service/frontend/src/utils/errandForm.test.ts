import { describe, expect, it } from 'vitest'
import { creditCheck } from './errandForm'

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
