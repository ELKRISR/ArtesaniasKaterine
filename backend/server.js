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

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      const isVercelOrigin = /vercel\.app$/.test(origin);
      const isAllowed = isVercelOrigin || allowedOrigins.indexOf(origin) !== -1;
      
      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[Socket.IO CORS] Bloqueado: ${origin}`);
      callback(new Error('CORS bloqueado'));
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