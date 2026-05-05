const pool = require("../models/db");
const { successResponse, errorResponse } = require("../utils/response");

/* =========================
   TOTAL VENDIDO
========================= */
const totalVendido = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         IFNULL(SUM(total), 0) AS total_vendido
       FROM pedidos
       WHERE estado IN ('pagado', 'enviado')`
    );

    return successResponse(res, rows[0]);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   VENTAS POR FECHA
========================= */
const ventasPorFecha = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         DATE(fecha) AS fecha,
         SUM(total) AS total_dia
       FROM pedidos
       WHERE estado IN ('pagado', 'enviado')
       GROUP BY DATE(fecha)
       ORDER BY DATE(fecha) DESC`
    );

    return successResponse(res, rows);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   TOP PRODUCTOS VENDIDOS
========================= */
const topProductos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         p.id,
         p.nombre,
         SUM(dp.cantidad) AS total_vendido
       FROM detalle_pedido dp
       JOIN pedidos pe ON dp.pedido_id = pe.id
       JOIN productos p ON dp.producto_id = p.id
       WHERE pe.estado IN ('pagado', 'enviado')
       GROUP BY p.id, p.nombre
       ORDER BY total_vendido DESC
       LIMIT 10`
    );

    return successResponse(res, rows);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   VENTAS MENSUALES
========================= */
const ventasMensuales = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
         YEAR(fecha) AS año,
         MONTH(fecha) AS mes,
         SUM(total) AS total_mes
       FROM pedidos
       WHERE estado IN ('pagado', 'enviado')
       GROUP BY YEAR(fecha), MONTH(fecha)
       ORDER BY año DESC, mes DESC`
    );

    return successResponse(res, rows);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


module.exports = {
  totalVendido,
  ventasPorFecha,
  topProductos,
  ventasMensuales
};