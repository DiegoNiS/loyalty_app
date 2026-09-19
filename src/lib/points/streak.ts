/**
 * Lógica pura para el cálculo de la racha semanal de asistencia y asignación de puntos.
 */

export interface StreakCalculationInput {
  lastAttendanceDate: string | null // Formato ISO date "YYYY-MM-DD" o ISO string
  currentAttendanceDate: string     // Formato ISO date "YYYY-MM-DD" o ISO string
  currentStreak: number
}

export interface StreakCalculationOutput {
  newStreak: number
  isConsecutive: boolean
  isSameDay: boolean
}

/**
 * Calcula la racha de asistencia respetando las siguientes reglas de negocio:
 * 1. Si no hay asistencia previa (lastAttendanceDate === null): racha = 1.
 * 2. Si es el mismo día (diferencia en días calendarios === 0): racha se mantiene igual.
 * 3. Si la diferencia es de 1 a 7 días inclusive (asistencia dentro de la semana): racha incrementa en +1.
 * 4. Si pasaron más de 7 días: racha se reinicia a 1.
 */
export function calculateStreak(input: StreakCalculationInput): StreakCalculationOutput {
  const { lastAttendanceDate, currentAttendanceDate, currentStreak } = input

  if (!lastAttendanceDate) {
    return {
      newStreak: 1,
      isConsecutive: true,
      isSameDay: false,
    }
  }

  // Parsear fechas extrayendo la parte de fecha en UTC YYYY-MM-DD
  const lastDate = new Date(lastAttendanceDate)
  const currDate = new Date(currentAttendanceDate)

  // Normalizar a UTC medianoche para calcular diferencia limpia en días
  const lastUtc = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate())
  const currUtc = Date.UTC(currDate.getUTCFullYear(), currDate.getUTCMonth(), currDate.getUTCDate())

  const diffMs = currUtc - lastUtc
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) {
    // Mismo día (o asistencia duplicada registrada el mismo día)
    return {
      newStreak: Math.max(1, currentStreak),
      isConsecutive: true,
      isSameDay: true,
    }
  }

  if (diffDays <= 7) {
    // Asistencia dentro del rango semanal de 7 días
    return {
      newStreak: currentStreak + 1,
      isConsecutive: true,
      isSameDay: false,
    }
  }

  // Si pasaron más de 7 días, se pierde la racha y vuelve a 1
  return {
    newStreak: 1,
    isConsecutive: false,
    isSameDay: false,
  }
}
