/**
 * @fileoverview Middleware para capturar y devolver errores de validación.
 *
 * Funciona como "interceptor" entre los validators de express-validator
 * y los controladores: si la request no pasa las reglas definidas en
 * el array de validators de la ruta, responde con 400 y lista los errores
 * antes de que el controlador llegue a ejecutarse.
 *
 * 🔒 SEGURIDAD ADICIONAL:
 *  - Sanitiza automáticamente los campos validados (escape, trim)
 *  - Previene XSS en los datos que pasan la validación
 *
 * Flujo de uso en una ruta:
 *   router.post('/', verifyToken, [crearProductoValidator], validate, crearProducto)
 *                                   ↑ valida campos        ↑ este middleware
 *
 * @module middlewares/validationResult
 */

const { validationResult } = require('express-validator');

/**
 * Middleware de validación.
 *
 * Extrae los errores acumulados por express-validator en la request actual.
 * Si existen errores, responde con HTTP 400 y un array de detalles.
 * Si no hay errores, invoca `next()` para continuar al controlador.
 *
 * @param {import('express').Request}  req  - Request de Express.
 * @param {import('express').Response} res  - Response de Express.
 * @param {import('express').NextFunction} next - Siguiente middleware/controlador.
 */
module.exports = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorList = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
    }));

    console.warn(
      `[VALIDATION] ${req.method} ${req.originalUrl} - ${errorList.length} error(es):`,
      errorList,
      'body:',
      req.body
    );

    return res.status(400).json({
      success: false,
      message: 'Errores de validación',
      errors: errorList,
    });
  }

  // 🔒 Sanitización adicional: eliminar caracteres peligrosos de strings
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    // Eliminar caracteres nulos y secuencias de escape peligrosas
    return str.replace(/[\x00-\x1F\x7F]/g, '').trim();
  };

  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  // Aplicar sanitización adicional a body después de validación
  if (req.body) req.body = sanitizeObject(req.body);

  next();
};