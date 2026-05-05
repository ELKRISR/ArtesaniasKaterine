/**
 * @fileoverview Controlador de productos — CRUD completo.
 * 
 * CORREGIDO: Ahora usa categoria_id en lugar de la columna categoria
 * Mantiene compatibilidad con la estructura actual de la BD
 */

const pool = require('../models/db');
const { successResponse, errorResponse } = require('../utils/response');

/* ── Helper: validar id numérico ───────────────────────────────────────── */
const parseId = (raw) => {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0 || String(n) !== String(raw)) return null;
  return n;
};

/* ── Helper: sanitizar string opcional ────────────────────────────────── */
const sanitizeOptional = (val) => {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/productos — CREAR PRODUCTO (solo admin)
════════════════════════════════════════════════════════════════════════ */
exports.crearProducto = async (req, res, next) => {
  try {
    const {
      nombre,
      descripcion,
      precio,
      stock,
      categoria_id,
      categoria,
      imagen_url,
      imagen,
    } = req.body;

    const imagenUrl = imagen_url || imagen;
    const usuarioId = req.usuario?.id || req.user?.id;

    // Determinar el ID de categoría válido.
    let categoriaId = categoria_id;
    if (!categoriaId && categoria) {
      const [categoriaMatches] = await pool.query(
        'SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?) AND activo = 1 LIMIT 1',
        [categoria.trim()]
      );
      if (categoriaMatches.length > 0) {
        categoriaId = categoriaMatches[0].id;
      }
    }

    // Validar que la categoría existe si se proporcionó
    if (categoriaId) {
      const [categoriaExists] = await pool.query(
        'SELECT id FROM categorias WHERE id = ? AND activo = 1',
        [categoriaId]
      );
      if (categoriaExists.length === 0) {
        return errorResponse(res, 'La categoría especificada no existe', 400);
      }
    }

    const [result] = await pool.query(
      `INSERT INTO productos
         (nombre, descripcion, precio, stock, categoria_id, imagen, usuario_id, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        nombre.trim(),
        sanitizeOptional(descripcion),
        precio,
        stock,
        categoriaId || null,
        sanitizeOptional(imagenUrl),
        usuarioId,
      ]
    );

    // Obtener el producto creado con su categoría
    const [newProduct] = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre, c.nombre as categoria
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = ?
    `, [result.insertId]);

    return successResponse(res, newProduct[0], 201);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/productos — LISTAR TODOS (público)
════════════════════════════════════════════════════════════════════════ */
exports.listarProductos = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.imagen,
        p.usuario_id,
        p.activo,
        p.categoria_id,
        c.nombre as categoria_nombre,
        c.nombre as categoria,
        c.descripcion as categoria_descripcion
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.activo = 1
      ORDER BY p.id DESC
    `);

    return successResponse(res, rows, 200);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/productos/:id — OBTENER POR ID (público)
════════════════════════════════════════════════════════════════════════ */
exports.obtenerProductoPorId = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return errorResponse(res, 'El ID del producto no es válido.', 400);
    }

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.imagen,
        p.usuario_id,
        p.activo,
        p.categoria_id,
        c.nombre as categoria_nombre,
        c.nombre as categoria
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = ?
    `, [id]);

    if (rows.length === 0) {
      return errorResponse(res, 'Producto no encontrado.', 404);
    }

    return successResponse(res, rows[0], 200);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/productos/mis-productos — MIS PRODUCTOS (autenticado)
════════════════════════════════════════════════════════════════════════ */
exports.listarMisProductos = async (req, res, next) => {
  try {
    const usuarioId = req.usuario?.id || req.user?.id;

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.imagen,
        p.usuario_id,
        p.activo,
        p.categoria_id,
        c.nombre as categoria_nombre,
        c.nombre as categoria
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.usuario_id = ?
      ORDER BY p.id DESC
    `, [usuarioId]);

    return successResponse(res, rows, 200);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   PUT /api/productos/:id — ACTUALIZAR PRODUCTO (solo admin)
════════════════════════════════════════════════════════════════════════ */
exports.actualizarProducto = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return errorResponse(res, 'El ID del producto no es válido.', 400);
    }

    const {
      nombre,
      descripcion,
      precio,
      stock,
      categoria_id,
      categoria,
      activo,
      imagen_url,
      imagen,
    } = req.body;
    const imagenUrl = imagen_url || imagen;

    // Validar que el producto existe
    const [existingProduct] = await pool.query(
      'SELECT id FROM productos WHERE id = ?',
      [id]
    );
    if (existingProduct.length === 0) {
      return errorResponse(res, 'Producto no encontrado.', 404);
    }

    // Determinar el ID de categoría válido.
    let categoriaId = categoria_id;
    if (!categoriaId && categoria) {
      const [categoriaMatches] = await pool.query(
        'SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?) AND activo = 1 LIMIT 1',
        [categoria.trim()]
      );
      if (categoriaMatches.length > 0) {
        categoriaId = categoriaMatches[0].id;
      }
    }

    // Validar que la categoría existe si se proporcionó
    if (categoriaId) {
      const [categoriaExists] = await pool.query(
        'SELECT id FROM categorias WHERE id = ?',
        [categoriaId]
      );
      if (categoriaExists.length === 0) {
        return errorResponse(res, 'La categoría especificada no existe', 400);
      }
    }

    const [result] = await pool.query(
      `UPDATE productos
       SET nombre = ?,
           descripcion = ?,
           precio = ?,
           stock = ?,
           categoria_id = ?,
           imagen = ?,
           activo = ?
       WHERE id = ?`,
      [
        nombre.trim(),
        sanitizeOptional(descripcion),
        precio,
        stock,
        categoriaId || null,
        sanitizeOptional(imagenUrl),
        activo !== undefined ? activo : 1,
        id,
      ]
    );

    // Obtener el producto actualizado
    const [updatedProduct] = await pool.query(`
      SELECT p.*, c.nombre as categoria_nombre, c.nombre as categoria
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = ?
    `, [id]);

    return successResponse(res, updatedProduct[0], 200);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   DELETE /api/productos/:id — ELIMINAR PRODUCTO (solo admin)
════════════════════════════════════════════════════════════════════════ */
exports.eliminarProducto = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return errorResponse(res, 'El ID del producto no es válido.', 400);
    }

    // Verificar si el producto tiene pedidos asociados
    const [pedidosAsociados] = await pool.query(
      'SELECT COUNT(*) as count FROM detalle_pedido WHERE producto_id = ?',
      [id]
    );

    if (pedidosAsociados[0].count > 0) {
      // Si tiene pedidos, solo lo desactivamos en lugar de eliminar
      await pool.query(
        'UPDATE productos SET activo = 0 WHERE id = ?',
        [id]
      );
      return successResponse(res, { 
        mensaje: 'Producto desactivado porque tiene pedidos asociados',
        desactivado: true 
      }, 200);
    }

    // Si no tiene pedidos, lo eliminamos físicamente
    const [result] = await pool.query(
      'DELETE FROM productos WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return errorResponse(res, 'Producto no encontrado.', 404);
    }

    return successResponse(res, { mensaje: 'Producto eliminado correctamente.' }, 200);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/productos/categorias — LISTAR CATEGORÍAS (público)
════════════════════════════════════════════════════════════════════════ */
exports.obtenerCategorias = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, nombre, descripcion
      FROM categorias
      WHERE activo = 1
      ORDER BY nombre ASC
    `);

    return successResponse(res, rows);

  } catch (error) {
    next(error);
  }
};

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/productos/por-categoria/:categoriaId — FILTRAR POR CATEGORÍA
════════════════════════════════════════════════════════════════════════ */
exports.productosPorCategoria = async (req, res, next) => {
  try {
    const categoriaId = parseId(req.params.categoriaId);
    if (!categoriaId) {
      return errorResponse(res, 'ID de categoría no válido', 400);
    }

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.imagen,
        p.usuario_id,
        p.categoria_id,
        c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.categoria_id = ? AND p.activo = 1
      ORDER BY p.nombre ASC
    `, [categoriaId]);

    return successResponse(res, rows);

  } catch (error) {
    next(error);
  }
};