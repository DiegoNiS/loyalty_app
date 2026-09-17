/**
 * Contrato para el cálculo de la racha semanal de asistencia.
 *
 * Lógica esperada:
 * - Si lastAttendanceDate es null (primera asistencia): la nueva racha es 1.
 * - Si currentDate es el mismo día que lastAttendanceDate: la racha se mantiene igual.
 * - Si la diferencia en días entre currentDate y lastAttendanceDate es <= 7 días (asistencia dentro de la semana): la racha se incrementa en 1.
 * - Si la diferencia en días es > 7 días: la racha se resetea a 1.
 */

export interface StreakCalculationInput {
  lastAttendanceDate: string | null // Formato ISO date "YYYY-MM-DD" o null
  currentAttendanceDate: string     // Formato ISO date "YYYY-MM-DD"
  currentStreak: number
}

export interface StreakCalculationOutput {
  newStreak: number
  isConsecutive: boolean
}

export function calculateStreak(input: StreakCalculationInput): StreakCalculationOutput {
  // Función placeholder contract; la implementación completa se realizará en la siguiente sesión
  throw new Error('Not implemented yet')
}
