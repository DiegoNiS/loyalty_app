// Edge Function: register-with-invite
// Scope: Create user profile, validate & consume invite code, check .edu.pe bonus,
// create referral record, and award initial referral signup points to inviter.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RegisterRequestBody {
  userId: string
  username: string
  email: string
  inviteCode?: string
}

const POINTS_REFERRAL_SIGNUP = 20
const POINTS_EDU_BONUS = 10

serve(async (req: Request) => {
  // Configuración de cabeceras CORS
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

    const { userId, username, email, inviteCode } = (await req.json()) as RegisterRequestBody

    if (!userId || !username || !email) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // Inicializar cliente Supabase con service_role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verificar si el correo pertenece al dominio .edu.pe
    const isEduEmail = email.toLowerCase().trim().endsWith('.edu.pe')

    // 2. Generar código de invitación único de 6 caracteres para el nuevo perfil
    const generatedInviteCode = (username.substring(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000)).replace(/[^A-Z0-9]/g, 'X')

    // 3. Resolver inviter_id si se proporcionó un inviteCode
    let inviterId: string | null = null
    if (inviteCode && inviteCode.trim() !== '') {
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('invite_code', inviteCode.trim())
        .single()

      if (inviterProfile) {
        inviterId = inviterProfile.id
      }
    }

    // 4. Obtener id del motivo de puntos 'referral_signup'
    let reasonSignupId: string | null = null
    if (inviterId) {
      const { data: reasonData } = await supabase
        .from('point_reasons')
        .select('id')
        .eq('code', 'referral_signup')
        .single()
      if (reasonData) {
        reasonSignupId = reasonData.id
      }
    }

    // 5. Crear fila de perfil en public.profiles
    const initialPoints = isEduEmail ? POINTS_EDU_BONUS : 0

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      username: username.trim(),
      role: 'client',
      email_edu_verified: isEduEmail,
      invite_code: generatedInviteCode,
      referred_by: inviterId,
      points: initialPoints,
      current_streak: 0,
    })

    if (profileError) {
      throw new Error(`Error al crear el perfil: ${profileError.message}`)
    }

    // 6. Si hubo invitante válido, crear registro en public.referrals y otorgar puntos al invitante
    if (inviterId && reasonSignupId) {
      const { data: referralData, error: referralError } = await supabase
        .from('referrals')
        .insert({
          inviter_id: inviterId,
          invited_id: userId,
          status: 'signed_up',
        })
        .select('id')
        .single()

      if (!referralError && referralData) {
        // Registrar en points_ledger para el invitante
        await supabase.from('points_ledger').insert({
          user_id: inviterId,
          delta: POINTS_REFERRAL_SIGNUP,
          reason_id: reasonSignupId,
          referral_id: referralData.id,
        })

        // Incrementar puntos derivados en la tabla profiles del invitante
        const { data: inviterCurr } = await supabase
          .from('profiles')
          .select('points')
          .eq('id', inviterId)
          .single()

        if (inviterCurr) {
          await supabase
            .from('profiles')
            .update({ points: inviterCurr.points + POINTS_REFERRAL_SIGNUP })
            .eq('id', inviterId)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inviteCode: generatedInviteCode,
        isEduVerified: isEduEmail,
        pointsEarned: initialPoints,
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
