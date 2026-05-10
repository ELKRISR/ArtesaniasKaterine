/**
 * ==============================
 * 🚀 APP PRINCIPAL - BACKEND
 * ==============================
 * Configuración general del servidor
 * Seguridad
 * Middlewares globales
 * Rutas
 * Swagger
 * Manejo de errores
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./docs/swagger");
const { protectSwagger } = require("./middlewares/authMiddleware");

// 🔒 Middleware de sanitización global
const sanitizeMiddleware = require("./middlewares/sanitize");

const app = express();

/* ===================================================
   🔐 SEGURIDAD GLOBAL
=================================================== */

/**
 * Helmet → Protege headers HTTP
 */
app.use(helmet());

/**
 * Rate Limit Global
 * 100 peticiones cada 15 minutos por IP
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: "Demasiadas peticiones, intenta más tarde"
  }
});

app.use(globalLimiter);

/**
 * Rate Limit específico para login
 * 5 intentos cada 10 minutos
 */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    error: "Demasiados intentos de login. Intenta más tarde."
  }
});

/**
 * Rate Limit específico para refresh
 * 10 intentos cada 10 minutos
 */
const refreshLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de refresh. Intenta más tarde."
  }
});

/**
 * Rate Limit específico para registro
 * 5 intentos cada hora por IP (para prevenir enumeración masiva)
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: {
    error: "Demasiados intentos de registro. Intenta más tarde."
  }
});

/* ===================================================
   📊 LOGGING - CONFIGURACIÓN POR ENTORNO
   ===================================================
   En desarrollo: formato "dev" (colorido, legible para humanos)
   En producción: formato "combined" (estándar Apache, para análisis)
*/

if (process.env.NODE_ENV === 'production') {
  // "combined" genera: IP - - [fecha] "Método Ruta" código bytes
  // Ejemplo: 192.168.1.1 - - [17/Apr/2026:10:00:00] "GET /api/productos" 200 1523
  app.use(morgan("combined"));
  console.log("📊 Morgan: formato 'combined' (producción)");
} else {
  // "dev" es colorido y conciso, ideal para desarrollo
  app.use(morgan("dev"));
  console.log("📊 Morgan: formato 'dev' (desarrollo)");
}

/* ===================================================
   🔹 MIDDLEWARES BASE
=================================================== */

/**
 * 🔒 CORS CONFIGURACIÓN SEGURA
 * ===================================================
 * En desarrollo: permite localhost:5173
 * En producción: solo dominios específicos en lista blanca
 */
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman, apps móviles)
    if (!origin) return callback(null, true);
    
    // En desarrollo, permitir más flexibilidad
    if (process.env.NODE_ENV !== 'production') {
      if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost')) {
        return callback(null, true);
      }
      console.warn(`[CORS] Origen no estándar en desarrollo: ${origin}`);
      return callback(null, true);
    }
    
    // En producción: validación estricta
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[CORS] 🔴 Bloqueado intento de acceso desde: ${origin}`);
      callback(new Error('No permitido por política CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'X-CSRF-Token'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
}));

/* ===================================================
   🔒 LIMITACIÓN DE TAMAÑO DE PAYLOAD (PREVENIR DoS)
   ===================================================
   ¿Por qué 10KB?
   - Un login típico: ~100 bytes
   - Un registro: ~200 bytes
   - Un pedido con 10 productos: ~2KB
   - Un mensaje de contacto: ~1KB
   
   10KB es suficiente para TODAS las operaciones legítimas
   y rechaza payloads maliciosos que intentan saturar el servidor.
*/

// Límite para JSON (body de API REST)
app.use(express.json({
  limit: '10kb',
  verify: (req, res, buf) => {
    // Guardar el body crudo para validar firmas de webhooks
    if (req.originalUrl.startsWith('/api/webhook/bold')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

// Límite para datos URL-encoded (formularios tradicionales)
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser no necesita límite específico (las cookies tienen límite propio)
app.use(cookieParser());

// 🔒 SANITIZACIÓN GLOBAL - Previene XSS en todos los inputs
app.use(sanitizeMiddleware);

/* ===================================================
   🏥 HEALTH CHECK (monitoreo) - CON INFORMACIÓN FILTRADA
   ===================================================
   🔒 En producción: SOLO estado y timestamp (previene footprinting)
   🔓 En desarrollo: información adicional para debugging
   
   ¿Por qué ocultar uptime y environment en producción?
   - Un atacante puede saber cuánto tiempo lleva el servidor activo
   - Puede identificar que estás en desarrollo vs producción
   - Reduce la superficie de ataque (información de sistema)
*/

app.get('/health', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Respuesta base (siempre presente)
  const healthResponse = {
    status: 'OK',
    timestamp: new Date().toISOString(),
  };
  
  // En desarrollo: agregar información adicional útil
  if (!isProduction) {
    healthResponse.uptime = process.uptime();
    healthResponse.environment = process.env.NODE_ENV || 'development';
    healthResponse.version = '1.0.0';
  }
  
  res.status(200).json(healthResponse);
});

/* ===================================================
   🔹 RUTAS
=================================================== */

const authRoutes = require("./routes/auth");
const productosRoutes = require("./routes/routes_productos");
const pedidosRoutes = require("./routes/pedidos");
const reportesRoutes = require("./routes/reportes");
const contactRoutes = require("./routes/contact");
const wishlistRoutes = require("./routes/wishlist");
const reviewsRoutes = require("./routes/reviews");
const webhookRoutes = require("./routes/webhook");

/**
 * 🔐 AUTH
 * Login protegido con limiter
 */
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/refresh", refreshLimiter);
app.use("/api/auth", authRoutes);

/**
 * 📦 PRODUCTOS
 */
app.use("/api/productos", productosRoutes);

/**
 * 📝 RESEÑAS
 */
app.use("/api/reviews", reviewsRoutes);

/**
 * 🛒 PEDIDOS
 */
app.use("/api/pedidos", pedidosRoutes);

/**
 * 📬 CONTACTO
 */
app.use("/api/contacto", contactRoutes);

/**
 * � WISHLIST
 */
app.use("/api/wishlist", wishlistRoutes);

/**
 * �📊 REPORTES (Solo Admin)
 */
app.use("/api/reportes", reportesRoutes);
/**
 * 🪝 WEBHOOKS (Sin autenticación requerida - validados con firma)
 */
app.use("/api/webhook", webhookRoutes);
/* ===================================================
   📄 SWAGGER DOCUMENTATION
   🔒 PROTEGIDO CON AUTENTICACIÓN BÁSICA EN PRODUCCIÓN
=================================================== */

/**
 * Estrategia de seguridad para Swagger:
 * 
 * ┌─────────────────┬────────────────────────────────────┐
 * │ Entorno         │ Configuración                      │
 * ├─────────────────┼────────────────────────────────────┤
 * │ Desarrollo      │ Sin autenticación (fácil acceso)   │
 * │ Producción      │ Con autenticación básica           │
 * └─────────────────┴────────────────────────────────────┘
 * 
 * Credenciales por defecto (CAMBIAR EN PRODUCCIÓN):
 *   Usuario: admin
 *   Contraseña: cambiar123
 * 
 * Configurar en .env:
 *   SWAGGER_USER=empresario
 *   SWAGGER_PASS=contraseñaSegura123
 */

if (process.env.NODE_ENV === 'production') {
  // Producción: Swagger protegido con autenticación básica
  app.use(
    "/api-docs",
    protectSwagger,
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
      },
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Artesanías - Documentación (Protegida)',
    })
  );
  console.log("🔒 Swagger protegido con autenticación básica (producción)");
} else {
  // Desarrollo: Swagger sin autenticación
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
      },
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Artesanías - Documentación (Desarrollo)',
    })
  );
  console.log("📚 Swagger habilitado sin autenticación (solo desarrollo)");
}

/* ===================================================
   ❌ RUTA NO ENCONTRADA
=================================================== */

app.use((req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada"
  });
});

/* ===================================================
   ❌ MANEJO GLOBAL DE ERRORES
=================================================== */

const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

const http = require("http");
const { Server } = require("socket.io");

/* ===================================================
   🚀 INICIAR SERVIDOR
=================================================== */

const PORT = process.env.PORT || 4000;

// Crear servidor HTTP
const server = http.createServer(app);

// Inicializar Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  }
});

// Configurar eventos de Socket.IO
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('join', (data) => {
    if (data.role === 'admin') {
      socket.join('admins');
      console.log('Admin unido a sala:', socket.id);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Hacer io disponible globalmente para los controllers
global.io = io;

// Solo para desarrollo local:
if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log("=======================================");
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🏥 Health check en http://localhost:${PORT}/health`);
    console.log(`📄 Swagger en http://localhost:${PORT}/api-docs`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    if (process.env.NODE_ENV === 'production') {
      console.log("🔒 Swagger protegido con autenticación básica");
    }
    console.log("🔒 Sanitización XSS activada");
    console.log("🔒 Límite de payload: 10KB");
    console.log("🔗 Socket.IO habilitado para notificaciones en tiempo real");
    console.log("=======================================");
  });
}

module.exports = app; // Para testing