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

    // TODO: Extract JWT from Authorization header and authenticate caller
    // TODO: Fetch profile info (points, current_streak, invite_code, email_edu_verified)
    // TODO: Optionally verify points match SUM(delta) from public.points_ledger
    // TODO: Generate QR payload/data string for client display

    return new Response(
      JSON.stringify({
        message: 'Skeleton get-my-stats ready',
        stats: {
          points: 0,
          currentStreak: 0,
          inviteCode: 'EXAMPLE',
          qrPayload: 'user-id-or-token',
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
