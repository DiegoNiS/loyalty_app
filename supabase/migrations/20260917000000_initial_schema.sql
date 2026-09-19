-- Initial Schema Migration for Vinos del Corazón Loyalty Portal
-- Refactored based on user feedback: Added catalog tables (event_labels, point_reasons)
-- and explicit FKs in points_ledger (attendance_id, referral_id) replacing raw reference_id text.

-- 1. CATALOG TABLE: EVENT_LABELS
CREATE TABLE IF NOT EXISTS public.event_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial event labels
INSERT INTO public.event_labels (code, name, description) VALUES
  ('regular_tasting', 'Cata Regular', 'Asistencia estándar a la vinería'),
  ('special_event', 'Evento Especial', 'Eventos especiales como Llamada al Poder')
ON CONFLICT (code) DO NOTHING;

-- 2. CATALOG TABLE: POINT_REASONS
CREATE TABLE IF NOT EXISTS public.point_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial point reasons
INSERT INTO public.point_reasons (code, name, description) VALUES
  ('attendance', 'Asistencia', 'Puntos por asistencia presencial'),
  ('referral_signup', 'Registro de Referido', 'Puntos otorgados al invitante por registro del invitado'),
  ('referral_attendance', 'Asistencia de Referido', 'Puntos otorgados al invitante cuando su referido asiste por primera vez'),
  ('streak_bonus', 'Bono de Racha', 'Puntos adicionales por mantener racha de asistencia semanal'),
  ('manual_adjustment', 'Ajuste Manual', 'Ajuste de puntos realizado por administrador')
ON CONFLICT (code) DO NOTHING;

-- 3. PROFILES TABLE (1:1 with auth.users)
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

-- 4. ATTENDANCES TABLE
CREATE TABLE IF NOT EXISTS public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  marked_by UUID NOT NULL REFERENCES public.profiles(id),
  event_type TEXT NOT NULL DEFAULT 'regular' CHECK (event_type IN ('regular', 'special_event')),
  event_label_id UUID REFERENCES public.event_labels(id) ON DELETE SET NULL,
  attended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. REFERRALS TABLE
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'attended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attended_at TIMESTAMPTZ
);

-- 6. POINTS_LEDGER TABLE (Source of truth for points)
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason_id UUID NOT NULL REFERENCES public.point_reasons(id),
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_attendances_user_id ON public.attendances(user_id);
CREATE INDEX IF NOT EXISTS idx_attendances_event_label_id ON public.attendances(event_label_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id ON public.points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_reason_id ON public.points_ledger(reason_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_attendance_id ON public.points_ledger(attendance_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_referral_id ON public.points_ledger(referral_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_id ON public.referrals(inviter_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invited_id ON public.referrals(invited_id);

-- ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS on all tables
ALTER TABLE public.event_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_reasons ENABLE ROW LEVEL SECURITY;
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

-- CATALOG TABLES POLICIES (Public Read-Only)
CREATE POLICY "Event labels select policy" ON public.event_labels FOR SELECT USING (true);
CREATE POLICY "Point reasons select policy" ON public.point_reasons FOR SELECT USING (true);

-- PROFILES POLICIES
CREATE POLICY "Profiles view policy"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Profiles update policy"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND points = (SELECT points FROM public.profiles WHERE id = auth.uid())
    AND current_streak = (SELECT current_streak FROM public.profiles WHERE id = auth.uid())
  );

-- ATTENDANCES POLICIES
CREATE POLICY "Attendances select policy"
  ON public.attendances FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- POINTS_LEDGER POLICIES
CREATE POLICY "Points ledger select policy"
  ON public.points_ledger FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- REFERRALS POLICIES
CREATE POLICY "Referrals select policy"
  ON public.referrals FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invited_id OR public.is_admin());
