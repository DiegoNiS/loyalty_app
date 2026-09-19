'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QRScannerModal from '@/components/QRScannerModal'

export default function AdminPanel() {
  const [targetUserId, setTargetUserId] = useState('')
  const [eventTypeCode, setEventTypeCode] = useState<'regular_tasting' | 'special_event'>('regular_tasting')
  const [loading, setLoading] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function processAttendance(userIdRaw: string) {
    setStatusMsg(null)
    let userId = userIdRaw.trim()

    // Extraer userId si el contenido del QR escaneado es un objeto JSON
    if (userId.startsWith('{')) {
      try {
        const parsed = JSON.parse(userId)
        if (parsed.userId) {
          userId = parsed.userId
        }
      } catch {
        // mantener como string si no es JSON
      }
    }

    if (!userId) {
      setStatusMsg({ type: 'error', text: 'Por favor ingresa un ID válido o escanea el código QR.' })
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
        text: `¡Asistencia registrada! Puntos: +${result.pointsAwarded}. Nueva racha: ${result.newStreak} 🔥`,
      })
      setTargetUserId('')
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error al procesar asistencia.' })
    } finally {
      setLoading(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    processAttendance(targetUserId)
  }

  function handleScanSuccess(decodedText: string) {
    setTargetUserId(decodedText)
    processAttendance(decodedText)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 pb-20">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header Admin en Móvil */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-amber-500/20 p-4 rounded-2xl backdrop-blur-md shadow-lg">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Panel de Atención (Zahir)
            </span>
            <h1 className="text-lg font-bold text-slate-100">Vinos del Corazón</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Salir
          </button>
        </div>

        {/* Botón Principal para Escanear Cámara de Celular */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl text-center">
          <div>
            <h2 className="text-base font-bold text-slate-100">Escáner de Cámara Móvil</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Escanea directamente el código QR desde la pantalla del celular del cliente.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white font-extrabold text-sm rounded-2xl shadow-xl transition flex items-center justify-center space-x-2"
          >
            <span className="text-xl">📷</span>
            <span>Abrir Cámara y Escanear QR</span>
          </button>
        </div>

        {/* Formulario alternativo manual / pegar ID */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              O bien: Ingreso Manual de ID
            </h3>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-medium text-center ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/90 border border-emerald-800 text-emerald-200'
                  : 'bg-red-950/90 border border-red-800 text-red-200'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Tipo de Evento
              </label>
              <select
                value={eventTypeCode}
                onChange={(e) => setEventTypeCode(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-100 text-xs transition"
              >
                <option value="regular_tasting">Cata Regular (Estándar)</option>
                <option value="special_event">Evento Especial (Llamada al Poder)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                ID o Payload del QR
              </label>
              <input
                type="text"
                placeholder="Ej. 123e4567-e89b-12d3-a456-426614174000..."
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-100 text-xs font-mono transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Registrar Manualmente'}
            </button>
          </form>
        </div>
      </div>

      {/* Modal del Escáner de Cámara Trasera */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  )
}
