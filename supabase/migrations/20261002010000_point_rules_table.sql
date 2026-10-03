-- Migration: Add point_rules table to remove hardcoded point values from code and triggers
-- Allows dynamic configuration of points per event, referral type, and bonuses.

CREATE TABLE IF NOT EXISTS public.point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  points_default INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial point rules table (so values can be changed directly from Supabase DB anytime)
INSERT INTO public.point_rules (code, name, points_default, description) VALUES
  ('attendance_regular', 'Asistencia Regular', 10, 'Puntos base otorgados por asistencia estándar'),
  ('attendance_special', 'Asistencia Evento Especial', 15, 'Puntos otorgados en eventos especiales (ej. Llamada al Poder)'),
  ('edu_bonus', 'Bono Correo .edu.pe', 10, 'Puntos de bienvenida adicionales por registrar correo universitario'),
  ('referral_signup', 'Registro de Referido', 20, 'Puntos otorgados al invitante cuando su referido crea cuenta'),
  ('referral_attendance', 'Primera Asistencia de Referido', 30, 'Puntos otorgados al invitante cuando su referido asiste por primera vez'),
  ('streak_bonus', 'Bono de Racha Semanal', 5, 'Puntos adicionales por mantener la racha de asistencia')
ON CONFLICT (code) DO UPDATE 
SET points_default = EXCLUDED.points_default;

-- Enable RLS
ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;

-- Read-only policy for public/clients, write for admins
CREATE POLICY "Point rules select policy" ON public.point_rules FOR SELECT USING (true);

-- Update trigger function to dynamically fetch points from point_rules table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username TEXT;
  gen_invite_code TEXT;
  is_edu BOOLEAN;
  edu_pts INTEGER := 0;
BEGIN
  new_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );

  is_edu := LOWER(NEW.email) LIKE '%.edu.pe';

  -- Consultar dinámicamente el valor de puntos configurado en la tabla point_rules
  IF is_edu THEN
    SELECT points_default INTO edu_pts
    FROM public.point_rules
    WHERE code = 'edu_bonus' AND is_active = TRUE;
    
    edu_pts := COALESCE(edu_pts, 10);
  END IF;

  gen_invite_code := UPPER(SUBSTRING(new_username FROM 1 FOR 3) || FLOOR(1000 + RANDOM() * 9000)::TEXT);

  INSERT INTO public.profiles (
    id, username, role, email_edu_verified, invite_code, points, current_streak
  ) VALUES (
    NEW.id, new_username, 'client', is_edu, gen_invite_code, edu_pts, 0
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
