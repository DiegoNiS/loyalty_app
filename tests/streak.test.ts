import { describe, it, expect } from 'vitest'
import { calculateStreak } from '@/lib/points/streak'

describe('calculateStreak', () => {
  it('should return streak = 1 when lastAttendanceDate is null (first attendance)', () => {
    const result = calculateStreak({
      lastAttendanceDate: null,
      currentAttendanceDate: '2026-09-19',
      currentStreak: 0,
    })

    expect(result).toEqual({
      newStreak: 1,
      isConsecutive: true,
      isSameDay: false,
    })
  })

  it('should maintain streak when attendance is marked on the same day', () => {
    const result = calculateStreak({
      lastAttendanceDate: '2026-09-19',
      currentAttendanceDate: '2026-09-19',
      currentStreak: 3,
    })

    expect(result).toEqual({
      newStreak: 3,
      isConsecutive: true,
      isSameDay: true,
    })
  })

  it('should increment streak when attendance is within 7 days', () => {
    // Caso 1: Al día siguiente (diferencia 1 día)
    const resultNextDay = calculateStreak({
      lastAttendanceDate: '2026-09-18',
      currentAttendanceDate: '2026-09-19',
      currentStreak: 1,
    })
    expect(resultNextDay.newStreak).toBe(2)
    expect(resultNextDay.isConsecutive).toBe(true)

    // Caso 2: Exactamente a los 7 días (diferencia 7 días)
    const resultSevenDays = calculateStreak({
      lastAttendanceDate: '2026-09-12',
      currentAttendanceDate: '2026-09-19',
      currentStreak: 4,
    })
    expect(resultSevenDays.newStreak).toBe(5)
    expect(resultSevenDays.isConsecutive).toBe(true)
  })

  it('should reset streak to 1 if more than 7 days have passed', () => {
    // Ejemplo: Hace 8 días (diferencia > 7 días)
    const result = calculateStreak({
      lastAttendanceDate: '2026-09-10',
      currentAttendanceDate: '2026-09-19',
      currentStreak: 5,
    })

    expect(result).toEqual({
      newStreak: 1,
      isConsecutive: false,
      isSameDay: false,
    })
  })
})
