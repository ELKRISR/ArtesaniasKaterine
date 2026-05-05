/**
 * @fileoverview Rutas de autenticación — /api/auth/*
 *
 * Este archivo es exclusivamente un router: define las rutas HTTP,
 * aplica los middlewares necesarios y delega la lógica al controlador.
 * Toda la lógica de negocio vive en `controllers/authController.js`.
 *
 * Rutas disponibles:
 *  POST   /api/auth/login    → Iniciar sesión
 *  POST   /api/auth/register → Crear cuenta
 *  POST   /api/auth/refresh  → Renovar access token (usa cookie)
 *  POST   /api/auth/logout   → Cerrar sesión (limpia cookie)
 *  GET    /api/auth/me       → Obtener usuario autenticado
 *
 * Nota de seguridad:
 *  El rate limiter de /login (5 intentos / 10 min) está aplicado en
 *  `app.js` antes de montar este router, por lo que aplica automáticamente
 *  a la ruta POST /login sin necesidad de declararlo aquí.
 *
 * 🔒 SEGURIDAD: Se han agregado validadores para prevenir inyección y XSS
 *
 * @module routes/auth
 */

const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const { csrfProtection } = require('../middlewares/csrfProtection');

// 🔒 Validadores
const { loginValidator, registerValidator } = require('../validators/authValidator');
const validate = require('../middlewares/validationResult');

const {
  login,
  register,
  refresh,
  logout,
  getMe,
} = require('../controllers/authController');

/* ── Swagger — definición de tag y esquemas ────────────────────────────── */

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación y gestión de sesión
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginInput:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: usuario@correo.com
 *         password:
 *           type: string
 *           format: password
 *           example: miPassword1
 *
 *     RegisterInput:
 *       type: object
 *       required: [nombre, email, password]
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 2
 *           example: Carlos Artesano
 *         email:
 *           type: string
 *           format: email
 *           example: carlos@correo.com
 *         password:
 *           type: string
 *           description: Mínimo 8 caracteres y al menos 1 número
 *           example: segura123
 *
 *     UsuarioPublico:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         nombre:
 *           type: string
 *         email:
 *           type: string
 *         rol:
 *           type: string
 *           enum: [admin, cliente]
 *
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         token:
 *           type: string
 *           description: Access token JWT (1h de duración)
 *         usuario:
 *           $ref: '#/components/schemas/UsuarioPublico'
 */

/* ── POST /login ───────────────────────────────────────────────────────── */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     description: |
 *       Autentica al usuario y devuelve un access token JWT.
 *       También establece una cookie httpOnly con el refresh token (7 días).
 *       Limitado a 5 intentos cada 10 minutos por IP.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Campos obligatorios faltantes
 *       401:
 *         description: Credenciales inválidas
 *       429:
 *         description: Demasiados intentos. Espera 10 minutos.
 *       500:
 *         description: Error interno
 */
router.post('/login', loginValidator, validate, login);

/* ── POST /register ────────────────────────────────────────────────────── */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registrar nuevo usuario
 *     description: |
 *       Crea una cuenta con rol 'cliente'.
 *       Requisitos de contraseña: mínimo 8 caracteres y al menos 1 número.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *       400:
 *         description: Validación fallida o email ya registrado
 *       500:
 *         description: Error interno
 */
router.post('/register', registerValidator, validate, register);

/* ── GET /csrf-token ───────────────────────────────────────────────────── */
router.get('/csrf-token', csrfProtection, (req, res) => {
  return res.status(200).json({
    success: true,
    csrfToken: req.csrfToken(),
  });
});

/* ── POST /refresh ─────────────────────────────────────────────────────── */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar access token
 *     description: |
 *       Usa el refresh token de la cookie httpOnly para emitir un nuevo
 *       access token. El rol del usuario se consulta de la DB para reflejar
 *       cambios de permisos en tiempo real.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token renovado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *       401:
 *         description: No hay refresh token
 *       403:
 *         description: Refresh token inválido o expirado
 */
router.post('/refresh', csrfProtection, refresh);

/* ── POST /logout ──────────────────────────────────────────────────────── */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     description: Elimina la cookie del refresh token. El access token
 *                  expira naturalmente (no se puede invalidar sin blacklist).
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout exitoso
 */
router.post('/logout', csrfProtection, logout);

/* ── GET /me ───────────────────────────────────────────────────────────── */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obtener usuario autenticado
 *     description: Devuelve los datos actuales del usuario desde la DB.
 *                  Requiere access token válido en el header Authorization.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 usuario:
 *                   $ref: '#/components/schemas/UsuarioPublico'
 *       401:
 *         description: Token no proporcionado o inválido
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/me', verifyToken, getMe);

module.exports = router;