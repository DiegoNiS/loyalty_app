// Edge Function: get-my-stats
// Scope: Returns aggregated statistics for the authenticated user
// (total accumulated points calculated from points_ledger, current streak, invite code, and QR payload).
// Avoids exposing full points_ledger raw rows to the frontend client.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const authHeader = req.headers.get('Authorization') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    // 1. Verificar la sesión del usuario mediante el token JWT
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
    }

    // Cliente con service role para lectura de perfil
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Obtener datos del perfil del usuario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, role, email_edu_verified, invite_code, points, current_streak, last_attendance_date')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Perfil no encontrado' }), { status: 404 })
    }

    // 3. Contar total de asistencias del usuario
    const { count: totalAttendances } = await supabaseAdmin
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    // 4. Contar total de referidos efectivos
    const { count: totalReferralsAttended } = await supabaseAdmin
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', user.id)
      .eq('status', 'attended')

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          userId: profile.id,
          username: profile.username,
          role: profile.role,
          emailEduVerified: profile.email_edu_verified,
          points: profile.points,
          currentStreak: profile.current_streak,
          lastAttendanceDate: profile.last_attendance_date,
          inviteCode: profile.invite_code,
          qrPayload: profile.id, // ID único utilizado para generar el QR en el frontend
          totalAttendances: totalAttendances || 0,
          totalReferralsAttended: totalReferralsAttended || 0,
        },
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
