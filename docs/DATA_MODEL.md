# Modelo de Datos — Portal de Fidelización Vinos del Corazón

## Diagramas del Esquema de Base de Datos

### Option 1: PlantUML ERD Diagram

```plantuml
@startuml
skinparam handwritten false
skinparam monochrome false
skinparam packageStyle rect

entity "auth_users" as auth_users {
  * id : uuid <<PK>>
  --
  email : text
  created_at : timestamptz
}

entity "profiles" as profiles {
  * id : uuid <<PK, FK>>
  --
  username : text <<UNIQUE>>
  role : text
  email_edu_verified : boolean
  invite_code : text <<UNIQUE>>
  referred_by : uuid <<FK>>
  points : integer
  current_streak : integer
  last_attendance_date : date
  created_at : timestamptz
}

entity "point_rules" as point_rules {
  * id : uuid <<PK>>
  --
  code : text <<UNIQUE>>
  name : text
  description : text
  points_value : integer
  is_active : boolean
  effective_from : timestamptz
  effective_to : timestamptz
}

entity "point_rule_history" as point_rule_history {
  * id : uuid <<PK>>
  --
  rule_id : uuid <<FK>>
  old_points_value : integer
  new_points_value : integer
  changed_by : uuid <<FK>>
  reason_description : text
  effective_from : timestamptz
  created_at : timestamptz
}

entity "rewards" as rewards {
  * id : uuid <<PK>>
  --
  name : text
  description : text
  points_cost : integer
  stock : integer
  is_active : boolean
}

entity "reward_redemptions" as reward_redemptions {
  * id : uuid <<PK>>
  --
  user_id : uuid <<FK>>
  reward_id : uuid <<FK>>
  points_spent : integer
  status : text
  redeemed_by : uuid <<FK>>
  redeemed_at : timestamptz
  created_at : timestamptz
}

entity "event_labels" as event_labels {
  * id : uuid <<PK>>
  --
  code : text <<UNIQUE>>
  name : text
  description : text
}

entity "attendances" as attendances {
  * id : uuid <<PK>>
  --
  user_id : uuid <<FK>>
  marked_by : uuid <<FK>>
  event_type : text
  event_label_id : uuid <<FK>>
  attended_at : timestamptz
}

entity "point_reasons" as point_reasons {
  * id : uuid <<PK>>
  --
  code : text <<UNIQUE>>
  name : text
  description : text
}

entity "points_ledger" as points_ledger {
  * id : uuid <<PK>>
  --
  user_id : uuid <<FK>>
  delta : integer
  reason_id : uuid <<FK>>
  attendance_id : uuid <<FK>>
  referral_id : uuid <<FK>>
  created_at : timestamptz
}

entity "referrals" as referrals {
  * id : uuid <<PK>>
  --
  inviter_id : uuid <<FK>>
  invited_id : uuid <<FK, UNIQUE>>
  status : text
  created_at : timestamptz
  attended_at : timestamptz
}

auth_users ||--|| profiles
profiles ||--o{ attendances : user
profiles ||--o{ attendances : marked_by
event_labels ||--o{ attendances
profiles ||--o{ points_ledger
point_reasons ||--o{ points_ledger
attendances ||--o| points_ledger
referrals ||--o| points_ledger
profiles ||--o{ referrals : inviter
profiles ||--o| referrals : invited
point_rules ||--o{ point_rule_history
profiles ||--o{ point_rule_history : changed_by
profiles ||--o{ reward_redemptions : user
rewards ||--o{ reward_redemptions
profiles ||--o{ reward_redemptions : redeemed_by
@enduml
```

---

### Option 2: Diagrama de Entidad-Relación (Mermaid Limpio)

```mermaid
erDiagram
    auth_users ||--|| profiles : extends
    profiles ||--o{ attendances : has_attendance
    profiles ||--o{ attendances : marked_by_admin
    event_labels ||--o{ attendances : label
    profiles ||--o{ points_ledger : has_ledger
    point_reasons ||--o{ points_ledger : reason
    attendances ||--o| points_ledger : attendance_fk
    referrals ||--o| points_ledger : referral_fk
    profiles ||--o{ referrals : inviter
    profiles ||--o| referrals : invited
    point_rules ||--o{ point_rule_history : history
    profiles ||--o{ point_rule_history : changed_by
    profiles ||--o{ reward_redemptions : requested_by
    rewards ||--o{ reward_redemptions : item
    profiles ||--o{ reward_redemptions : approved_by

    profiles {
        uuid id PK
        string username
        string role
        boolean email_edu_verified
        string invite_code
        uuid referred_by FK
        int points
        int current_streak
        date last_attendance_date
        datetime created_at
    }

    point_rules {
        uuid id PK
        string code
        string name
        string description
        int points_value
        boolean is_active
        datetime effective_from
        datetime effective_to
    }

    point_rule_history {
        uuid id PK
        uuid rule_id FK
        int old_points_value
        int new_points_value
        uuid changed_by FK
        string reason_description
        datetime effective_from
        datetime created_at
    }

    rewards {
        uuid id PK
        string name
        string description
        int points_cost
        int stock
        boolean is_active
    }

    reward_redemptions {
        uuid id PK
        uuid user_id FK
        uuid reward_id FK
        int points_spent
        string status
        uuid redeemed_by FK
        datetime redeemed_at
        datetime created_at
    }

    event_labels {
        uuid id PK
        string code
        string name
        string description
    }

    attendances {
        uuid id PK
        uuid user_id FK
        uuid marked_by FK
        string event_type
        uuid event_label_id FK
        datetime attended_at
    }

    point_reasons {
        uuid id PK
        string code
        string name
        string description
    }

    points_ledger {
        uuid id PK
        uuid user_id FK
        int delta
        uuid reason_id FK
        uuid attendance_id FK
        uuid referral_id FK
        datetime created_at
    }

    referrals {
        uuid id PK
        uuid inviter_id FK
        uuid invited_id FK
        string status
        datetime created_at
        datetime attended_at
    }
```

---

## Descripción de Tablas

### 1. `profiles`
Extensión 1:1 de `auth.users`. Guarda metadatos de usuario, rol, código de invitación propio, conteo de racha actual y total acumulado de puntos.

### 2. `point_rules` & `point_rule_history` (Reglas y Kardex)
Permite configurar el valor en puntos de cada tipo de acción (`attendance`, `edu_bonus`, `referral_signup`, etc.) de forma dinámica con vigencia de fechas y auditoría de modificaciones de administrador.

### 3. `rewards` & `reward_redemptions` (Catálogo y Canjes)
Catálogo de premios disponibles (`rewards`) e historial de canjes validados por el administrador (`reward_redemptions`).

### 4. `attendances` & `event_labels`
Registro auditado de asistencias presenciales clasificadas según catálogos de eventos.

### 5. `points_ledger` & `point_reasons`
Fuente de verdad contable inmutable para todo incremento o descuento de puntos.
