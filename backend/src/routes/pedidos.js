const express = require("express");
const router = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");

// 🔒 Validadores
const {
  crearPedidoValidator,
  idParamValidator,
  cambiarEstadoValidator,
  crearBoldSessionValidator
} = require('../validators/pedidoValidator');
const validate = require('../middlewares/validationResult');

const {
  crearPedido,
  listarPedidos,
  obtenerPedidoPorId,
  listarMisPedidos,
  cambiarEstadoPedido,
  pagarPedido,
  crearPedidoBoldSession,
  obtenerBoldPaymentIntent,
  procesarPagoBold,
  obtenerEstadoPagoBold
} = require("../controllers/pedidosController");

/**
 * @swagger
 * tags:
 *   name: Pedidos
 *   description: Endpoints para gestión de pedidos
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PedidoItem:
 *       type: object
 *       required:
 *         - productoId
 *         - cantidad
 *       properties:
 *         productoId:
 *           type: integer
 *         cantidad:
 *           type: integer
 *
 *     CreatePedido:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PedidoItem'
 *
 *     UpdateEstadoPedido:
 *       type: object
 *       required:
 *         - estado
 *       properties:
 *         estado:
 *           type: string
 *
 *     Pedido:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         usuario_id:
 *           type: integer
 *         total:
 *           type: number
 *         estado:
 *           type: string
 *         fecha:
 *           type: string
 *           format: date-time
 */


/* =========================
   CREAR PEDIDO (CLIENTE)
========================= */
router.post("/", verifyToken, crearPedidoValidator, validate, crearPedido);

/**
 * @swagger
 * /pedidos:
 *   post:
 *     summary: Crear un nuevo pedido (cliente)
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePedido'
 *     responses:
 *       201:
 *         description: Pedido creado exitosamente
 *       400:
 *         description: Datos inválidos
 */


/* =========================
   CREAR SESIÓN DE PAGO BOLD
========================= */
router.post("/bold-session", verifyToken, crearBoldSessionValidator, validate, crearPedidoBoldSession);

/**
 * @swagger
 * /pedidos/bold-session:
 *   post:
 *     summary: Crear sesión de pago con Bold
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cliente
 *               - items
 *             properties:
 *               cliente:
 *                 type: object
 *                 required:
 *                   - nombre
 *                   - email
 *                   - direccion
 *                   - telefono
 *                 properties:
 *                   nombre:
 *                     type: string
 *                   email:
 *                     type: string
 *                   direccion:
 *                     type: string
 *                   telefono:
 *                     type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - productoId
 *                     - cantidad
 *                   properties:
 *                     productoId:
 *                       type: integer
 *                     cantidad:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Sesión de pago creada exitosamente
 *       400:
 *         description: Datos inválidos
 */


/* =========================
   LISTAR TODOS (ADMIN)
========================= */
router.get(
  "/",
  verifyToken,
  requireRole("admin"),
  listarPedidos
);

/**
 * @swagger
 * /pedidos:
 *   get:
 *     summary: Listar todos los pedidos (admin)
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos
 */


/* =========================
   LISTAR MIS PEDIDOS
========================= */
router.get(
  "/mis-pedidos",
  verifyToken,
  listarMisPedidos
);

/**
 * @swagger
 * /pedidos/mis-pedidos:
 *   get:
 *     summary: Listar pedidos del usuario autenticado
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pedidos del usuario
 */


/* =========================
   HISTORIAL
========================= */
router.get(
  "/:id/historial",
  verifyToken,
  idParamValidator,
  validate,
  (req, res) => {
    // TODO: Implementar obtenerHistorialPedido
    return res.status(501).json({ message: "Funcionalidad no implementada aún" });
  }
);

/**
 * @swagger
 * /pedidos/{id}/historial:
 *   get:
 *     summary: Obtener historial de cambios del pedido
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Historial del pedido
 */


/* =========================
   DESCARGAR FACTURA
========================= */
router.get(
  "/:id/factura",
  verifyToken,
  idParamValidator,
  validate,
  (req, res) => {
    // TODO: Implementar descargarFactura
    return res.status(501).json({ message: "Funcionalidad no implementada aún" });
  }
);

/**
 * @swagger
 * /pedidos/{id}/factura:
 *   get:
 *     summary: Descargar factura en PDF
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Archivo PDF de la factura
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */


/* =========================
   PAGAR PEDIDO
========================= */
router.post(
  "/:id/pagar",
  verifyToken,
  idParamValidator,
  validate,
  pagarPedido
);

/**
 * @swagger
 * /pedidos/{id}/pagar:
 *   post:
 *     summary: Simular pago de un pedido
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Pago realizado
 */


/* =========================
   CAMBIAR ESTADO (ADMIN)
========================= */
router.patch(
  "/:id/estado",
  verifyToken,
  requireRole("admin"),
  cambiarEstadoValidator,
  validate,
  cambiarEstadoPedido
);

/**
 * @swagger
 * /pedidos/{id}/estado:
 *   patch:
 *     summary: Cambiar estado del pedido (admin)
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEstadoPedido'
 *     responses:
 *       200:
 *         description: Estado cambiado
 */


/* =========================   OBTENER INTENCIÓN DE PAGO BOLD
========================= */
router.get(
  "/bold-payment-intent/:referenceId",
  verifyToken,
  obtenerBoldPaymentIntent
);

/* =========================
   PROCESAR PAGO BOLD
========================= */
router.post(
  "/procesar-bold-payment",
  verifyToken,
  procesarPagoBold
);

/* =========================
   OBTENER ESTADO DE PAGO BOLD
========================= */
router.get(
  "/bold-payment-status/:referenceId",
  verifyToken,
  obtenerEstadoPagoBold
);


/* =========================   OBTENER POR ID
========================= */
router.get(
  "/:id",
  verifyToken,
  idParamValidator,
  validate,
  obtenerPedidoPorId
);

/**
 * @swagger
 * /pedidos/{id}:
 *   get:
 *     summary: Obtener pedido por ID
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Pedido encontrado
 */

module.exports = router;