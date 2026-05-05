/**
 * @fileoverview Middleware global de manejo de errores para Express.
 *
 * Express identifica este middleware como manejador de errores porque
 * recibe CUATRO parámetros (err, req, res, next). Debe registrarse
 * en `app.js` como el ÚLTIMO middleware, después de todas las rutas.
 *
 * Estrategia de respuesta por entorno:
 *
 *   Desarrollo (NODE_ENV !== 'production'):
 *     → Devuelve el mensaje real + el stack trace completo.
 *       Útil para depurar sin abrir el inspector de Node.
 *
 *   Producción (NODE_ENV === 'production'):
 *     → Errores operacionales (isOperational: true, lanzados con AppError):
 *         Devuelve el mensaje real. Son errores esperados y seguros de mostrar
 *         al cliente (404, 400, 401, 403, etc.).
 *     → Errores NO operacionales (bugs, excepciones inesperadas):
 *         Devuelve solo "Error interno del servidor". Nunca expone
 *         detalles internos que puedan ser un vector de ataque.
 *
 * @module middlewares/errorHandler
 *
 * @example
 * // En app.js (debe ir AL FINAL, después de todas las rutas):
 * const errorHandler = require('./middlewares/errorHandler');
 * app.use(errorHandler);
 *
 * @example
 * // Cómo llega un error aquí desde un controlador:
 * // Opción A — con AppError (error operacional controlado):
 * throw new AppError('Producto no encontrado', 404);
 *
 * // Opción B — con next(err) desde asyncHandler:
 * next(new AppError('Stock insuficiente', 400));
 *
 * // Opción C — error inesperado capturado por asyncHandler:
 * // (p.ej. TypeError o error de conexión a DB)
 * // → isOperational será false → producción muestra mensaje genérico
 */

/**
 * Manejador global de errores de Express.
 *
 * @param {Error}                        err  - Objeto de error capturado.
 * @param {import('express').Request}    req  - Request de Express.
 * @param {import('express').Response}   res  - Response de Express.
 * @param {import('express').NextFunction} next - Función next (requerida por Express
 *                                               para reconocer el middleware de error).
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Log completo del error en servidor (siempre, independiente del entorno)
  console.error('🔥 ERROR:', err);

  /*
   * Determinar el código de estado HTTP.
   * CORRECCIÓN: la versión anterior solo leía `err.statusCode`.
   * Ahora también acepta `err.status` como fallback, para compatibilidad
   * con librerías de terceros que usan `status` en lugar de `statusCode`.
   */
  const statusCode = err.statusCode || err.status || 500;
  const message    = err.message || 'Error interno del servidor';

  /* ── Modo desarrollo ──────────────────────────────────────────────
     Expone stack trace completo para depuración rápida.
  ─────────────────────────────────────────────────────────────────── */
  if (process.env.NODE_ENV !== 'production') {
    return res.status(statusCode).json({
      success: false,
      message,
      stack: err.stack,
    });
  }

  /* ── Modo producción ──────────────────────────────────────────────
     Solo exponer detalles si el error fue lanzado intencionalmente
     con AppError (isOperational: true).
     Errores no operacionales (bugs) → mensaje genérico.
  ─────────────────────────────────────────────────────────────────── */
  const isOperational = err.isOperational === true;

  return res.status(statusCode).json({
    success: false,
    message: isOperational ? message : 'Error interno del servidor',
  });
};

module.exports = errorHandler;