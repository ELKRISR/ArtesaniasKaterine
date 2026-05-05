const express = require("express");
const router = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");

// 🔒 Validadores
const {
  crearPedidoValidator,
  crearStripeSessionValidator,
  idParamValidator,
  cambiarEstadoValidator
} = require('../validators/pedidoValidator');
const validate = require('../middlewares/validationResult');

const {
  crearPedido,
  crearPedidoPayUSession,
  handlePayUWebhook,
  listarPedidos,
  obtenerPedidoPorId,
  listarMisPedidos,
  cambiarEstadoPedido,
  pagarPedido,
  obtenerHistorialPedido,
  descargarFactura
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

/* =========================
   CREAR SESIÓN DE PAGO PAYU
========================= */
router.post(
  "/payu-session",
  verifyToken,
  crearStripeSessionValidator,
  validate,
  crearPedidoPayUSession
);

/**
 * @swagger
 * /pedidos/payu-session:
 *   post:
 *     summary: Crear un pedido y generar formulario de PayU para pago
 *     tags: [Pedidos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cliente:
 *                 type: object
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
 *                   $ref: '#/components/schemas/PedidoItem'
 *     responses:
 *       201:
 *         description: Parámetros de PayU generados exitosamente
 *       400:
 *         description: Datos inválidos
 */

router.post(
  "/webhook",
  handlePayUWebhook
);

/**
 * @swagger
 * /pedidos/webhook:
 *   post:
 *     summary: Endpoint de webhook para eventos de PayU
 *     tags: [Pedidos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento procesado correctamente
 *       400:
 *         description: Error de firma o payload inválido
 */

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
  obtenerHistorialPedido
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
  descargarFactura
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


/* =========================
   OBTENER POR ID
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