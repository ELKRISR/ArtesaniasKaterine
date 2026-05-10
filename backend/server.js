require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || '';
const allowedOrigins = rawAllowedOrigins
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.FRONTEND_URL) {
  const frontendUrl = process.env.FRONTEND_URL.trim();
  if (frontendUrl && allowedOrigins.indexOf(frontendUrl) === -1) {
    allowedOrigins.push(frontendUrl);
  }
}

const isVercelOrigin = (origin) => typeof origin === 'string' && /^https:\/\/[\w-]+\.vercel\.app$/i.test(origin);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn('[Socket.IO CORS] ADVERTENCIA: ALLOWED_ORIGINS no está definido en producción. Solo se permitirán orígenes Vercel y FRONTEND_URL si están configurados.');
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      const isAllowed = allowedOrigins.indexOf(origin) !== -1 || isVercelOrigin(origin);
      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[Socket.IO CORS] 🔴 Bloqueado intento de acceso desde: ${origin}`);
      callback(new Error('No permitido por política CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

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

global.io = io;

server.listen(PORT, () => {
  console.log('=======================================');
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🏥 Health check en http://localhost:${PORT}/health`);
  console.log(`📄 Swagger en http://localhost:${PORT}/api-docs`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('🔒 Swagger protegido con autenticación básica');
  }
  console.log('🔒 Sanitización XSS activada');
  console.log('🔒 Límite de payload: 10KB');
  console.log('🔗 Socket.IO habilitado para notificaciones en tiempo real');
  console.log('=======================================');
});