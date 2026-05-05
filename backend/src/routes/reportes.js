const express = require("express");
const router = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");

const {
  totalVendido,
  ventasPorFecha,
  topProductos,
  ventasMensuales
} = require("../controllers/reportesController");

/**
 * @swagger
 * tags:
 *   name: Reportes
 *   description: Reportes financieros y de ventas
 */


/* =========================
   TOTAL VENDIDO
========================= */
router.get(
  "/total",
  verifyToken,
  requireRole("admin"),
  totalVendido
);


/* =========================
   VENTAS POR FECHA
========================= */
router.get(
  "/por-fecha",
  verifyToken,
  requireRole("admin"),
  ventasPorFecha
);


/* =========================
   TOP PRODUCTOS
========================= */
router.get(
  "/top-productos",
  verifyToken,
  requireRole("admin"),
  topProductos
);


/* =========================
   VENTAS MENSUALES
========================= */
router.get(
  "/mensuales",
  verifyToken,
  requireRole("admin"),
  ventasMensuales
);

module.exports = router;