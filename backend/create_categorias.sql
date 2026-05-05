-- ============================================================
-- Creación de tabla categorias para artesanías
-- ============================================================
-- Esta tabla almacena las categorías de productos artesanales
-- ============================================================

USE artesanias_db;

-- Crear tabla categorias si no existe
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar categorías básicas de artesanías si no existen
INSERT IGNORE INTO categorias (nombre, descripcion) VALUES
('Textiles', 'Artesanías textiles como tejidos, bordados y tapices'),
('Cerámica', 'Productos de cerámica como vasijas, platos y esculturas'),
('Joyería', 'Joyas y accesorios artesanales'),
('Madera', 'Trabajos en madera como muebles y decoraciones'),
('Cuero', 'Productos de cuero como bolsos y cinturones'),
('Vidrio', 'Artesanías en vidrio como lámparas y adornos'),
('Pintura', 'Pinturas y dibujos artesanales'),
('Escultura', 'Esculturas y figuras decorativas'),
('Otros', 'Otras categorías de artesanías');

-- Mostrar las categorías creadas
SELECT * FROM categorias;