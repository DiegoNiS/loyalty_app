// Edge Function: mark-attendance
// Scope: Invocable ONLY by admin (Zahir). Receives client QR/ID, records attendance,
// calculates weekly streak (increments if within 7 days, else resets to 1),
// awards attendance points + streak bonus if applicable, and updates referral status to 'attended'
// with bonus points to inviter if this is the invited user's first attendance.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MarkAttendanceRequestBody {
  targetUserId: string
  eventTypeCode?: 'regular_tasting' | 'special_event'
}

const POINTS_ATTENDANCE = 10
const POINTS_STREAK_BONUS = 5
const POINTS_REFERRAL_ATTENDANCE = 30

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders,
      })
    }

    // 1. Validar autenticación del llamante (JWT del Admin)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado: Falta cabecera Authorization' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Extraer token y verificar usuario llamante
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Token de sesión inválido' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // Verificar que el llamante tenga rol admin en public.profiles
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acceso denegado: Se requiere rol de administrador' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    const { targetUserId, eventTypeCode = 'regular_tasting' } = (await req.json()) as MarkAttendanceRequestBody

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Falta targetUserId' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 2. Obtener el perfil del usuario cliente a marcar asistencia
    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, points, current_streak, last_attendance_date')
      .eq('id', targetUserId)
      .single()

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Usuario cliente no encontrado' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // 3. Obtener IDs de catálogos
    const { data: eventLabel } = await supabase
      .from('event_labels')
      .select('id')
      .eq('code', eventTypeCode)
      .single()

    const { data: reasons } = await supabase
      .from('point_reasons')
      .select('id, code')

    const reasonMap = new Map((reasons || []).map((r: { id: string; code: string }) => [r.code, r.id]))

    // 4. Calcular la racha semanal
    const todayStr = new Date().toISOString().split('T')[0]
    let newStreak = 1
    let isStreakBonus = false

    if (targetProfile.last_attendance_date) {
      const lastDate = new Date(targetProfile.last_attendance_date)
      const currDate = new Date(todayStr)
      const diffMs = currDate.getTime() - lastDate.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays <= 0) {
        // Mismo día
        newStreak = targetProfile.current_streak
      } else if (diffDays <= 7) {
        // Dentro de la semana
        newStreak = targetProfile.current_streak + 1
        isStreakBonus = newStreak > 1
      } else {
        // Más de 7 días: reiniciar racha
        newStreak = 1
      }
    }

    // 5. Insertar registro en public.attendances
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendances')
      .insert({
        user_id: targetUserId,
        marked_by: callerUser.id,
        event_type: eventTypeCode === 'special_event' ? 'special_event' : 'regular',
        event_label_id: eventLabel?.id || null,
        attended_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (attendanceError || !attendanceData) {
      throw new Error(`Error al registrar asistencia: ${attendanceError?.message}`)
    }

    // 6. Registrar entradas en points_ledger para el cliente
    let totalPointsAwarded = POINTS_ATTENDANCE

    // Entrada 1: Puntos por asistencia
    await supabase.from('points_ledger').insert({
      user_id: targetUserId,
      delta: POINTS_ATTENDANCE,
      reason_id: reasonMap.get('attendance'),
      attendance_id: attendanceData.id,
    })

    // Entrada 2: Bono de racha si aplica
    if (isStreakBonus && reasonMap.get('streak_bonus')) {
      totalPointsAwarded += POINTS_STREAK_BONUS
      await supabase.from('points_ledger').insert({
        user_id: targetUserId,
        delta: POINTS_STREAK_BONUS,
        reason_id: reasonMap.get('streak_bonus'),
        attendance_id: attendanceData.id,
      })
    }

    // Actualizar perfil del cliente
    await supabase
      .from('profiles')
      .update({
        points: targetProfile.points + totalPointsAwarded,
        current_streak: newStreak,
        last_attendance_date: todayStr,
      })
      .eq('id', targetUserId)

    // 7. Verificar si el usuario tenía una invitación pendiente ('signed_up')
    const { data: pendingReferral } = await supabase
      .from('referrals')
      .select('id, inviter_id')
      .eq('invited_id', targetUserId)
      .eq('status', 'signed_up')
      .single()

    if (pendingReferral && reasonMap.get('referral_attendance')) {
      // Marcar referido como 'attended'
      await supabase
        .from('referrals')
        .update({
          status: 'attended',
          attended_at: new Date().toISOString(),
        })
        .eq('id', pendingReferral.id)

      // Acreditar puntos de 'referral_attendance' al invitante
      await supabase.from('points_ledger').insert({
        user_id: pendingReferral.inviter_id,
        delta: POINTS_REFERRAL_ATTENDANCE,
        reason_id: reasonMap.get('referral_attendance'),
        referral_id: pendingReferral.id,
      })

      // Actualizar total derivado de puntos del invitante
      const { data: inviterProf } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', pendingReferral.inviter_id)
        .single()

      if (inviterProf) {
        await supabase
          .from('profiles')
          .update({ points: inviterProf.points + POINTS_REFERRAL_ATTENDANCE })
          .eq('id', pendingReferral.inviter_id)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pointsAwarded: totalPointsAwarded,
        newStreak,
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
