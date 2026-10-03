-- Migration: Dynamic Point Rules, History/Audit (Kardex) and Rewards Catalog
-- Created for Vinos del Corazón Loyalty Portal

-- 1. POINT RULES TABLE (Dynamic point values)
CREATE TABLE IF NOT EXISTS public.point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'attendance', 'edu_bonus', 'referral_signup', 'referral_attendance', 'streak_bonus'
  name TEXT NOT NULL,
  description TEXT,
  points_value INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial default rules
INSERT INTO public.point_rules (code, name, description, points_value) VALUES
  ('attendance', 'Asistencia Regular', 'Puntos otorgados por registrar asistencia presencial', 10),
  ('edu_bonus', 'Bono Correo .edu.pe', 'Puntos iniciales de bienvenida por registro con correo institucional', 10),
  ('referral_signup', 'Registro de Referido', 'Puntos otorgados al invitante cuando su referido se registra', 20),
  ('referral_attendance', 'Asistencia de Referido', 'Puntos otorgados al invitante cuando su referido asiste por primera vez', 30),
  ('streak_bonus', 'Bono de Racha Semanal', 'Puntos adicionales por mantener la racha de asistencia', 5)
ON CONFLICT (code) DO NOTHING;

-- 2. POINT RULE HISTORY TABLE (Kardex / Audit Trail for Rule Value Changes)
CREATE TABLE IF NOT EXISTS public.point_rule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.point_rules(id) ON DELETE CASCADE,
  old_points_value INTEGER NOT NULL,
  new_points_value INTEGER NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason_description TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. REWARDS CATALOG TABLE
CREATE TABLE IF NOT EXISTS public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  stock INTEGER DEFAULT NULL, -- NULL means unlimited stock
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial rewards for Vinos del Corazón V1
INSERT INTO public.rewards (name, description, points_cost) VALUES
  ('Copa de Vino Artesanal', 'Canjea 1 copa de vino artesanal de la casa en tu visita', 50),
  ('Descuento 10% en Botella', 'Obtén 10% de descuento en la compra de cualquier botella artesanal', 80),
  ('Cata Guiada Especial', 'Acceso a una cata guiada exclusiva con maridaje de quesos', 150)
ON CONFLICT DO NOTHING;

-- 4. REWARD REDEMPTIONS TABLE (Redemption History)
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed', 'cancelled')),
  redeemed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin (Zahir) who verified the redemption
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_point_rules_code ON public.point_rules(code);
CREATE INDEX IF NOT EXISTS idx_point_rule_history_rule_id ON public.point_rule_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user_id ON public.reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_id ON public.reward_redemptions(reward_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_rule_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- Read policies (Everyone authenticated can read rules and rewards)
CREATE POLICY "Point rules select policy" ON public.point_rules FOR SELECT USING (true);
CREATE POLICY "Point rule history select policy" ON public.point_rule_history FOR SELECT USING (public.is_admin());
CREATE POLICY "Rewards select policy" ON public.rewards FOR SELECT USING (true);

CREATE POLICY "Reward redemptions select policy"
  ON public.reward_redemptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Write policies (Admin only for rewards & rules)
CREATE POLICY "Point rules admin write" ON public.point_rules FOR ALL USING (public.is_admin());
CREATE POLICY "Rewards admin write" ON public.rewards FOR ALL USING (public.is_admin());

-- HELPER FUNCTION: Get Active Rule Points Value by Code at Current Timestamp
CREATE OR REPLACE FUNCTION public.get_active_rule_points(rule_code TEXT)
RETURNS INTEGER AS $$
DECLARE
  pts INTEGER;
BEGIN
  SELECT points_value INTO pts
  FROM public.point_rules
  WHERE code = rule_code
    AND is_active = TRUE
    AND NOW() >= effective_from
    AND (effective_to IS NULL OR NOW() <= effective_to)
  ORDER BY effective_from DESC
  LIMIT 1;

  RETURN COALESCE(pts, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- TRIGGER UPDATE FOR AUTO USER PROFILE (Now fetches points from point_rules instead of hardcoded 10)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username TEXT;
  gen_invite_code TEXT;
  is_edu BOOLEAN;
  initial_pts INTEGER := 0;
BEGIN
  new_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );

  is_edu := LOWER(NEW.email) LIKE '%.edu.pe';
  
  IF is_edu THEN
    initial_pts := public.get_active_rule_points('edu_bonus');
  END IF;

  gen_invite_code := UPPER(SUBSTRING(new_username FROM 1 FOR 3) || FLOOR(1000 + RANDOM() * 9000)::TEXT);

  INSERT INTO public.profiles (
    id, username, role, email_edu_verified, invite_code, points, current_streak
  ) VALUES (
    NEW.id, new_username, 'client', is_edu, gen_invite_code, initial_pts, 0
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
