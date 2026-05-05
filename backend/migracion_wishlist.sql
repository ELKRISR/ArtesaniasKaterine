-- ===========================================
-- MIGRACIÓN: TABLA WISHLIST
-- ===========================================
-- Lista de deseos de los usuarios

CREATE TABLE IF NOT EXISTS wishlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    producto_id INT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Índices para optimización
    UNIQUE KEY unique_wishlist (usuario_id, producto_id),
    KEY idx_usuario (usuario_id),
    KEY idx_producto (producto_id),

    -- Foreign keys
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar algunos datos de ejemplo si la tabla está vacía
INSERT IGNORE INTO wishlist (usuario_id, producto_id) VALUES
(1, 1),
(1, 3),
(2, 2);