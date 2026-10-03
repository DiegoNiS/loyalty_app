// Edge Function: redeem-reward
// Scope: Allows client to request reward redemption or Admin to verify/approve reward redemption.
// Checks current user's available points balance, deducts points in points_ledger with negative delta,
// and records entry in public.reward_redemptions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RedeemRequestBody {
  rewardId: string
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token de sesión inválido' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const { rewardId } = (await req.json()) as RedeemRequestBody
    if (!rewardId) {
      return new Response(JSON.stringify({ error: 'Falta rewardId' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 1. Obtener premio activo
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select('id, name, points_cost, stock, is_active')
      .eq('id', rewardId)
      .single()

    if (rewardError || !reward || !reward.is_active) {
      return new Response(JSON.stringify({ error: 'El premio no está disponible o no existe.' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    if (reward.stock !== null && reward.stock <= 0) {
      return new Response(JSON.stringify({ error: 'Premio agotado temporalmente.' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 2. Obtener perfil del usuario para validar puntos suficientes
    const { data: profile } = await supabase
      .from('profiles')
      .select('points')
      .eq('id', user.id)
      .single()

    if (!profile || profile.points < reward.points_cost) {
      return new Response(JSON.stringify({ error: 'Puntos insuficientes para canjear este premio.' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 3. Registrar canje en reward_redemptions
    const { data: redemption, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .insert({
        user_id: user.id,
        reward_id: reward.id,
        points_spent: reward.points_cost,
        status: 'pending',
      })
      .select('id')
      .single()

    if (redemptionError || !redemption) {
      throw new Error(`Error al crear la solicitud de canje: ${redemptionError?.message}`)
    }

    // 4. Registrar en points_ledger con delta negativo
    const { data: reasonData } = await supabase
      .from('point_reasons')
      .select('id')
      .eq('code', 'manual_adjustment')
      .single()

    await supabase.from('points_ledger').insert({
      user_id: user.id,
      delta: -reward.points_cost,
      reason_id: reasonData?.id || null,
    })

    // 5. Actualizar saldo de puntos derivado del cliente
    await supabase
      .from('profiles')
      .update({ points: profile.points - reward.points_cost })
      .eq('id', user.id)

    // Reducir stock si aplica
    if (reward.stock !== null) {
      await supabase
        .from('rewards')
        .update({ stock: reward.stock - 1 })
        .eq('id', reward.id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `¡Solicitud de canje creada! Presenta tu pantalla a Zahir para recibir tu premio: ${reward.name}`,
        redemptionId: redemption.id,
        remainingPoints: profile.points - reward.points_cost,
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
