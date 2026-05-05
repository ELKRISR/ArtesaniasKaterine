/**
 * @fileoverview Clase de error operacional personalizada para el sistema.
 *
 * Extiende la clase nativa Error de Node.js para incluir:
 *  - Un código HTTP de estado (statusCode)
 *  - Una bandera `isOperational` que distingue errores esperados
 *    (validaciones, recursos no encontrados, acceso denegado) de
 *    errores inesperados del sistema (bugs, fallos de infraestructura).
 *
 * El middleware `errorHandler.js` lee `err.statusCode` e `err.isOperational`
 * para decidir qué información exponer al cliente en producción.
 *
 * @module utils/AppError
 *
 * @example
 * // Lanzar un error operacional desde un controlador
 * const AppError = require('../utils/AppError');
 *
 * if (!usuario) {
 *   throw new AppError('Usuario no encontrado', 404);
 * }
 *
 * // El errorHandler lo captura y responde con:
 * // HTTP 404 → { success: false, message: 'Usuario no encontrado' }
 */

class AppError extends Error {
  /**
   * Crea una instancia de AppError.
   *
   * @param {string} message   - Mensaje descriptivo del error (visible al cliente).
   * @param {number} statusCode - Código HTTP que se enviará en la respuesta
   *                              (ej: 400, 401, 403, 404, 409, 422, 500).
   */
  constructor(message, statusCode) {
    // Llama al constructor de Error con el mensaje
    super(message);

    /**
     * Código de estado HTTP asociado al error.
     * Leído por errorHandler.js para construir la respuesta.
     * CORRECCIÓN: antes era `this.status`, errorHandler espera `this.statusCode`.
     * @type {number}
     */
    this.statusCode = statusCode;

    /**
     * Marca este error como "operacional" (anticipado, controlado).
     * Los errores operacionales se muestran al cliente en producción.
     * Los errores NO operacionales (bugs) solo muestran un mensaje genérico.
     * @type {boolean}
     */
    this.isOperational = true;

    /**
     * Captura el stack trace excluyendo el constructor de AppError,
     * lo que hace que el stack apunte al origen real del error.
     */
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;