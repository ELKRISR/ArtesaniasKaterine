/**
 * @fileoverview Controlador para webhooks de Bold
 * Maneja callbacks y eventos de Bold
 */

const pool = require("../models/db");
const { successResponse, errorResponse } = require("../utils/response");
const { validateWebhookSignature, getPaymentStatus } = require("../utils/boldHelper");
const notificationService = require("../services/notificationService");
const emailService = require("../services/emailService");

const SYSTEM_USER_ID = Number(process.env.SYSTEM_USER_ID || 1);

/**
 * Webhook para recibir callbacks de Bold
 * Se ejecuta cuando Bold completa un pago
 */
const handleBoldWebhook = async (req, res) => {
  try {
        const signature = req.headers['x-bold-signature'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody) : req.body;

    // Validar firma del webhook
    if (!validateWebhookSignature(rawBody, signature, process.env.BOLD_SECRET_KEY)) {
      console.warn('Webhook signature validation failed');
      return errorResponse(res, "Firma inválida", 401);
    }

    const { event, data } = parsedBody;

    console.log(`[Bold Webhook] Evento recibido: ${event}`, data);

    let connection;

    switch (event) {
      case 'payment.completed':
      case 'payment.approved':
        // Extraer información del pago
        const { payment_intent_reference, status, id: transactionId } = data;

        if (!payment_intent_reference) {
          return errorResponse(res, "Payment intent reference requerido", 400);
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
          // Buscar la transacción en la BD
          const [transaction] = await connection.query(
            `SELECT * FROM transacciones_bold WHERE payment_intent_reference = ?`,
            [payment_intent_reference]
          );

          if (!transaction || !transaction[0]) {
            console.warn(`Transacción Bold no encontrada: ${payment_intent_reference}`);
            await connection.commit();
            return successResponse(res, { mensaje: "Transacción procesada" });
          }

          const transactionData = transaction[0];
          const { pedido_id, reference_id } = transactionData;

          // Actualizar estado de la transacción
          await connection.query(
            `UPDATE transacciones_bold 
             SET estado = ?, transaction_id = ?, respuesta_bold = ? 
             WHERE payment_intent_reference = ?`,
            ['completed', transactionId, JSON.stringify(data), payment_intent_reference]
          );

          // Actualizar pedido a pagado
          const [pedidoData] = await connection.query(
            `SELECT * FROM pedidos WHERE id = ?`,
            [pedido_id]
          );

          if (pedidoData[0]?.estado !== 'pagado') {
            const previousEstado = pedidoData[0]?.estado || 'pendiente';

            await connection.query(
              `UPDATE pedidos SET estado = ? WHERE id = ?`,
              ['pagado', pedido_id]
            );

            // Registrar en historial
            await connection.query(
              `INSERT INTO pedido_historial 
               (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
               VALUES (?, ?, ?, ?)`,
              [pedido_id, previousEstado, 'pagado', SYSTEM_USER_ID]
            );
          }

          await connection.commit();

          // Notificar
          notificationService.notifyPaymentReceived({
            ...pedidoData[0],
            metodo_pago: 'tarjeta',
            transaction_id: transactionId
          });

          // Enviar email
          const [userData] = await pool.query(
            "SELECT email FROM usuarios WHERE id = ?",
            [pedidoData[0].usuario_id]
          );

          if (userData[0]?.email) {
            await emailService.sendPaymentConfirmation(userData[0].email, pedidoData[0]);
          }

          return successResponse(res, { mensaje: "Pago procesado correctamente" });

        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          if (connection) connection.release();
        }

      case 'payment.rejected':
      case 'payment.failed':
      case 'payment.cancelled':
        // Manejar pago rechazado o cancelado
        const failedPaymentReference = data.payment_intent_reference;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
          const [transaction] = await connection.query(
            `SELECT * FROM transacciones_bold WHERE payment_intent_reference = ?`,
            [failedPaymentReference]
          );

          if (transaction && transaction[0]) {
            const transactionData = transaction[0];
            const pedidoId = transactionData.pedido_id;

            await connection.query(
              `UPDATE transacciones_bold 
               SET estado = ?, respuesta_bold = ? 
               WHERE payment_intent_reference = ?`,
              ['failed', JSON.stringify(data), failedPaymentReference]
            );

            const [pedidoRows] = await connection.query(
              `SELECT estado FROM pedidos WHERE id = ? FOR UPDATE`,
              [pedidoId]
            );

            if (pedidoRows[0] && pedidoRows[0].estado === 'pendiente') {
              await connection.query(
                `UPDATE pedidos SET estado = ? WHERE id = ?`,
                ['cancelado', pedidoId]
              );

              await connection.query(
                `INSERT INTO pedido_historial 
                 (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
                 VALUES (?, ?, ?, ?)`,
                [pedidoId, pedidoRows[0].estado, 'cancelado', SYSTEM_USER_ID]
              );

              const [detalle] = await connection.query(
                `SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?`,
                [pedidoId]
              );

              for (const item of detalle) {
                await connection.query(
                  `UPDATE productos SET stock = stock + ? WHERE id = ?`,
                  [item.cantidad, item.producto_id]
                );
              }
            }

            console.log(`[Bold] Pago rechazado/cancelado: ${failedPaymentReference}`);
          }

          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          if (connection) connection.release();
        }

        return successResponse(res, { mensaje: "Pago rechazado registrado" });

      case 'payment.pending':
        // Pago pendiente
        console.log(`[Bold] Pago pendiente: ${data.payment_intent_reference}`);
        return successResponse(res, { mensaje: "Pago pendiente registrado" });

      default:
        console.log(`[Bold] Evento no manejado: ${event}`);
        return successResponse(res, { mensaje: "Evento registrado" });
    }

  } catch (error) {
    console.error('Error en webhook Bold:', error);
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  handleBoldWebhook
};
