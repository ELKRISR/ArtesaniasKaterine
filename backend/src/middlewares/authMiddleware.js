/**
 * Middleware para proteger Swagger con autenticación básica.
 * Útil si necesitas Swagger en producción pero con control de acceso.
 */
const basicAuth = require('express-basic-auth');

const protectSwagger = basicAuth({
  users: {
    [process.env.SWAGGER_USER || 'admin']: process.env.SWAGGER_PASS || '123456',
  },
  challenge: true,
  unauthorizedResponse: {
    success: false,
    message: 'Acceso no autorizado a la documentación',
  },
});

module.exports = { protectSwagger }; // ← Asegurar esta línea

// En app.js, usar:
// app.use('/api-docs', protectSwagger, swaggerUi.serve, swaggerUi.setup(swaggerSpec));