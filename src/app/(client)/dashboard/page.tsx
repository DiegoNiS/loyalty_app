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

interface Reward {
  id: string
  name: string
  description: string
  points_cost: number
  stock: number | null
  is_active: boolean
}

export default function ClientDashboard() {
  const [stats, setStats] = useState<UserStats | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [redeemStatus, setRedeemStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [brightnessMax, setBrightnessMax] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        // 1. Cargar estadísticas (intentar Edge Function o fallback directo a Supabase DB)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/get-my-stats`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            )

            const result = await response.json()
            if (response.ok && result.success) {
              setStats(result.stats)
            }
          } catch {
            // Fallback directo a consulta de perfil en Postgres si las Edge Functions no se han desplegado aún
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, role, points, current_streak, invite_code, email_edu_verified, last_attendance_date')
              .eq('id', session.user.id)
              .single()

            if (profile) {
              setStats({
                userId: profile.id,
                username: profile.username,
                role: profile.role,
                points: profile.points,
                currentStreak: profile.current_streak,
                inviteCode: profile.invite_code,
                emailEduVerified: profile.email_edu_verified,
                lastAttendanceDate: profile.last_attendance_date,
                qrPayload: JSON.stringify({ userId: profile.id, username: profile.username }),
              })
            }
          }
        }

        // 2. Cargar catálogo de premios desde la tabla rewards
        const { data: rewardsData } = await supabase
          .from('rewards')
          .select('id, name, description, points_cost, stock, is_active')
          .eq('is_active', true)
          .order('points_cost', { ascending: true })

        if (rewardsData) {
          setRewards(rewardsData)
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Error al cargar los datos')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, supabase])

  async function handleRedeem(reward: Reward) {
    if (!stats) return
    setRedeemStatus(null)

    if (stats.points < reward.points_cost) {
      setRedeemStatus({
        type: 'error',
        text: `Necesitas ${reward.points_cost} puntos para este premio (tienes ${stats.points} pts).`,
      })
      return
    }

    setRedeemingId(reward.id)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Intentar canje por Edge Function o fallback directo en Postgres
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      let success = false
      let remainingPts = stats.points - reward.points_cost

      if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/redeem-reward`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ rewardId: reward.id }),
            }
          )

          const result = await response.json()
          if (response.ok && result.success) {
            success = true
            remainingPts = result.remainingPoints
          }
        } catch {}
      }

      if (!success) {
        // Fallback directo a Postgres si Edge Functions no están desplegadas en Supabase
        await supabase.from('reward_redemptions').insert({
          user_id: session.user.id,
          reward_id: reward.id,
          points_spent: reward.points_cost,
          status: 'pending',
        })

        await supabase.from('profiles').update({
          points: remainingPts,
        }).eq('id', session.user.id)
      }

      setRedeemStatus({
        type: 'success',
        text: `🎉 ¡Solicitud creada! Presenta tu pantalla a Zahir para recibir: ${reward.name}`,
      })

      // Actualizar puntos en pantalla
      setStats((prev) => prev ? { ...prev, points: remainingPts } : null)
    } catch (err: any) {
      setRedeemStatus({ type: 'error', text: err.message || 'Error al solicitar canje.' })
    } finally {
      setRedeemingId(null)
    }
  }

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

        {/* Tarjetas de Puntos y Racha */}
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

        {/* SECCIÓN CATÁLOGO DE PREMIOS CANJEABLES */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100">🎁 Catálogo de Premios</h2>
              <p className="text-xs text-slate-400 mt-0.5">Canjea tus puntos acumulados en la vinería</p>
            </div>
          </div>

          {redeemStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-medium text-center ${
                redeemStatus.type === 'success'
                  ? 'bg-emerald-950/90 border border-emerald-800 text-emerald-200'
                  : 'bg-red-950/90 border border-red-800 text-red-200'
              }`}
            >
              {redeemStatus.text}
            </div>
          )}

          <div className="space-y-3">
            {rewards.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Cargando premios disponibles...</p>
            ) : (
              rewards.map((reward) => {
                const canAfford = stats.points >= reward.points_cost
                const isRedeeming = redeemingId === reward.id

                return (
                  <div
                    key={reward.id}
                    className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between space-x-3 shadow-inner"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xs font-bold text-slate-200 truncate">{reward.name}</h3>
                        <span className="text-[10px] font-extrabold text-amber-400 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full shrink-0">
                          {reward.points_cost} pts
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{reward.description}</p>
                    </div>

                    <button
                      disabled={!canAfford || isRedeeming}
                      onClick={() => handleRedeem(reward)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                        canAfford
                          ? 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-white shadow-md'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isRedeeming ? 'Canjeando...' : canAfford ? 'Canjear' : 'Puntos insuficientes'}
                    </button>
                  </div>
                )
              })
            )}
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
