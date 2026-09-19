// Edge Function: mark-attendance
// Scope: Invocable ONLY by admin (Zahir). Receives client QR/ID, records attendance,
// calculates weekly streak, awards attendance & streak bonus points, and completes referral process.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MarkAttendanceRequestBody {
  targetUserId: string
  eventTypeCode?: string // 'regular_tasting' | 'special_event'
}

const POINTS_ATTENDANCE_REGULAR = 20
const POINTS_STREAK_BONUS = 15
const POINTS_REFERRAL_ATTENDANCE = 100

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    // 1. Verificar identidad del administrador que llama a la función
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: callerUser }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    }

    // Cliente con service role para realizar operaciones privilegiadas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verificar que el caller sea admin
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acceso denegado: requiere rol admin' }), { status: 403 })
    }

    const { targetUserId, eventTypeCode = 'regular_tasting' } = (await req.json()) as MarkAttendanceRequestBody

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'targetUserId es requerido' }), { status: 400 })
    }

    // 2. Obtener perfil del cliente destino
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, points, current_streak, last_attendance_date')
      .eq('id', targetUserId)
      .single()

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Usuario cliente no encontrado' }), { status: 404 })
    }

    // Resolver ID de etiqueta de evento
    let eventLabelId: string | null = null
    const { data: eventLabel } = await supabaseAdmin
      .from('event_labels')
      .select('id')
      .eq('code', eventTypeCode)
      .single()

    if (eventLabel) {
      eventLabelId = eventLabel.id
    }

    // 3. Registrar asistencia en public.attendances
    const nowIso = new Date().toISOString()
    const { data: attendanceData, error: attendanceError } = await supabaseAdmin
      .from('attendances')
      .insert({
        user_id: targetUserId,
        marked_by: callerUser.id,
        event_type: eventTypeCode === 'special_event' ? 'special_event' : 'regular',
        event_label_id: eventLabelId,
        attended_at: nowIso,
      })
      .select('id')
      .single()

    if (attendanceError || !attendanceData) {
      throw new Error(`Error registrando asistencia: ${attendanceError?.message}`)
    }

    // 4. Calcular nueva racha
    const currentDateStr = nowIso.split('T')[0]
    let newStreak = 1
    let isStreakBonusEligible = false

    if (!targetProfile.last_attendance_date) {
      newStreak = 1
    } else {
      const lastDate = new Date(targetProfile.last_attendance_date)
      const currDate = new Date(currentDateStr)
      const diffMs = currDate.getTime() - lastDate.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays <= 0) {
        newStreak = Math.max(1, targetProfile.current_streak)
      } else if (diffDays <= 7) {
        newStreak = targetProfile.current_streak + 1
        isStreakBonusEligible = newStreak > 1
      } else {
        newStreak = 1
      }
    }

    // 5. Registrar puntos por asistencia en points_ledger
    const { data: reasonAttendance } = await supabaseAdmin
      .from('point_reasons')
      .select('id')
      .eq('code', 'attendance')
      .single()

    let addedPoints = POINTS_ATTENDANCE_REGULAR

    if (reasonAttendance) {
      await supabaseAdmin.from('points_ledger').insert({
        user_id: targetUserId,
        delta: POINTS_ATTENDANCE_REGULAR,
        reason_id: reasonAttendance.id,
        attendance_id: attendanceData.id,
      })
    }

    // 6. Registrar bono de racha si aplica
    if (isStreakBonusEligible) {
      const { data: reasonStreak } = await supabaseAdmin
        .from('point_reasons')
        .select('id')
        .eq('code', 'streak_bonus')
        .single()

      if (reasonStreak) {
        await supabaseAdmin.from('points_ledger').insert({
          user_id: targetUserId,
          delta: POINTS_STREAK_BONUS,
          reason_id: reasonStreak.id,
          attendance_id: attendanceData.id,
        })
        addedPoints += POINTS_STREAK_BONUS
      }
    }

    // Actualizar perfil del cliente
    const updatedTargetPoints = targetProfile.points + addedPoints
    await supabaseAdmin
      .from('profiles')
      .update({
        points: updatedTargetPoints,
        current_streak: newStreak,
        last_attendance_date: currentDateStr,
      })
      .eq('id', targetUserId)

    // 7. Verificar y actualizar estado de referido si era su primera asistencia
    const { data: pendingReferral } = await supabaseAdmin
      .from('referrals')
      .select('id, inviter_id')
      .eq('invited_id', targetUserId)
      .eq('status', 'signed_up')
      .single()

    if (pendingReferral) {
      // Marcar referido como 'attended'
      await supabaseAdmin
        .from('referrals')
        .update({
          status: 'attended',
          attended_at: nowIso,
        })
        .eq('id', pendingReferral.id)

      // Acreditar puntos de referral_attendance al invitante
      const { data: reasonRefAtt } = await supabaseAdmin
        .from('point_reasons')
        .select('id')
        .eq('code', 'referral_attendance')
        .single()

      if (reasonRefAtt) {
        await supabaseAdmin.from('points_ledger').insert({
          user_id: pendingReferral.inviter_id,
          delta: POINTS_REFERRAL_ATTENDANCE,
          reason_id: reasonRefAtt.id,
          referral_id: pendingReferral.id,
        })

        // Actualizar puntos del invitante
        const { data: inviterProfile } = await supabaseAdmin
          .from('profiles')
          .select('points')
          .eq('id', pendingReferral.inviter_id)
          .single()

        const newInviterPoints = (inviterProfile?.points || 0) + POINTS_REFERRAL_ATTENDANCE
        await supabaseAdmin
          .from('profiles')
          .update({ points: newInviterPoints })
          .eq('id', pendingReferral.inviter_id)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        addedPoints,
        newStreak,
        lastAttendanceDate: currentDateStr,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
