/**
 * @fileoverview Wrapper para controladores async que elimina bloques try/catch repetitivos.
 *
 * El problema que resuelve:
 *  Express no captura automáticamente los errores de funciones async.
 *  Si un controlador lanza una excepción o una Promise es rechazada,
 *  Express lo ignora y la request queda colgada sin respuesta,
 *  a menos que el controlador llame explícitamente a `next(error)`.
 *
 *  Sin asyncHandler, cada controlador necesita su propio try/catch:
 *
 *    router.get('/', async (req, res, next) => {
 *      try {
 *        const data = await pool.query(...);
 *        res.json(data);
 *      } catch (err) {
 *        next(err);  // ← sin esto, el error se pierde
 *      }
 *    });
 *
 *  Con asyncHandler, el try/catch está implícito:
 *
 *    router.get('/', asyncHandler(async (req, res) => {
 *      const data = await pool.query(...);
 *      res.json(data);
 *      // cualquier error aquí llega automáticamente al errorHandler
 *    }));
 *
 * Cómo funciona internamente:
 *  1. Recibe la función async `fn` del controlador.
 *  2. Devuelve un nuevo middleware Express (req, res, next).
 *  3. Cuando Express invoca ese middleware, ejecuta `fn(req, res, next)`
 *     dentro de `Promise.resolve()`.
 *  4. Si la Promise falla (throw o reject), `.catch(next)` pasa el error
 *     al siguiente middleware de error → `errorHandler.js`.
 *
 * @module middlewares/asyncHandler
 *
 * @example
 * // Uso básico en una ruta:
 * const asyncHandler = require('../middlewares/asyncHandler');
 *
 * router.get('/productos', asyncHandler(async (req, res) => {
 *   const [rows] = await pool.query('SELECT * FROM productos');
 *   res.json({ success: true, data: rows });
 *   // Si pool.query lanza un error, llega a errorHandler automáticamente
 * }));
 *
 * @example
 * // Nota: en este proyecto varios controladores usan try/catch propio
 * // en lugar de asyncHandler. Ambos patrones son válidos, pero asyncHandler
 * // reduce código repetitivo cuando el manejo de error es genérico.
 */

/**
 * Envuelve un controlador async de Express para captura automática de errores.
 *
 * @param {Function} fn - Función async del controlador
 *                        `async (req, res, next) => { ... }`
 * @returns {Function}  Middleware Express compatible que maneja rechazos de Promise.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;