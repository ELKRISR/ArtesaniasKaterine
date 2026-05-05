/**
 * ==============================
 * CONTROLADOR DE WISHLIST
 * ==============================
 * Gestión de lista de deseos
 */

const pool = require('../models/db');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Agregar producto a wishlist
 */
const agregarAWishlist = async (req, res) => {
  const { productoId } = req.body;
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  if (!productoId) {
    return errorResponse(res, 'ID de producto requerido', 400);
  }

  try {
    // Verificar que el producto existe y está activo
    const [producto] = await pool.query(
      'SELECT id, activo FROM productos WHERE id = ?',
      [productoId]
    );
    
    if (producto.length === 0) {
      return errorResponse(res, 'Producto no encontrado', 404);
    }
    
    if (producto[0].activo === 0) {
      return errorResponse(res, 'Producto no disponible', 400);
    }

    // Insertar o ignorar si ya existe
    await pool.query(`
      INSERT IGNORE INTO wishlist (usuario_id, producto_id)
      VALUES (?, ?)
    `, [usuarioId, productoId]);

    return successResponse(res, { mensaje: 'Producto agregado a wishlist' });

  } catch (error) {
    console.error('Error agregando a wishlist:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

/**
 * Remover producto de wishlist
 */
const removerDeWishlist = async (req, res) => {
  const { productoId } = req.params;
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  try {
    const [result] = await pool.query(`
      DELETE FROM wishlist
      WHERE usuario_id = ? AND producto_id = ?
    `, [usuarioId, productoId]);

    if (result.affectedRows === 0) {
      return errorResponse(res, 'Producto no encontrado en wishlist', 404);
    }

    return successResponse(res, { mensaje: 'Producto removido de wishlist' });

  } catch (error) {
    console.error('Error removiendo de wishlist:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

/**
 * Obtener wishlist del usuario
 * CORREGIDO: Ahora usa JOIN con categorias en lugar de columna categoria
 */
const obtenerWishlist = async (req, res) => {
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  try {
    const [wishlist] = await pool.query(`
      SELECT 
        w.*,
        p.id as producto_id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen,
        p.stock,
        p.activo as producto_activo,
        c.id as categoria_id,
        c.nombre as categoria_nombre
      FROM wishlist w
      JOIN productos p ON w.producto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE w.usuario_id = ?
      ORDER BY w.creado_en DESC
    `, [usuarioId]);

    return successResponse(res, wishlist);

  } catch (error) {
    console.error('Error obteniendo wishlist:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

/**
 * Verificar si producto está en wishlist
 */
const verificarEnWishlist = async (req, res) => {
  const { productoId } = req.params;
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  try {
    const [result] = await pool.query(`
      SELECT COUNT(*) as count FROM wishlist
      WHERE usuario_id = ? AND producto_id = ?
    `, [usuarioId, productoId]);

    return successResponse(res, {
      enWishlist: result[0].count > 0
    });

  } catch (error) {
    console.error('Error verificando wishlist:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

module.exports = {
  agregarAWishlist,
  removerDeWishlist,
  obtenerWishlist,
  verificarEnWishlist
};