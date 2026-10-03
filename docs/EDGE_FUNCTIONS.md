# Documentación de Edge Functions y Endpoints — Portal Vinos del Corazón

Este documento detalla todas las **Edge Functions de Supabase** (funciones serverless en Deno) que sirven como capa de backend centralizada para el portal de fidelización Vinos del Corazón V1.

---

## 🔒 Arquitectura de Seguridad
Toda la lógica sensible (mutación de puntos, asignación de rachas, canjes y permisos de administración) vive exclusivamente en estas Edge Functions ejecutadas con la clave `SUPABASE_SERVICE_ROLE_KEY`. El cliente frontend **nunca escribe ni calcula puntos directamente en Postgres**.

---

## 📑 Catálogo de Edge Functions (Endpoints)

### 1. `register-with-invite`
- **Ruta**: `POST /functions/v1/register-with-invite`
- **Acceso**: Público / Autenticado (Durante el Registro)
- **Propósito**: Inicializa el perfil de fidelización de un nuevo cliente, valida el código de invitación opcional de un amigo y aplica los bonos de bienvenida.
- **Payload Request**:
  ```json
  {
    "userId": "uuid-del-usuario-auth",
    "username": "diegonina",
    "email": "diego@unsa.edu.pe",
    "inviteCode": "AMIGO12" // Opcional
  }
  ```
- **Respuesta (200 OK)**:
  ```json
  {
    "success": true,
    "inviteCode": "DIE4821",
    "isEduVerified": true,
    "pointsEarned": 10
  }
  ```
- **Lógica Interna**:
  1. Verifica si el correo termina en `.edu.pe` (bono institucional).
  2. Genera un código de invitación único de 6 caracteres.
  3. Si se incluyó un `inviteCode` válido, vincula al invitante en la tabla `referrals` (estado `signed_up`).
  4. Acredita los puntos iniciales al invitante en `points_ledger` por invitar un nuevo amigo.

---

### 2. `mark-attendance`
- **Ruta**: `POST /functions/v1/mark-attendance`
- **Acceso**: Restringido (**Solo Administrador / Zahir**)
- **Propósito**: Registra la asistencia presencial de un cliente escaneando su QR, calcula su racha semanal y otorga los puntos correspondientes.
- **Cabeceras obligatorias**: `Authorization: Bearer <JWT_DEL_ADMIN>`
- **Payload Request**:
  ```json
  {
    "targetUserId": "uuid-del-cliente",
    "eventTypeCode": "regular_tasting" // O 'special_event'
  }
  ```
- **Respuesta (200 OK)**:
  ```json
  {
    "success": true,
    "pointsAwarded": 15,
    "newStreak": 3
  }
  ```
- **Lógica Interna**:
  1. Verifica que el usuario que llama la función tenga `role = 'admin'`.
  2. Evalúa la fecha de la última asistencia en UTC:
     - Si es dentro de 7 días: incrementa la racha (`+1`).
     - Si pasaron más de 7 días: reinicia la racha a 1.
  3. Inserta registro en `attendances`.
  4. Consulta el valor activo en `point_rules` e inserta entradas en `points_ledger` (asistencia + bono racha).
  5. Si el cliente tenía una invitación pendiente (`signed_up`), actualiza su estado a `attended` y acredita los puntos de referido asistido al invitante.

---

### 3. `get-my-stats`
- **Ruta**: `GET /functions/v1/get-my-stats`
- **Acceso**: Usuario Autenticado (Cliente o Admin)
- **Propósito**: Retorna el resumen consolidado del perfil del cliente, su racha, saldo de puntos y la cadena payload para generar su código QR.
- **Cabeceras obligatorias**: `Authorization: Bearer <JWT_DEL_USUARIO>`
- **Respuesta (200 OK)**:
  ```json
  {
    "success": true,
    "stats": {
      "userId": "uuid-del-usuario",
      "username": "diegonina",
      "role": "client",
      "points": 120,
      "currentStreak": 4,
      "inviteCode": "DIE4821",
      "emailEduVerified": true,
      "lastAttendanceDate": "2026-10-02",
      "qrPayload": "{\"userId\":\"...\",\"username\":\"diegonina\"}"
    }
  }
  ```

---

### 4. `redeem-reward`
- **Ruta**: `POST /functions/v1/redeem-reward`
- **Acceso**: Usuario Autenticado (Cliente)
- **Propósito**: Procesa la solicitud de canje de un premio disponible en el catálogo `rewards`.
- **Cabeceras obligatorias**: `Authorization: Bearer <JWT_DEL_USUARIO>`
- **Payload Request**:
  ```json
  {
    "rewardId": "uuid-del-premio"
  }
  ```
- **Respuesta (200 OK)**:
  ```json
  {
    "success": true,
    "message": "¡Solicitud de canje creada! Presenta tu pantalla a Zahir para recibir tu premio.",
    "redemptionId": "uuid-del-canje",
    "remainingPoints": 40
  }
  ```
- **Lógica Interna**:
  1. Verifica disponibilidad y stock del premio en `rewards`.
  2. Valida que el saldo de puntos sea mayor o igual al costo (`points_cost`).
  3. Inserta el canje en `reward_redemptions` (estado `pending`).
  4. Registra en `points_ledger` una entrada con delta negativo (`-points_cost`) y descuenta el saldo del perfil.

---

### 5. `update-point-rule`
- **Ruta**: `POST /functions/v1/update-point-rule`
- **Acceso**: Restringido (**Solo Administrador / Zahir / Duhvia**)
- **Propósito**: Permite cambiar el valor en puntos de cualquier regla activa o programar un cambio futuro, manteniendo una auditoría inmutable Kardex.
- **Cabeceras obligatorias**: `Authorization: Bearer <JWT_DEL_ADMIN>`
- **Payload Request**:
  ```json
  {
    "ruleCode": "attendance",
    "newPointsValue": 20,
    "reasonDescription": "Promoción Especial Fin de Semana",
    "effectiveFrom": "2026-10-10T00:00:00Z" // Opcional (Fecha futura)
  }
  ```
- **Respuesta (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Regla 'attendance' actualizada con éxito de 10 a 20 puntos. Auditoría Kardex registrada.",
    "oldValue": 10,
    "newValue": 20
  }
  ```
- **Lógica Interna**:
  1. Valida el rol `admin`.
  2. Obtiene el valor anterior de la regla.
  3. Registra el historial de auditoría en la tabla `point_rule_history` (Kardex).
  4. Actualiza el valor activo y la fecha de vigencia en `point_rules`.
