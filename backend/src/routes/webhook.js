const express = require("express");
const router = express.Router();

const { handleBoldWebhook } = require("../controllers/webhookController");

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Endpoints para webhooks de proveedores de pago
 */

/**
 * Webhook de Bold
 * Sin autenticación requerida (Bold lo valida con firma)
 */
router.post(
  "/bold",
  handleBoldWebhook
);

/**
 * @swagger
 * /webhook/bold:
 *   post:
 *     summary: Webhook de Bold para callbacks de pagos
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [payment.completed, payment.approved, payment.rejected, payment.pending]
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook procesado correctamente
 */

module.exports = router;
