-- Migración para soportar revocación de refresh tokens y versionado de tokens por usuario.
-- Ejecutar una sola vez en la base de datos.

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
