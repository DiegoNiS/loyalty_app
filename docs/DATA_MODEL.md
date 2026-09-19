# Modelo de Datos — Portal de Fidelización Vinos del Corazón

## Diagrama de Entidad-Relación (Mermaid)

```mermaid
erDiagram
    auth_users ||--|| profiles : "1:1 extends"
    profiles ||--o{ attendances : "has many (as user)"
    profiles ||--o{ attendances : "marked by (as admin)"
    event_labels ||--o{ attendances : "categorizes"
    profiles ||--o{ points_ledger : "has ledger entries"
    point_reasons ||--o{ points_ledger : "categorizes"
    attendances ||--o? points_ledger : "generates (attendance_id FK)"
    referrals ||--o? points_ledger : "generates (referral_id FK)"
    profiles ||--o{ referrals : "inviter of"
    profiles ||--o? referrals : "invited as"

    profiles {
        uuid id PK "auth.users.id"
        text username UNIQUE
        text role "client | admin"
        boolean email_edu_verified "true if email ends with .edu.pe"
        text invite_code UNIQUE
        uuid referred_by FK "profiles.id"
        integer points "Derived field, source of truth is points_ledger"
        integer current_streak "Weekly streak count"
        date last_attendance_date
        timestamptz created_at
    }

    event_labels {
        uuid id PK
        text code UNIQUE "regular_tasting | special_event | etc."
        text name
        text description
        timestamptz created_at
    }

    attendances {
        uuid id PK
        uuid user_id FK "profiles.id"
        uuid marked_by FK "profiles.id (admin)"
        text event_type "regular | special_event"
        uuid event_label_id FK "event_labels.id"
        timestamptz attended_at
    }

    point_reasons {
        uuid id PK
        text code UNIQUE "attendance | referral_signup | referral_attendance | streak_bonus | manual_adjustment"
        text name
        text description
        timestamptz created_at
    }

    points_ledger {
        uuid id PK
        uuid user_id FK "profiles.id"
        integer delta "Positive or negative points"
        uuid reason_id FK "point_reasons.id"
        uuid attendance_id FK "attendances.id (nullable)"
        uuid referral_id FK "referrals.id (nullable)"
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
*Nota: `email_edu_verified` es un flag booleano (para otorgar bono por correos universitarios `.edu.pe`). Cualquier tipo de correo electrónico puede registrarse.*

### 2. `event_labels` (Catálogo)
Tabla de catálogo para etiquetas textuales de eventos (ej: "Cata Regular", "Llamada al Poder"). Evita la redundancia de cadenas de texto y optimiza el almacenamiento.

### 3. `attendances`
Registro auditado de asistencias presenciales escaneadas por el administrador (Zahir), vinculado opcionalmente a un evento de `event_labels`.

### 4. `point_reasons` (Catálogo)
Tabla de catálogo para los motivos de acreditación/débito de puntos (ej: `attendance`, `referral_signup`, `referral_attendance`, `streak_bonus`, `manual_adjustment`).

### 5. `points_ledger`
Fuente de verdad inmutable de puntos. En lugar de un campo de referencia genérico polimórfico, utiliza **FKs explícitas** (`attendance_id`, `referral_id`) y una relación con `point_reasons`, garantizando integridad referencial estricta.

### 6. `referrals`
Seguimiento del ciclo de vida de los referidos desde su registro (`signed_up`) hasta su primera asistencia confirmada (`attended`).
