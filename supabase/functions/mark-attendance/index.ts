// Edge Function: mark-attendance
// Scope: Invocable ONLY by admin (Zahir). Receives client QR/ID, records attendance,
// calculates weekly streak (increments if within 7 days, else resets to 1),
// awards attendance points + streak bonus if applicable, and updates referral status to 'attended'
// with bonus points to inviter if this is the invited user's first attendance.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MarkAttendanceRequestBody {
  targetUserId: string
  eventType?: 'regular' | 'special_event'
  eventLabel?: string
}

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const { targetUserId, eventType = 'regular', eventLabel } = (await req.json()) as MarkAttendanceRequestBody

    // TODO: Verify caller identity and ensure auth.uid() has role = 'admin' in profiles table
    // TODO: Fetch target user profile (last_attendance_date, current_streak)
    // TODO: Insert attendance record into public.attendances
    // TODO: Calculate new streak based on targetUserId's last_attendance_date vs current date
    // TODO: Calculate attendance points & streak bonus points
    // TODO: Insert points entry into public.points_ledger ('attendance', 'streak_bonus')
    // TODO: Update public.profiles (points sum, current_streak, last_attendance_date)
    // TODO: Check if user has a pending referral (status = 'signed_up')
    // TODO: If pending referral exists: update status to 'attended', set attended_at, insert referral_attendance points for inviter in points_ledger, update inviter points sum

    return new Response(
      JSON.stringify({ message: 'Skeleton mark-attendance ready', targetUserId }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
