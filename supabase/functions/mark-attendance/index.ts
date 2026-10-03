// Edge Function: mark-attendance
// Updated: Fetches dynamic point values from public.point_rules table instead of hardcoded constants.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MarkAttendanceRequestBody {
  targetUserId: string
  eventTypeCode?: 'regular_tasting' | 'special_event'
}

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Token de sesión inválido' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

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

    // 1. Obtener REGLAS DINÁMICAS DE PUNTOS desde la tabla public.point_rules
    const { data: rulesData } = await supabase
      .from('point_rules')
      .select('code, points_default')
      .eq('is_active', true)

    const ruleMap = new Map((rulesData || []).map((r: { code: string; points_default: number }) => [r.code, r.points_default]))

    const ptsAttendance = eventTypeCode === 'special_event'
      ? (ruleMap.get('attendance_special') ?? 15)
      : (ruleMap.get('attendance_regular') ?? 10)

    const ptsStreakBonus = ruleMap.get('streak_bonus') ?? 5
    const ptsReferralAttendance = ruleMap.get('referral_attendance') ?? 30

    // 2. Obtener perfil objetivo
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
        newStreak = targetProfile.current_streak
      } else if (diffDays <= 7) {
        newStreak = targetProfile.current_streak + 1
        isStreakBonus = newStreak > 1
      } else {
        newStreak = 1
      }
    }

    // 5. Insertar asistencia
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

    // 6. Registrar entradas en points_ledger con valores DINÁMICOS
    let totalPointsAwarded = ptsAttendance

    await supabase.from('points_ledger').insert({
      user_id: targetUserId,
      delta: ptsAttendance,
      reason_id: reasonMap.get('attendance'),
      attendance_id: attendanceData.id,
    })

    if (isStreakBonus && reasonMap.get('streak_bonus')) {
      totalPointsAwarded += ptsStreakBonus
      await supabase.from('points_ledger').insert({
        user_id: targetUserId,
        delta: ptsStreakBonus,
        reason_id: reasonMap.get('streak_bonus'),
        attendance_id: attendanceData.id,
      })
    }

    await supabase
      .from('profiles')
      .update({
        points: targetProfile.points + totalPointsAwarded,
        current_streak: newStreak,
        last_attendance_date: todayStr,
      })
      .eq('id', targetUserId)

    // 7. Verificar referido pendiente
    const { data: pendingReferral } = await supabase
      .from('referrals')
      .select('id, inviter_id')
      .eq('invited_id', targetUserId)
      .eq('status', 'signed_up')
      .single()

    if (pendingReferral && reasonMap.get('referral_attendance')) {
      await supabase
        .from('referrals')
        .update({
          status: 'attended',
          attended_at: new Date().toISOString(),
        })
        .eq('id', pendingReferral.id)

      await supabase.from('points_ledger').insert({
        user_id: pendingReferral.inviter_id,
        delta: ptsReferralAttendance,
        reason_id: reasonMap.get('referral_attendance'),
        referral_id: pendingReferral.id,
      })

      const { data: inviterProf } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', pendingReferral.inviter_id)
        .single()

      if (inviterProf) {
        await supabase
          .from('profiles')
          .update({ points: inviterProf.points + ptsReferralAttendance })
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
