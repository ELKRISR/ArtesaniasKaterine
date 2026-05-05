/**
 * ==============================
 * CONTROLADOR DE RESEÑAS
 * ==============================
 * Gestión de reseñas de productos
 */

const pool = require('../models/db');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Crear una reseña
 */
const crearReview = async (req, res) => {
  const { productoId, calificacion, comentario } = req.body;
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  if (!productoId || !calificacion) {
    return errorResponse(res, 'Producto y calificación son obligatorios', 400);
  }

  if (calificacion < 1 || calificacion > 5) {
    return errorResponse(res, 'Calificación debe estar entre 1 y 5', 400);
  }

  try {
    // Verificar que el usuario haya comprado el producto
    const [compra] = await pool.query(`
      SELECT dp.id FROM detalle_pedido dp
      JOIN pedidos p ON dp.pedido_id = p.id
      WHERE p.usuario_id = ? AND dp.producto_id = ? AND p.estado IN ('pagado', 'enviado', 'entregado')
      LIMIT 1
    `, [usuarioId, productoId]);

    const verificadoCompra = compra.length > 0;

    // Insertar o actualizar reseña
    const [result] = await pool.query(`
      INSERT INTO reviews (producto_id, usuario_id, calificacion, comentario, verificado_compra)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      calificacion = VALUES(calificacion),
      comentario = VALUES(comentario),
      creado_en = CURRENT_TIMESTAMP
    `, [productoId, usuarioId, calificacion, comentario || null, verificadoCompra]);

    return successResponse(res, {
      mensaje: 'Reseña guardada exitosamente',
      reviewId: result.insertId || 'actualizada'
    });

  } catch (error) {
    console.error('Error creando reseña:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

/**
 * Obtener reseñas de un producto
 */
const obtenerReviewsProducto = async (req, res) => {
  const { productoId } = req.params;

  if (!productoId) {
    return errorResponse(res, 'ID de producto requerido', 400);
  }

  try {
    const [reviews] = await pool.query(`
      SELECT r.*, u.nombre as usuario_nombre
      FROM reviews r
      JOIN usuarios u ON r.usuario_id = u.id
      WHERE r.producto_id = ?
      ORDER BY r.creado_en DESC
    `, [productoId]);

    // Calcular promedio
    const totalReviews = reviews.length;
    const promedio = totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.calificacion, 0) / totalReviews
      : 0;

    return successResponse(res, {
      reviews,
      estadisticas: {
        total: totalReviews,
        promedio: Math.round(promedio * 10) / 10,
        distribucion: {
          1: reviews.filter(r => r.calificacion === 1).length,
          2: reviews.filter(r => r.calificacion === 2).length,
          3: reviews.filter(r => r.calificacion === 3).length,
          4: reviews.filter(r => r.calificacion === 4).length,
          5: reviews.filter(r => r.calificacion === 5).length
        }
      }
    });

  } catch (error) {
    console.error('Error obteniendo reseñas:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

/**
 * Obtener reseñas del usuario actual
 */
const obtenerMisReviews = async (req, res) => {
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, 'Usuario no autenticado', 401);
  }

  try {
    const [reviews] = await pool.query(`
      SELECT r.*, p.nombre as producto_nombre, p.imagen as producto_imagen
      FROM reviews r
      JOIN productos p ON r.producto_id = p.id
      WHERE r.usuario_id = ?
      ORDER BY r.creado_en DESC
    `, [usuarioId]);

    return successResponse(res, { reviews });

  } catch (error) {
    console.error('Error obteniendo mis reseñas:', error);
    return errorResponse(res, 'Error interno del servidor', 500);
  }
};

module.exports = {
  crearReview,
  obtenerReviewsProducto,
  obtenerMisReviews
};