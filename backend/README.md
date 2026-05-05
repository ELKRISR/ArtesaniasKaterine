# Backend de Artesanías

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores para tu entorno.

- `PORT`: puerto donde corre el backend.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`: configuración de MySQL.
- `NODE_ENV`: `development` o `production`.
- `FORCE_SECURE_COOKIES`: `true`/`false` para forzar `secure` en cookies locales.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: secretos para los tokens JWT.
- `CSRF_SECRET`: secreto usado por `csrf-csrf` para proteger contra CSRF.
- `ALLOWED_ORIGINS`: lista de orígenes permitidos en producción.
- `SWAGGER_USER`, `SWAGGER_PASS`: credenciales de Swagger en producción.

## CSRF

Se añadió protección CSRF con `csrf-csrf` usando el patrón double submit cookie.

- La cookie CSRF se llama `__Host-psifi.x-csrf-token` en producción.
- En desarrollo con HTTP local la cookie se llama `psifi.x-csrf-token` para evitar requisitos de `secure`.
- Se emite un token CSRF en `/api/auth/csrf-token`.
- El frontend debe enviar el token en el header `x-csrf-token` para `/api/auth/refresh` y `/api/auth/logout`.

## Seguridad adicional

- `refresh` ahora usa rate limiting específico (`10 requests / 10 min`).
- `register` ahora usa rate limiting específico (`5 requests / 1 hora`) para prevenir enumeración masiva.
- El refresh token se rota en cada refresh exitoso.
- La cookie de refresh token está configurada con:
  - `httpOnly`
  - `sameSite: 'strict'`
  - `path: '/api/auth'`
  - `maxAge: 1 día`
  - `secure` en producción o si `FORCE_SECURE_COOKIES=true`
- Se añadió invalidación/rotación de refresh tokens usando blacklist con jti (JWT ID).
- Se añadió `token_version` para invalidar tokens antiguos tras cambios de rol/permiso.
- Política de contraseñas fortalecida: mínimo 10 caracteres, mayúscula, minúscula, número y símbolo especial.
- Verificación de contraseñas comprometidas usando Have I Been Pwned API con k-Anonymity.
- Respuesta genérica en registro para prevenir enumeración de usuarios.
- Sanitización mejorada de URLs para prevenir XSS.

## Migración de base de datos

Ejecuta `backend/migracion_auth_tokens.sql` en tu base de datos MySQL para crear la tabla de revocación y añadir la columna `token_version`:

```sql
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token VARCHAR(1024) NOT NULL, -- Almacena jti (JWT ID) o id de usuario como fallback
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_token (token),
  KEY idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 0;
```

## Desarrollo local

Si desarrollas en HTTP local, usa:

```bash
FORCE_SECURE_COOKIES=false npm run dev
```

En producción debes tener HTTPS para que las cookies `secure` funcionen correctamente.
