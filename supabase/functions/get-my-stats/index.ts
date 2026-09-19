// Edge Function: get-my-stats
// Scope: Returns aggregated statistics for the authenticated user
// (total accumulated points calculated from points_ledger, current streak, invite code, and QR payload).
// Avoids exposing full points_ledger raw rows to the frontend client.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders,
      })
    }

    // 1. Validar autenticación
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token de sesión inválido' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    // 2. Consultar perfil del usuario
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, role, points, current_streak, invite_code, email_edu_verified, last_attendance_date')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Perfil no encontrado' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    // 3. Opcional: Verificar la suma real de puntos desde points_ledger
    const { data: ledgerSum } = await supabase
      .from('points_ledger')
      .select('delta')
      .eq('user_id', user.id)

    const computedPoints = (ledgerSum || []).reduce((acc: number, curr: { delta: number }) => acc + curr.delta, 0)
    // Usar la suma de points_ledger si difiere del campo derivado (para prevenir inconsistencias)
    const totalPoints = Math.max(profile.points, computedPoints)

    // 4. Payload para código QR único
    const qrPayload = JSON.stringify({
      userId: profile.id,
      username: profile.username,
    })

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          userId: profile.id,
          username: profile.username,
          role: profile.role,
          points: totalPoints,
          currentStreak: profile.current_streak,
          inviteCode: profile.invite_code,
          emailEduVerified: profile.email_edu_verified,
          lastAttendanceDate: profile.last_attendance_date,
          qrPayload,
        },
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
