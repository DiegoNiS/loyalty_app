-- SQL Trigger for Automatic Profile Creation on Signup (Supabase Auth Native Trigger)
-- Ensures that whenever a user signs up via Supabase Auth, a profile row in public.profiles is instantly created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username TEXT;
  gen_invite_code TEXT;
  is_edu BOOLEAN;
  initial_pts INTEGER;
BEGIN
  -- Extraer username de raw_user_meta_data si existe, o usar prefijo del correo
  new_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  );

  -- Verificar si el correo pertenece a .edu.pe
  is_edu := LOWER(NEW.email) LIKE '%.edu.pe';
  initial_pts := CASE WHEN is_edu THEN 10 ELSE 0 END;

  -- Generar código de invitación único de 6 caracteres
  gen_invite_code := UPPER(SUBSTRING(new_username FROM 1 FOR 3) || FLOOR(1000 + RANDOM() * 9000)::TEXT);

  -- Insertar perfil en public.profiles
  INSERT INTO public.profiles (
    id,
    username,
    role,
    email_edu_verified,
    invite_code,
    points,
    current_streak
  ) VALUES (
    NEW.id,
    new_username,
    'client',
    is_edu,
    gen_invite_code,
    initial_pts,
    0
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear el trigger asociado a auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
