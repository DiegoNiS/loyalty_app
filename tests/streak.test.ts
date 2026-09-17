import { describe, it, expect } from 'vitest'
import { calculateStreak } from '@/lib/points/streak'

describe('calculateStreak contract placeholder', () => {
  it('should define the contract for streak calculation', () => {
    // Verificamos que la función esté expuesta
    expect(typeof calculateStreak).toBe('function')
  })

  it.todo('should return streak = 1 when lastAttendanceDate is null', () => {
    // Placeholder para la siguiente sesión:
    // const result = calculateStreak({
    //   lastAttendanceDate: null,
    //   currentAttendanceDate: '2026-09-17',
    //   currentStreak: 0,
    // })
    // expect(result.newStreak).toBe(1)
  })

  it.todo('should increment streak if current attendance is within 7 days', () => {
    // Placeholder para la siguiente sesión:
    // const result = calculateStreak({
    //   lastAttendanceDate: '2026-09-10',
    //   currentAttendanceDate: '2026-09-17',
    //   currentStreak: 2,
    // })
    // expect(result.newStreak).toBe(3)
  })

  it.todo('should reset streak to 1 if more than 7 days have passed', () => {
    // Placeholder para la siguiente sesión:
    // const result = calculateStreak({
    //   lastAttendanceDate: '2026-09-01',
    //   currentAttendanceDate: '2026-09-17',
    //   currentStreak: 5,
    // })
    // expect(result.newStreak).toBe(1)
  })
})
