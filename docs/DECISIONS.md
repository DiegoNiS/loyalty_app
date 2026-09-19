# Architectural Decision Records (ADR) — Vinos del Corazón

## Formato ADR

### ADR-000: Plantilla / Template
* **Estado:** [Propuesto | Aceptado | Reemplazado]
* **Fecha:** YYYY-MM-DD
* **Autores:** [Nombres]

#### Contexto
¿Cuál es el problema o la necesidad que estamos abordando?

#### Decisión
¿Qué decisión tomamos?

#### Consecuencias / Alternativas Consideradas
* **Pros:**
* **Contras / Riesgos:**
* **Alternativas rechazadas:**

---

## Registro de Decisiones

### ADR-001: Normalización de Catálogos e Integridad Referencial en `points_ledger` y `attendances`
* **Estado:** Aceptado
* **Fecha:** 2026-09-19
* **Autores:** Diego Nina, Antigravity Agent

#### Contexto
En la propuesta inicial de esquema (`ARCHITECTURE.md`), el motivo de los puntos en `points_ledger` se manejaba con una restricción `CHECK` textual (`reason TEXT`), y la referencia a eventos/asistencias se basaba en un campo genérico `reference_id UUID` sin FK. Asimismo, los nombres de eventos en `attendances` usaban `event_label TEXT` directo.
Se identificó que esto introducía redundancia de almacenamiento y carecía de integridad referencial estricta a nivel de base de datos.

#### Decisión
1. Reemplazar `reference_id UUID` polimórfico en `points_ledger` por **FKs explícitas** (`attendance_id` y `referral_id`) hacia `attendances(id)` y `referrals(id)`.
2. Crear tablas de catálogo normalizadas:
   - `event_labels`: almacena los nombres y códigos de los eventos para evitar almacenar textos repetidos en cada asistencia.
   - `point_reasons`: almacena los códigos y descripciones de los motivos de puntos en lugar de usar cadenas sueltas o `CHECK` directo.

#### Consecuencias / Alternativas Consideradas
* **Pros:**
  - Integridad referencial estricta garantizada por Postgres (`ON DELETE SET NULL`).
  - Optimización de espacio en disco al usar referencias por UUID/FK en lugar de textos repetidos.
  - Escalabilidad para agregar nuevos motivos de puntos o tipos de eventos mediante inserts en catálogo sin alterar el esquema.
* **Contras / Riesgos:**
  - Requiere hacer JOINs a las tablas catálogo cuando se requiera el texto descriptivo en el cliente.
* **Alternativas rechazadas:**
  - Mantener `reference_id` genérico tipo ID polimórfico (se descartó por ser propenso a inconsistencias).
