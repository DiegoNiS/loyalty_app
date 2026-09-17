# Modelo de Datos — Portal de Fidelización Vinos del Corazón

## Diagrama de Entidad-Relación (Mermaid)

```mermaid
erDiagram
    auth_users ||--|| profiles : "1:1 extends"
    profiles ||--o{ attendances : "has many (as user)"
    profiles ||--o{ attendances : "marked by (as admin)"
    profiles ||--o{ points_ledger : "has ledger entries"
    profiles ||--o{ referrals : "inviter of"
    profiles ||--o? referrals : "invited as"

    profiles {
        uuid id PK "auth.users.id"
        text username UNIQUE
        text role "client | admin"
        boolean email_edu_verified
        text invite_code UNIQUE
        uuid referred_by FK "profiles.id"
        integer points "Derived field, source of truth is points_ledger"
        integer current_streak "Weekly streak count"
        date last_attendance_date
        timestamptz created_at
    }

    attendances {
        uuid id PK
        uuid user_id FK "profiles.id"
        uuid marked_by FK "profiles.id (admin)"
        timestamptz attended_at
        text event_type "regular | special_event"
        text event_label
    }

    points_ledger {
        uuid id PK
        uuid user_id FK "profiles.id"
        integer delta "Positive or negative points"
        text reason "attendance | referral_signup | referral_attendance | streak_bonus | manual_adjustment"
        uuid reference_id "FK to attendances.id or referrals.id"
        timestamptz created_at
    }

    referrals {
        uuid id PK
        uuid inviter_id FK "profiles.id"
        uuid invited_id FK "profiles.id UNIQUE"
        text status "signed_up | attended"
        timestamptz created_at
        timestamptz attended_at
    }
```

## Descripción de Tablas

### 1. `profiles`
Extensión 1:1 de `auth.users`. Guarda metadatos de usuario, rol, código de invitación propio, conteo de racha actual y total acumulado de puntos.
*Nota: `points` y `current_streak` son campos derivados que solo pueden mutarse mediante Edge Functions con `service_role`.*

### 2. `attendances`
Registro auditado de asistencias presenciales escaneadas por el administrador (Zahir).

### 3. `points_ledger`
Fuente de verdad inmutable de puntos. Todo cambio de puntos (positivo o negativo) genera un registro contable con su motivo (`reason`) y referencia opcional (`reference_id`).

### 4. `referrals`
Seguimiento del ciclo de vida de los referidos desde su registro (`signed_up`) hasta su primera asistencia confirmada (`attended`).
