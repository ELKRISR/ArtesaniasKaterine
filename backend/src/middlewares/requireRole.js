/**
 * @fileoverview Middleware de autorización basado en roles (RBAC).
 *
 * Implementa control de acceso por roles usando el patrón de
 * "factory de middleware": `requireRole('admin', 'editor')` devuelve
 * una función middleware configurada para esos roles específicos.
 *
 * Responsabilidades:
 *  1. Verificar que la request tiene un usuario autenticado en `req.user`
 *     (garantizado por `verifyToken`, que debe ejecutarse antes).
 *  2. Verificar que el usuario tiene un rol asignado.
 *  3. Comprobar que el rol del usuario está en la lista de roles permitidos.
 *  4. Registrar los intentos de acceso denegado (audit trail de seguridad).
 *
 * DEBE usarse siempre DESPUÉS de `verifyToken` en la cadena de middlewares.
 * Si se usa solo, `req.user` no existirá y retornará 401.
 *
 * CORRECCIÓN:
 *  Las respuestas usaban la clave `error:` en el JSON, inconsistente con
 *  el resto de la API y con el interceptor del frontend que lee `data.message`.
 *  Ahora usa `message:` en todos los casos.
 *
 * @module middlewares/requireRole
 *
 * @example
 * // Ruta solo para administradores:
 * router.get('/', verifyToken, requireRole('admin'), listarTodos);
 *
 * @example
 * // Ruta para múltiples roles:
 * router.get('/reportes', verifyToken, requireRole('admin', 'supervisor'), obtenerReporte);
 *
 * @example
 * // Si el usuario tiene rol 'cliente' e intenta acceder a una ruta de admin:
 * // → HTTP 403 · { success: false, message: 'No tienes permisos...' }
 * // → Console: [AUTHZ] Acceso denegado — usuario 42 (cliente) intentó acceder a /api/pedidos
 */

/**
 * Genera un middleware de autorización para los roles especificados.
 *
 * Acepta uno o múltiples roles mediante rest parameters, lo que permite
 * rutas accesibles por más de un tipo de usuario sin duplicar middleware.
 *
 * @param {...string} allowedRoles - Roles autorizados para la ruta.
 *                                   Ej: requireRole('admin') o
 *                                       requireRole('admin', 'supervisor')
 * @returns {import('express').RequestHandler} Middleware de Express configurado.
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {

      /* ── 1. Confirmar que verifyToken ejecutó antes ─────────────── */
      // Si req.user no existe, verifyToken no está en la cadena o falló.
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'No autenticado. Token requerido.',
        });
      }

      /* ── 2. Confirmar que el usuario tiene un rol ───────────────── */
      const userRole = req.user.rol;

      if (!userRole) {
        console.warn(
          `[AUTHZ] Usuario sin rol — ID: ${req.user.id} | Ruta: ${req.originalUrl}`
        );
        return res.status(403).json({
          success: false,
          message: 'Usuario sin rol asignado. Contacta al administrador.',
        });
      }

      /* ── 3. Verificar que el rol esté en la lista permitida ─────── */
      if (!allowedRoles.includes(userRole)) {
        // Registro de intento de acceso no autorizado (audit trail)
        console.warn(
          `[AUTHZ] Acceso denegado — usuario ${req.user.id} (${userRole}) ` +
          `intentó acceder a ${req.method} ${req.originalUrl} ` +
          `[requiere: ${allowedRoles.join(' | ')}]`
        );

        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para acceder a este recurso.',
        });
      }

      /* ── 4. Autorizado → continuar ──────────────────────────────── */
      next();

    } catch (error) {
      console.error('[AUTHZ] Error inesperado en requireRole:', error);

      return res.status(500).json({
        success: false,
        message: 'Error al validar permisos.',
      });
    }
  };
};

module.exports = requireRole;