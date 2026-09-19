'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminPanel() {
  const [targetUserId, setTargetUserId] = useState('')
  const [eventTypeCode, setEventTypeCode] = useState<'regular_tasting' | 'special_event'>('regular_tasting')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleMarkAttendance(e: React.FormEvent) {
    e.preventDefault()
    setStatusMsg(null)

    let userId = targetUserId.trim()

    // Si el texto pegado/escaneado es un objeto JSON (QR payload), extraer el userId
    if (userId.startsWith('{')) {
      try {
        const parsed = JSON.parse(userId)
        if (parsed.userId) {
          userId = parsed.userId
        }
      } catch {
        // mantener como está si no es JSON válido
      }
    }

    if (!userId) {
      setStatusMsg({ type: 'error', text: 'Por favor ingresa un ID de usuario o escanea el QR.' })
      return
    }

    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mark-attendance`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUserId: userId,
            eventTypeCode,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al registrar la asistencia.')
      }

      setStatusMsg({
        type: 'success',
        text: `¡Asistencia registrada con éxito! Puntos otorgados: +${result.pointsAwarded}. Nueva racha: ${result.newStreak} 🔥`,
      })
      setTargetUserId('')
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error inesperado al marcar asistencia.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header Admin */}
        <div className="flex items-center justify-between bg-slate-900/80 border border-amber-500/20 p-4 rounded-2xl backdrop-blur-md shadow-lg">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Panel de Administración
            </span>
            <h1 className="text-xl font-bold text-slate-100">Vinos del Corazón (Zahir)</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* Formulario de Marcado de Asistencia */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 shadow-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-200">Registrar Asistencia Presencial</h2>
            <p className="text-xs text-slate-400 mt-1">
              Ingresa el ID del usuario o el contenido completo del código QR escaneado.
            </p>
          </div>

          {statusMsg && (
            <div
              className={`p-4 rounded-xl text-sm font-medium text-center ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200'
                  : 'bg-red-950/80 border border-red-800 text-red-200'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={handleMarkAttendance} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                ID de Cliente o Payload del QR
              </label>
              <textarea
                rows={3}
                required
                placeholder='Pega o escanea el ID de usuario (ej. 123e4567-e89b-12d3-a456-426614174000) o JSON del QR...'
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-100 text-sm font-mono transition resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Tipo de Evento
              </label>
              <select
                value={eventTypeCode}
                onChange={(e) => setEventTypeCode(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-100 text-sm transition"
              >
                <option value="regular_tasting">Cata Regular (Estándar)</option>
                <option value="special_event">Evento Especial (Llamada al Poder / Tarde de Cata)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold rounded-xl shadow-lg transition duration-200 disabled:opacity-50 text-sm"
            >
              {loading ? 'Procesando asistencia...' : 'Confirmar Asistencia (+Puntos)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
