const { doubleCsrf } = require('csrf-csrf');

/**
 * Protección CSRF con double submit cookie pattern.
 *
 * - `cookieName` usa el prefijo __Host para reforzar seguridad en la cookie.
 * - `cookieOptions.path` se restringe a /api/auth para minimizar la superficie.
 * - `sameSite: 'strict'` bloquea envío cross-site.
 * - `httpOnly: true` protege la cookie CSRF de acceso por JavaScript.
 *
 * NOTA: El cliente debe enviar el token CSRF en el header `x-csrf-token`.
 */
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || 'csrf-default-secret-change-me';
    if (!process.env.CSRF_SECRET) {
      console.warn(
        '[CSRF] Advertencia: no se ha configurado CSRF_SECRET. ' +
        'Usando JWT_SECRET como respaldo temporal o un valor seguro por defecto. ' +
        'Define CSRF_SECRET en .env para producción.'
      );
    }
    return secret;
  },
  getSessionIdentifier: (req) => req.headers['user-agent'] || '',
  cookieName: process.env.NODE_ENV === 'production'
    ? '__Host-psifi.x-csrf-token'
    : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true',
    httpOnly: true,
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  errorConfig: {
    statusCode: 403,
    message: 'Token CSRF inválido o ausente.',
    code: 'EBADCSRFTOKEN',
  },
});

module.exports = {
  csrfProtection: doubleCsrfProtection,
  generateCsrfToken,
};
