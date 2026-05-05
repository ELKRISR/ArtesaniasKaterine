const swaggerJsdoc = require('swagger-jsdoc');

// Determinar la URL base según el entorno
const getServerUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    // En producción, usar la variable de entorno o el dominio real
    return process.env.API_URL || 'https://api.tudominio.com/api';
  }
  return 'http://localhost:4000/api';
};

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Artesanías',
      version: '1.0.0',
      description: 'Documentación oficial del backend Artesanías',
      contact: {
        name: 'Soporte',
        email: 'soporte@artesanias.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: getServerUrl(),
        description: process.env.NODE_ENV === 'production' ? 'Producción' : 'Desarrollo',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Ingresa tu token JWT: Bearer <token>',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Auth', description: 'Autenticación y gestión de sesión' },
      { name: 'Productos', description: 'Gestión del catálogo de productos' },
      { name: 'Pedidos', description: 'Gestión de pedidos' },
      { name: 'Contacto', description: 'Formulario de contacto' },
      { name: 'Reportes', description: 'Reportes financieros y de ventas' },
    ],
  },
  apis: ['./src/routes/**/*.js', './src/controllers/**/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;