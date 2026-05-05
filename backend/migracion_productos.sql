-- ============================================================
-- Migración: Agregar columnas faltantes a la tabla productos
-- ============================================================
-- Este script agrega dos columnas que faltaban en la tabla:
-- 1. categoria  → Para clasificar productos
-- 2. imagen     → Para almacenar URLs de imágenes
-- ============================================================

-- Verificar que la tabla existe
USE artesanias_db;

-- Agregar columna 'categoria' si no existe
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) NULL COMMENT 'Categoría del producto (Ej: Textiles, Cerámica, Joyería)';

-- Agregar columna 'imagen' si no existe  
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen VARCHAR(500) NULL COMMENT 'URL pública de la imagen del producto';

-- Mostrar estructura actualizada
DESCRIBE productos;
