require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  : ['http://localhost:5173', 'http://localhost:3000'];

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost')) {
          return callback(null, true);
        }
        console.warn(`[Socket.IO CORS] Origen no estándar en desarrollo: ${origin}`);
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
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