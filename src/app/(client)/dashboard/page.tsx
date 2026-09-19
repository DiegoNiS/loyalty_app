'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase/client'

interface UserStats {
  userId: string
  username: string
  role: string
  points: number
  currentStreak: number
  inviteCode: string
  emailEduVerified: boolean
  lastAttendanceDate: string | null
  qrPayload: string
}

export default function ClientDashboard() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-my-stats`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        )

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Error al obtener estadísticas')
        }

        setStats(result.stats)
      } catch (err: any) {
        setErrorMsg(err.message || 'Error al cargar los datos')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [router, supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function copyInviteLink() {
    if (!stats) return
    const link = `${window.location.origin}/register?code=${stats.inviteCode}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-slate-400">Cargando tu perfil de fidelización...</p>
        </div>
      </div>
    )
  }

  if (errorMsg || !stats) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full text-center">
          <p className="text-red-400 text-sm mb-4">{errorMsg || 'No se pudo cargar la información.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header con bienvenida y cerrar sesión */}
        <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-2xl backdrop-blur-md">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">
              Vinos del Corazón
            </span>
            <h1 className="text-xl font-bold text-slate-100">¡Hola, @{stats.username}! 👋</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* Tarjetas de Puntos y Racha */}
        <div className="grid grid-cols-2 gap-4">
          {/* Puntos Accumulados */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-red-900/30 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-red-600/10 rounded-full blur-xl pointer-events-none"></div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Puntos Totales</span>
              <div className="text-3xl sm:text-4xl font-extrabold text-red-500 mt-1">
                {stats.points}
              </div>
            </div>
            {stats.emailEduVerified && (
              <span className="inline-block mt-3 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] rounded-full w-max">
                🎓 Bono .edu.pe Activo
              </span>
            )}
          </div>

          {/* Racha Semanal */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-900/30 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-lg">
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-amber-600/10 rounded-full blur-xl pointer-events-none"></div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Racha Semanal</span>
              <div className="text-3xl sm:text-4xl font-extrabold text-amber-400 mt-1 flex items-center space-x-1">
                <span>🔥</span>
                <span>{stats.currentStreak}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              {stats.lastAttendanceDate
                ? `Última visita: ${stats.lastAttendanceDate}`
                : '¡Visítanos para iniciar tu racha!'}
            </p>
          </div>
        </div>

        {/* Sección del Código QR del Cliente */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center space-y-4 shadow-xl">
          <div>
            <h2 className="text-lg font-bold text-slate-200">Tu Código QR de Cliente</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Muestra este código a Zahir en la vinería para acumular tus puntos de asistencia.
            </p>
          </div>

          <div className="inline-block p-4 bg-white rounded-2xl shadow-inner my-2">
            <QRCodeSVG value={stats.qrPayload} size={180} level="H" />
          </div>

          <div className="text-[11px] text-slate-400">
            ID de Usuario: <code className="text-slate-300 bg-slate-950 px-2 py-1 rounded">{stats.userId}</code>
          </div>
        </div>

        {/* Sección de Referidos e Invitaciones */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
          <div>
            <h2 className="text-base font-bold text-slate-200">Invita Amigos y Gana Más Puntos</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ganas +20 puntos cuando tu amigo se registra y +30 puntos cuando realiza su primera visita.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-xs font-mono font-bold text-amber-400 px-3 py-1 bg-slate-900 rounded-lg border border-amber-500/30">
              {stats.inviteCode}
            </span>
            <input
              type="text"
              readOnly
              value={typeof window !== 'undefined' ? `${window.location.origin}/register?code=${stats.inviteCode}` : ''}
              className="w-full bg-transparent text-slate-400 text-xs outline-none truncate"
            />
            <button
              onClick={copyInviteLink}
              className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-semibold rounded-lg transition shrink-0"
            >
              {copied ? '¡Copiado!' : 'Copiar Enlace'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
