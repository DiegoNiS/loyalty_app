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
  const [brightnessMax, setBrightnessMax] = useState(false)
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
          <p className="text-sm text-slate-400">Cargando tu tarjeta de cliente...</p>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 pb-20">
      <div className="max-w-md mx-auto space-y-5">
        {/* Header Móvil Optimizado */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-4 rounded-2xl backdrop-blur-md sticky top-2 z-10 shadow-lg">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
              Vinos del Corazón
            </span>
            <h1 className="text-lg font-bold text-slate-100 truncate">@{stats.username}</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Salir
          </button>
        </div>

        {/* Tarjetas de Puntos y Racha (Optimizado Móvil) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Puntos Totales */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-red-900/40 p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-md">
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-red-600/15 rounded-full blur-xl pointer-events-none"></div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mis Puntos</span>
              <div className="text-3xl font-black text-red-500 mt-1">
                {stats.points}
              </div>
            </div>
            {stats.emailEduVerified && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-medium rounded-full w-max">
                🎓 .edu.pe
              </span>
            )}
          </div>

          {/* Racha Semanal */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-amber-900/40 p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-md">
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-600/15 rounded-full blur-xl pointer-events-none"></div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Racha Semanal</span>
              <div className="text-3xl font-black text-amber-400 mt-1 flex items-center space-x-1">
                <span>🔥</span>
                <span>{stats.currentStreak}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 truncate">
              {stats.lastAttendanceDate
                ? `Última: ${stats.lastAttendanceDate}`
                : '¡Empieza tu racha!'}
            </p>
          </div>
        </div>

        {/* SECCIÓN DEL CÓDIGO QR MÓVIL (Tarjeta de Presentación) */}
        <div
          className={`bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center space-y-4 shadow-2xl transition duration-300 ${
            brightnessMax ? 'bg-white text-slate-950 border-amber-500 ring-4 ring-amber-500/30' : ''
          }`}
        >
          <div>
            <h2 className={`text-base font-bold ${brightnessMax ? 'text-slate-950' : 'text-slate-100'}`}>
              Tarjeta Digital de Cliente
            </h2>
            <p className={`text-xs ${brightnessMax ? 'text-slate-600' : 'text-slate-400'} mt-0.5`}>
              Muestra este código QR a Zahir para registrar tu visita
            </p>
          </div>

          {/* Contenedor QR blanco para máximo contraste de escaneo en celular */}
          <div className="inline-block p-4 bg-white rounded-2xl shadow-md my-1 border border-slate-200">
            <QRCodeSVG value={stats.qrPayload} size={200} level="H" includeMargin={true} />
          </div>

          <div className="flex items-center justify-center space-x-2 pt-1">
            <button
              onClick={() => setBrightnessMax(!brightnessMax)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1 ${
                brightnessMax
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>💡</span>
              <span>{brightnessMax ? 'Modo Normal' : 'Modo Contraste (Para Escanear)'}</span>
            </button>
          </div>
        </div>

        {/* Sección de Referidos e Invitación por Whatsapp/Copiar */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Invita Amigos a la Vinería</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ganas <strong className="text-amber-400">+20 puntos</strong> por registro y <strong className="text-amber-400">+30 puntos</strong> cuando asisten.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                {stats.inviteCode}
              </span>
              <button
                onClick={copyInviteLink}
                className="px-3 py-1.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-semibold rounded-lg transition"
              >
                {copied ? '¡Copiado!' : 'Copiar Enlace'}
              </button>
            </div>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `¡Te invito a Vinos del Corazón! Regístrate con mi código ${stats.inviteCode} y acumula puntos en tus visitas: ${typeof window !== 'undefined' ? window.location.origin : ''}/register?code=${stats.inviteCode}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition shadow-md"
            >
              <span>💬</span>
              <span>Compartir en WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
