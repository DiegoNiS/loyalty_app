// Edge Function: update-point-rule
// Scope: Invocable ONLY by admin (Zahir/Duhvia). Updates active points_value for a rule in point_rules
// and automatically logs an audit trail entry in point_rule_history (Kardex).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface UpdateRuleRequestBody {
  ruleCode: string
  newPointsValue: number
  reasonDescription?: string
  effectiveFrom?: string // ISO string date if scheduled for future
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

    // Verificar rol admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acceso denegado: Se requiere rol de administrador' }), {
        status: 403,
        headers: corsHeaders,
      })
    }

    const { ruleCode, newPointsValue, reasonDescription, effectiveFrom } = (await req.json()) as UpdateRuleRequestBody

    if (!ruleCode || newPointsValue === undefined) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros obligatorios (ruleCode, newPointsValue)' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // 1. Consultar regla actual
    const { data: currentRule, error: ruleError } = await supabase
      .from('point_rules')
      .select('id, points_value')
      .eq('code', ruleCode)
      .single()

    if (ruleError || !currentRule) {
      return new Response(JSON.stringify({ error: 'Regla de puntos no encontrada.' }), {
        status: 404,
        headers: corsHeaders,
      })
    }

    const oldPointsValue = currentRule.points_value
    const effectiveDate = effectiveFrom ? new Date(effectiveFrom).toISOString() : new Date().toISOString()

    // 2. Registrar historial en Kardex (point_rule_history)
    await supabase.from('point_rule_history').insert({
      rule_id: currentRule.id,
      old_points_value: oldPointsValue,
      new_points_value: newPointsValue,
      changed_by: user.id,
      reason_description: reasonDescription || 'Modificación manual por Administrador',
      effective_from: effectiveDate,
    })

    // 3. Actualizar valor activo en point_rules
    await supabase
      .from('point_rules')
      .update({
        points_value: newPointsValue,
        effective_from: effectiveDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentRule.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Regla '${ruleCode}' actualizada con éxito de ${oldPointsValue} a ${newPointsValue} puntos. Auditoría Kardex registrada.`,
        oldValue: oldPointsValue,
        newValue: newPointsValue,
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
