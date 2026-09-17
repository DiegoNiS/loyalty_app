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

serve(async (req: Request) => {
  try {
    // 1. Verify HTTP method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const { userId, username, email, inviteCode } = (await req.json()) as RegisterRequestBody

    // TODO: Initialize Supabase client with SERVICE_ROLE_KEY
    // TODO: Verify if email ends with '.edu.pe' for email_edu_verified flag
    // TODO: Generate unique invite_code for the new profile
    // TODO: If inviteCode is provided, resolve inviter_id from profiles table
    // TODO: Insert profile into public.profiles
    // TODO: If inviter_id exists, insert into public.referrals (status = 'signed_up')
    // TODO: Insert initial points entry into public.points_ledger for inviter ('referral_signup')

    return new Response(
      JSON.stringify({ message: 'Skeleton register-with-invite ready', userId, username }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
