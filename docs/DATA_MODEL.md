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

    point_rules ||--o{ point_rule_history : "tracks changes (kardex)"
    profiles ||--o{ point_rule_history : "changed by (admin)"
    profiles ||--o{ reward_redemptions : "requests redemption"
    rewards ||--o{ reward_redemptions : "redeemed item"
    profiles ||--o{ reward_redemptions : "redeemed by (admin)"

    profiles {
        uuid id PK "auth.users.id"
        text username UNIQUE
        text role "client | admin"
        boolean email_edu_verified
        text invite_code UNIQUE
        uuid referred_by FK "profiles.id"
        integer points "Derived field, source of truth is points_ledger"
        integer current_streak
        date last_attendance_date
        timestamptz created_at
    }

    point_rules {
        uuid id PK
        text code UNIQUE "attendance | edu_bonus | referral_signup | referral_attendance | streak_bonus"
        text name
        text description
        integer points_value "Active point value"
        boolean is_active
        timestamptz effective_from
        timestamptz effective_to
    }

    point_rule_history {
        uuid id PK
        uuid rule_id FK "point_rules.id"
        integer old_points_value
        integer new_points_value
        uuid changed_by FK "profiles.id"
        text reason_description
        timestamptz effective_from
        timestamptz created_at
    }

    rewards {
        uuid id PK
        text name
        text description
        integer points_cost
        integer stock
        boolean is_active
    }

    reward_redemptions {
        uuid id PK
        uuid user_id FK "profiles.id"
        uuid reward_id FK "rewards.id"
        integer points_spent
        text status "pending | redeemed | cancelled"
        uuid redeemed_by FK "profiles.id (admin)"
        timestamptz redeemed_at
        timestamptz created_at
    }

    event_labels {
        uuid id PK
        text code UNIQUE
        text name
        text description
    }

    attendances {
        uuid id PK
        uuid user_id FK "profiles.id"
        uuid marked_by FK "profiles.id (admin)"
        text event_type
        uuid event_label_id FK "event_labels.id"
        timestamptz attended_at
    }

    point_reasons {
        uuid id PK
        text code UNIQUE
        text name
        text description
    }

    points_ledger {
        uuid id PK
        uuid user_id FK "profiles.id"
        integer delta
        uuid reason_id FK "point_reasons.id"
        uuid attendance_id FK "attendances.id"
        uuid referral_id FK "referrals.id"
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

## Descripción de Tablas Adicionales

### 1. `point_rules` (Reglas de Puntos Dinámicas)
Permite configurar el valor en puntos de cada tipo de acción (`attendance`, `edu_bonus`, `referral_signup`, etc.) de forma dinámica sin hardcodear números en el código. Soporta fechas de vigencia (`effective_from`, `effective_to`).

### 2. `point_rule_history` (Kardex / Historial de Cambios)
Registro inmutable de auditoría para cada modificación o reprogramación de una regla de puntos. Guarda el valor anterior, el nuevo valor, la descripción del motivo y la identidad del administrador que realizó el cambio (`changed_by`).

### 3. `rewards` (Catálogo de Premios)
Catálogo de premios y recompensas disponibles para canje con su costo en puntos (`points_cost`), descripción y control opcional de stock.

### 4. `reward_redemptions` (Historial de Canjes)
Registro de solicitudes y confirmaciones de canjes de premios por parte de los clientes, auditando qué administrador verificó la entrega presencial (`redeemed_by`).
