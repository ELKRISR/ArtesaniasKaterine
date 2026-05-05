/**
 * @fileoverview Utilidades para construir respuestas HTTP estandarizadas.
 *
 * Define el contrato de respuesta unificado que usa toda la API:
 *
 *   Éxito  → { success: true,  data: <payload> }
 *   Error  → { success: false, message: <descripción> }
 *
 * Centralizar las respuestas aquí garantiza que ningún controlador
 * construya JSON "a mano", lo que facilita cambiar la estructura
 * global en un solo lugar.
 *
 * @module utils/response
 */

/**
 * Envía una respuesta HTTP de éxito con estructura estándar.
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express.
 * @param {*}      data   - Payload a incluir en el campo `data`.
 *                          Puede ser un objeto, array, null, etc.
 * @param {number} [status=200] - Código HTTP de éxito (200, 201, 204, etc.).
 * @returns {import('express').Response} La respuesta enviada al cliente.
 *
 * @example
 * // En un controlador:
 * return successResponse(res, { id: 1, nombre: 'Mochila' }, 201);
 * // → HTTP 201 · { success: true, data: { id: 1, nombre: 'Mochila' } }
 */
const successResponse = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
  });
};

/**
 * Envía una respuesta HTTP de error con estructura estándar.
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express.
 * @param {string} message - Mensaje descriptivo del error (visible al cliente).
 * @param {number} [status=500] - Código HTTP de error (400, 401, 403, 404, 500, etc.).
 * @returns {import('express').Response} La respuesta enviada al cliente.
 *
 * @example
 * // En un controlador:
 * return errorResponse(res, 'Producto no encontrado', 404);
 * // → HTTP 404 · { success: false, message: 'Producto no encontrado' }
 */
const errorResponse = (res, message, status = 500) => {
  return res.status(status).json({
    success: false,
    message,
  });
};

module.exports = {
  successResponse,
  errorResponse,
};