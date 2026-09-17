-- Initial Schema Migration for Vinos del Corazón Loyalty Portal
-- Created for Piloto V1

-- 1. PROFILES TABLE (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  email_edu_verified BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code TEXT UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  points INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  last_attendance_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ATTENDANCES TABLE
CREATE TABLE IF NOT EXISTS public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  marked_by UUID NOT NULL REFERENCES public.profiles(id),
  attended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL DEFAULT 'regular' CHECK (event_type IN ('regular', 'special_event')),
  event_label TEXT
);

-- 3. POINTS_LEDGER TABLE (Source of truth for points)
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('attendance', 'referral_signup', 'referral_attendance', 'streak_bonus', 'manual_adjustment')),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. REFERRALS TABLE
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'attended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attended_at TIMESTAMPTZ
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON public.attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id ON public.points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_id ON public.referrals(inviter_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invited_id ON public.referrals(invited_id);

-- ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES POLICIES
-- Users can view their own profile; Admins can view all profiles
CREATE POLICY "Profiles view policy"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- Users can update non-sensitive info (username) on their own profile
CREATE POLICY "Profiles update policy"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent updating sensitive fields directly from client
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND points = (SELECT points FROM public.profiles WHERE id = auth.uid())
    AND current_streak = (SELECT current_streak FROM public.profiles WHERE id = auth.uid())
  );

-- ATTENDANCES POLICIES
-- Users can view their own attendances; Admins can view all
CREATE POLICY "Attendances select policy"
  ON public.attendances FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Direct INSERT on attendances is blocked for clients/admins from frontend.
-- Edge Functions with service_role bypass RLS and perform central validation.

-- POINTS_LEDGER POLICIES
-- Users can view their own ledger entries; Admins can view all
CREATE POLICY "Points ledger select policy"
  ON public.points_ledger FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Direct INSERT/UPDATE/DELETE blocked for client requests; strictly managed via Edge Functions (service_role).

-- REFERRALS POLICIES
-- Users can view referrals where they are inviter or invited; Admins can view all
CREATE POLICY "Referrals select policy"
  ON public.referrals FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invited_id OR public.is_admin());

-- Direct INSERT/UPDATE/DELETE blocked for client requests; managed via Edge Functions during registration/attendance.
