'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QRScannerModal from '@/components/QRScannerModal'

interface PendingRedemption {
  id: string
  points_spent: number
  created_at: string
  user_id: string
  profiles: {
    username: string
  } | null
  rewards: {
    name: string
  } | null
}

interface PointRule {
  id: string
  code: string
  name: string
  points_value: number
  description: string
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'redemptions' | 'rules'>('attendance')
  const [targetUserId, setTargetUserId] = useState('')
  const [eventTypeCode, setEventTypeCode] = useState<'regular_tasting' | 'special_event'>('regular_tasting')
  const [loading, setLoading] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Estados para canjes y reglas
  const [redemptions, setRedemptions] = useState<PendingRedemption[]>([])
  const [rules, setRules] = useState<PointRule[]>([])
  const [editingRule, setEditingRule] = useState<{ code: string; value: number } | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (activeTab === 'redemptions') {
      fetchRedemptions()
    } else if (activeTab === 'rules') {
      fetchRules()
    }
  }, [activeTab])

  async function fetchRedemptions() {
    const { data } = await supabase
      .from('reward_redemptions')
      .select('id, points_spent, created_at, user_id, profiles(username), rewards(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (data) {
      setRedemptions(data as any)
    }
  }

  async function fetchRules() {
    const { data } = await supabase
      .from('point_rules')
      .select('id, code, name, points_value, description')
      .eq('is_active', true)
      .order('code', { ascending: true })

    if (data) {
      setRules(data)
    }
  }

  async function handleApproveRedemption(redemptionId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { error } = await supabase
      .from('reward_redemptions')
      .update({
        status: 'redeemed',
        redeemed_by: session.user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq('id', redemptionId)

    if (!error) {
      setStatusMsg({ type: 'success', text: ' Canje verificado y entregado con éxito.' })
      fetchRedemptions()
    }
  }

  async function handleUpdateRule(ruleCode: string, newPointsValue: number) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-point-rule`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ruleCode,
            newPointsValue,
            reasonDescription: 'Ajuste manual desde panel de administración',
          }),
        }
      )

      const result = await response.json()
      if (response.ok && result.success) {
        setStatusMsg({ type: 'success', text: result.message })
        setEditingRule(null)
        fetchRules()
      } else {
        throw new Error(result.error || 'Error al actualizar la regla')
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message })
    }
  }

  async function processAttendance(userIdRaw: string) {
    setStatusMsg(null)
    let userId = userIdRaw.trim()

    if (userId.startsWith('{')) {
      try {
        const parsed = JSON.parse(userId)
        if (parsed.userId) userId = parsed.userId
      } catch {}
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
          body: JSON.stringify({ targetUserId: userId, eventTypeCode }),
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
        {/* Header Admin */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-amber-500/20 p-4 rounded-2xl backdrop-blur-md shadow-lg">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Panel de Administración (Zahir)
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

        {/* Pestañas de Navegación del Panel */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-1 shadow-md">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'attendance'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📷 Asistencia
          </button>
          <button
            onClick={() => setActiveTab('redemptions')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'redemptions'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🎁 Canjes
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'rules'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚙️ Reglas
          </button>
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

        {/* TAB 1: ASISTENCIA PRESENCIAL */}
        {activeTab === 'attendance' && (
          <>
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl text-center">
              <div>
                <h2 className="text-base font-bold text-slate-100">Escáner de Cámara Móvil</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Escanea el código QR desde la pantalla del celular del cliente.
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

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
                Ingreso Manual de ID
              </h3>

              <form onSubmit={handleFormSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={eventTypeCode}
                    onChange={(e) => setEventTypeCode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs"
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
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs font-mono"
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
          </>
        )}

        {/* TAB 2: VERIFICACIÓN DE CANJES PENDIENTES */}
        {activeTab === 'redemptions' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
            <h2 className="text-sm font-bold text-slate-100">Solitudes de Canje Pendientes</h2>

            {redemptions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No hay solicitudes de canje pendientes.</p>
            ) : (
              <div className="space-y-3">
                {redemptions.map((item) => (
                  <div key={item.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400">@{item.profiles?.username || 'Cliente'}</span>
                      <span className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-xs text-slate-200 font-semibold">
                      {item.rewards?.name} ({item.points_spent} pts)
                    </div>
                    <button
                      onClick={() => handleApproveRedemption(item.id)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      ✓ Entregar Premio y Marcar Verificado
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GESTOR DE REGLAS DE PUNTOS Y KARDEX */}
        {activeTab === 'rules' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Reglas Dinámicas de Puntos</h2>
              <p className="text-xs text-slate-400 mt-0.5">Modifica los valores en tiempo real (guarda Kardex de auditoría)</p>
            </div>

            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-200">{rule.name}</h3>
                      <p className="text-[10px] text-slate-400">{rule.description}</p>
                    </div>
                    <span className="text-xs font-extrabold text-amber-400 px-2.5 py-1 bg-amber-500/10 rounded-lg shrink-0">
                      {rule.points_value} pts
                    </span>
                  </div>

                  {editingRule?.code === rule.code ? (
                    <div className="flex items-center space-x-2 pt-2">
                      <input
                        type="number"
                        value={editingRule.value}
                        onChange={(e) => setEditingRule({ ...editingRule, value: parseInt(e.target.value) || 0 })}
                        className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-amber-400"
                      />
                      <button
                        onClick={() => handleUpdateRule(rule.code, editingRule.value)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingRule(null)}
                        className="px-2 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingRule({ code: rule.code, value: rule.points_value })}
                      className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                    >
                      ✏️ Cambiar Valor en Puntos
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
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
