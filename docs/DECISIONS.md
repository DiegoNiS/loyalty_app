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

---

### ADR-002: Reglas Dinámicas de Puntos, Historial Kardex y Catálogo de Premios
* **Estado:** Aceptado
* **Fecha:** 2026-10-03
* **Autores:** Diego Nina, Antigravity Agent

#### Contexto
Los valores en puntos (ej. 10 puntos por asistencia, 10 por correo .edu.pe) se encontraban definidos estáticamente en código. Esto impedía lanzar promociones temporales (ej. asistencias valen 20 puntos los fines de semana), auditar cambios en el valor de las reglas, o permitir que los clientes conozcan el catálogo de premios canjeables.

#### Decisión
1. Crear las tablas `point_rules` y `point_rule_history` (Kardex):
   - `point_rules`: Almacena el valor activo de cada regla (`attendance`, `edu_bonus`, `referral_signup`, etc.) con soporte para fechas de vigencia (`effective_from`, `effective_to`).
   - `point_rule_history`: Registra la auditoría completa de modificaciones (valor anterior, nuevo valor, admin responsable y descripción del cambio).
2. Crear las tablas `rewards` y `reward_redemptions`:
   - `rewards`: Catálogo de premios disponibles (ej: copa artesanal, 10% descuento en botella, cata guiada) con costo en puntos y stock opcional.
   - `reward_redemptions`: Registro y auditoría de canjes realizados por los clientes y verificados por el administrador (Zahir).
3. Implementar la función PL/pgSQL `public.get_active_rule_points(rule_code)` para consultar el puntaje activo dinámicamente según la fecha actual.

#### Consecuencias / Alternativas Consideradas
* **Pros:**
  - Flexibilidad total para cambiar o programar valores de puntos sin tocar código ni redesplegar.
  - Trazabilidad y kardex completo de cambios de reglas con auditoría de administradores (`changed_by`).
  - Catálogo claro de recompensas para que el usuario conozca en qué puede gastar sus puntos.
* **Contras / Riesgos:**
  - Ligero incremento en la complejidad de las consultas SQL al validar reglas vigentes por rango de fechas.
* **Alternativas rechazadas:**
  - Mantener constantes numéricas en el código TypeScript / SQL (se descartó por falta de flexibilidad).
