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

const POINTS_REFERRAL_SIGNUP = 50

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const { userId, username, email, inviteCode } = (await req.json()) as RegisterRequestBody

    if (!userId || !username || !email) {
      return new Response(
        JSON.stringify({ error: 'Campos requeridos faltantes: userId, username, email' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Inicializar cliente Supabase con SERVICE_ROLE_KEY
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verificar si el correo pertenece a un dominio .edu.pe
    const isEduEmail = email.trim().toLowerCase().endsWith('.edu.pe')

    // 2. Generar código de invitación único (ej: VIN-XXXXXX)
    const generatedInviteCode = 'VIN-' + Math.random().toString(36).substring(2, 8).toUpperCase()

    // 3. Si se envió inviteCode, resolver inviter_id en public.profiles
    let inviterId: string | null = null
    if (inviteCode && inviteCode.trim() !== '') {
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .single()

      if (inviterProfile) {
        inviterId = inviterProfile.id
      }
    }

    // 4. Insertar nuevo perfil en public.profiles
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      username: username.trim(),
      role: 'client',
      email_edu_verified: isEduEmail,
      invite_code: generatedInviteCode,
      referred_by: inviterId,
      points: 0,
      current_streak: 0,
    })

    if (profileError) {
      throw new Error(`Error creando perfil: ${profileError.message}`)
    }

    // 5. Si existe inviterId, crear registro en public.referrals y otorgar puntos por signup
    if (inviterId) {
      // Registrar la relación de referido
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
        // Consultar el reason_id de 'referral_signup'
        const { data: reasonData } = await supabase
          .from('point_reasons')
          .select('id')
          .eq('code', 'referral_signup')
          .single()

        if (reasonData) {
          // Registrar en points_ledger para el invitante
          await supabase.from('points_ledger').insert({
            user_id: inviterId,
            delta: POINTS_REFERRAL_SIGNUP,
            reason_id: reasonData.id,
            referral_id: referralData.id,
          })

          // Actualizar la suma total de puntos del invitante
          const { data: inviterCurrent } = await supabase
            .from('profiles')
            .select('points')
            .eq('id', inviterId)
            .single()

          const newPoints = (inviterCurrent?.points || 0) + POINTS_REFERRAL_SIGNUP
          await supabase
            .from('profiles')
            .update({ points: newPoints })
            .eq('id', inviterId)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inviteCode: generatedInviteCode,
        emailEduVerified: isEduEmail,
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
