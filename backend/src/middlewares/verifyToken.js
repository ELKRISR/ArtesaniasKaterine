/**
 * @fileoverview Middleware de autenticación por JWT (JSON Web Token).
 *
 * Responsabilidades:
 *  1. Verificar que la request incluya un header `Authorization: Bearer <token>`.
 *  2. Validar la firma y vigencia del token con la clave secreta JWT_SECRET.
 *  3. Validar que el payload contenga los campos mínimos requeridos (id, rol).
 *  4. Rechazar tokens excesivamente largos para prevenir ataques de DoS.
 *  5. Adjuntar el payload decodificado en `req.user` y `req.usuario`
 *     para que los controladores puedan leerlo.
 *  6. Registrar en consola los intentos fallidos de autenticación
 *     con IP y ruta (trazabilidad / audit trail).
 *
 * Debe colocarse ANTES de cualquier middleware que requiera un usuario
 * autenticado (ej: requireRole).
 *
 * CORRECCIÓN DE SEGURIDAD:
 *  Las respuestas de error usaban la clave `error:` en el JSON, pero el
 *  interceptor de Axios en el frontend lee `data.message`. Esto hacía que
 *  mensajes como "Token expirado" nunca llegaran al usuario, mostrando
 *  siempre el genérico "Error en la petición". Ahora todos los campos
 *  usan `message:` de forma consistente con el resto de la API.
 *
 * SEGURIDAD JWT (CVE-2022-23539/23540/23541):
 *  Se especifica explícitamente el algoritmo 'HS256' durante la verificación
 *  para prevenir ataques de downgrade de algoritmo (ej: firmar con 'none'
 *  o cambiar de RS256 a HS256 con clave pública como secreto).
 *
 * @module middlewares/verifyToken
 *
 * @example
 * // En una ruta protegida:
 * const verifyToken = require('../middlewares/verifyToken');
 *
 * router.get('/mis-pedidos', verifyToken, listarMisPedidos);
 *
 * // En una ruta que también requiere rol admin:
 * router.get('/', verifyToken, requireRole('admin'), listarTodos);
 */

const jwt = require('jsonwebtoken');

/**
 * Configuración de verificación JWT.
 * Centralizada para mantener consistencia entre tokens access y refresh.
 *
 * @constant {Object}
 */
const JWT_VERIFY_OPTIONS = {
  algorithms: ['HS256'],           // ← OBLIGATORIO - previene CVE-2022-23539/23540/23541
  issuer: 'artesanias-app',        // Valida el emisor del token
  audience: 'artesanias-users',    // Valida la audiencia del token
};

/**
 * Longitud máxima permitida para un token Bearer.
 * Un JWT típico tiene entre 150 y 500 caracteres.
 * 2048 caracteres es un límite generoso que rechaza
 * strings maliciosos sin afectar tokens legítimos.
 * Previene ataques de DoS donde se envían tokens de megabytes
 * para saturar la verificación criptográfica.
 *
 * @constant {number}
 */
const MAX_TOKEN_LENGTH = 2048;

/**
 * Middleware de verificación JWT.
 *
 * @param {import('express').Request}      req  - Request de Express.
 * @param {import('express').Response}     res  - Response de Express.
 * @param {import('express').NextFunction} next - Siguiente middleware.
 */
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    /* ── 1. Validar presencia y formato del header ─────────────── */
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Token requerido.',
      });
    }

    /* ── 2. Extraer el token del header ────────────────────────── */
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado.',
      });
    }

    /* ── 3. Prevención de DoS — rechazar tokens excesivamente largos */
    if (token.length > MAX_TOKEN_LENGTH) {
      // Registrar intento sospechoso sin exponer detalle al cliente
      console.warn(
        `[AUTH] Token demasiado largo (${token.length} chars) — IP: ${req.ip} | Ruta: ${req.originalUrl}`
      );
      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
      });
    }

    /* ── 4. Verificar que JWT_SECRET esté configurado ──────────── */
    if (!process.env.JWT_SECRET) {
      console.error('[AUTH] FATAL: JWT_SECRET no está definido en .env');
      return res.status(500).json({
        success: false,
        message: 'Error interno de configuración.',
      });
    }

    /* ── 5. Verificar firma y expiración del token ─────────────── */
    // 🔐 CRÍTICO: Especificar algoritmo explícitamente previene CVE-2022-23539/23540/23541
    const decoded = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);

    /* ── 6. Validar payload mínimo ─────────────────────────────── */
    // Un token válido firmado por nosotros siempre incluye id y rol.
    // Si faltan, el token es de una fuente inesperada o fue manipulado.
    if (!decoded.id || !decoded.rol) {
      console.warn(
        `[AUTH] Token con payload incompleto — IP: ${req.ip} | Ruta: ${req.originalUrl}`
      );
      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
      });
    }

    /* ── 7. Adjuntar usuario al request ────────────────────────── */
    // `req.user`    → usado por requireRole.js y controladores nuevos
    // `req.usuario` → compatibilidad con controladores existentes
    req.user    = decoded;
    req.usuario = decoded;

    next();

  } catch (error) {

    /* ── Token expirado ─────────────────────────────────────────── */
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Sesión expirada. Inicia sesión nuevamente.',
      });
    }

    /* ── Token con firma inválida o malformado ──────────────────── */
    if (error.name === 'JsonWebTokenError') {
      // Log para detectar intentos de falsificación
      console.warn(
        `[AUTH] Token inválido (${error.message}) — IP: ${req.ip} | Ruta: ${req.originalUrl}`
      );
      return res.status(401).json({
        success: false,
        message: 'Token inválido.',
      });
    }

    /* ── Token con claim "nbf" (not before) en el futuro ───────── */
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({
        success: false,
        message: 'Token aún no válido.',
      });
    }

    /* ── Error inesperado (no relacionado con el token) ─────────── */
    console.error('[AUTH] Error inesperado en verifyToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al validar autenticación.',
    });
  }
};

module.exports = verifyToken;