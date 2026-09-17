# Arquitectura — Portal de Fidelización Vinos del Corazón (Piloto V1)

## 1. Contexto y alcance

Piloto de 1 mes, sin costo para Vinos del Corazón, construido por Duhvia como proyecto de
validación (y portafolio). Objetivo: medir si un sistema de puntos + referidos genera más
clientes nuevos con asistencia real que el volanteo tradicional.

**Métrica de éxito definida antes de construir:** N clientes nuevos verificados con
asistencia confirmada por Zahir en 4 semanas. (Definir N con Duhvia antes del lanzamiento).

**Dentro de alcance V1:**
- Registro con verificación de correo + código de invitación opcional
- Bonus de puntos si el correo es institucional (`.edu.pe`)
- QR único por usuario
- Panel de administración simple (rol único: Zahir) para escanear QR y marcar asistencia
- Cálculo de puntos: asistencia, referido (signup + asistencia confirmada), racha semanal
- Vista de cliente: puntos, racha actual, código/QR de invitación

**Fuera de alcance V1 (backlog V2):**
- Ruleta de premios / canje de cupones (requiere validación legal de promoción de
  alcohol/tabaco antes de construir — no automatizar sin ese visto bueno)
- Imagen de racha descargable para compartir
- Eventos especiales configurables desde el panel ("Llamadas al poder")
- Dashboard de analíticas para Duhvia/Zahir

## 2. Stack

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind
- **Backend/DB/Auth:** Supabase (Postgres + Auth + Row Level Security + Edge Functions)
  — sin servidor Express separado en V1. Toda lógica de negocio sensible (mutación de
  puntos, marcar asistencia) vive en Edge Functions con `service_role`, nunca se calcula
  ni escribe puntos directamente desde el cliente.
- **Despliegue:** Vercel, subdominio de duhvia.com (confirmar con los otros fundadores
  de Duhvia antes de usar el dominio compartido)
- **Testing:** Vitest para lógica de puntos/rachas (unitario), Playwright opcional para
  flujo de registro/escaneo si hay tiempo

## 3. Modelo de datos (Postgres / Supabase)

### `profiles` (1:1 con `auth.users`)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | = auth.users.id |
| username | text unique | |
| role | text | `'client'` \| `'admin'` — default `'client'` |
| email_edu_verified | boolean | default false |
| invite_code | text unique | generado al crear el perfil |
| referred_by | uuid nullable | FK a profiles.id |
| points | integer | default 0 — **campo derivado**, no fuente de verdad |
| current_streak | integer | default 0 |
| last_attendance_date | date nullable | |
| created_at | timestamptz | default now() |

### `attendances`
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| marked_by | uuid FK profiles | debe ser role = 'admin' |
| attended_at | timestamptz | default now() |
| event_type | text | `'regular'` \| `'special_event'` |
| event_label | text nullable | ej. "Llamada al poder" |

### `points_ledger` (fuente de verdad — nunca mutar `profiles.points` directo)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| delta | integer | positivo o negativo |
| reason | text | `'attendance'`, `'referral_signup'`, `'referral_attendance'`, `'streak_bonus'`, `'manual_adjustment'` |
| reference_id | uuid nullable | id de attendance o referral relacionado |
| created_at | timestamptz | default now() |

### `referrals`
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| inviter_id | uuid FK profiles | |
| invited_id | uuid FK profiles unique | un usuario solo puede ser invitado una vez |
| status | text | `'signed_up'` \| `'attended'` |
| created_at | timestamptz | |
| attended_at | timestamptz nullable | |

`profiles.points` y `current_streak` se recalculan/actualizan **solo** desde Edge
Functions (trigger o llamada explícita), sumando `points_ledger`. Esto evita que un
cliente manipule su propio puntaje desde el navegador.

## 4. Row Level Security (resumen de intención — el agente debe escribir el SQL)

- `profiles`: usuario ve/edita solo su propia fila (campos no sensibles como username);
  admin (Zahir) puede leer todas las filas (para el panel). Nadie puede escribir en
  `points`, `current_streak`, `role` desde el cliente — esos campos solo se tocan por
  Edge Function con `service_role`.
- `attendances`: insert solo permitido a través de Edge Function (no INSERT directo de
  usuarios ni siquiera admin desde el cliente, para mantener validación centralizada).
- `points_ledger`: SELECT solo de las filas propias (`user_id = auth.uid()`). INSERT
  bloqueado para clientes; solo Edge Function.
- `referrals`: SELECT de filas donde el usuario es `inviter_id` o `invited_id`. INSERT
  vía Edge Function durante el registro.

## 5. Edge Functions (lógica de negocio centralizada)

1. **`register-with-invite`**: crea el perfil, valida/consume código de invitación,
   genera código propio, verifica dominio `.edu.pe` para bonus, crea fila en `referrals`
   si aplica, otorga puntos iniciales de "referral_signup" al inviter vía `points_ledger`.
2. **`mark-attendance`** (solo invocable por role admin): recibe el QR/id del cliente,
   inserta en `attendances`, calcula racha (si la última asistencia fue dentro de los
   últimos 7 días, incrementa `current_streak`; si no, resetea a 1), otorga puntos de
   asistencia + bonus de racha si aplica, y si el usuario tenía un `referrals.status =
   'signed_up'` pendiente como invitado, lo marca `'attended'` y otorga puntos
   adicionales al inviter (`referral_attendance`).
3. **`get-my-stats`**: devuelve puntos, racha, código de invitación y QR del usuario
   autenticado (lectura agregada, evita exponer `points_ledger` completo al cliente).

## 6. Seguridad y privacidad (mínimo viable, sin certificación formal)

- Passwords: manejados por Supabase Auth (hash automático, no reinventar).
- Cifrado en tránsito y reposo: por defecto en Supabase.
- Minimización de datos: solo correo, username, password, código de invitación opcional.
  Nada de teléfono ni dirección en V1.
- Aviso de privacidad simple + checkbox de consentimiento en el registro (requisito de
  la Ley 29733 de Protección de Datos Personales del Perú, no solo buena práctica).
- Rate limiting básico en registro (Supabase Auth ya limita intentos; reforzar en Edge
  Function si se detecta abuso de códigos de invitación).
- Definir de antemano qué pasa con los datos si el piloto no continúa (ej. borrado a
  los 30 días de finalizado si Zahir no aprueba seguir).

## 7. Riesgos conocidos a vigilar

- **Factor de conversión real de referidos.** No asumir crecimiento exponencial
  garantizado — medir cuántos invitados realmente asisten, no solo se registran.
- **Fraude de puntos:** cuentas falsas, correos desechables simulando `.edu.pe`. Mitigado
  parcialmente porque solo Zahir marca asistencia física (no autoservicio).
- **Adopción por parte de Zahir:** el panel de escaneo debe ser trivial de usar en medio
  de atención al cliente, o no se va a usar consistentemente.
