/**
 * @fileoverview Controlador de autenticación de usuarios.
 *
 * Centraliza toda la lógica de negocio relacionada con la sesión:
 * registro, inicio de sesión, renovación de token y cierre de sesión.
 *
 * Estrategia de tokens (dual-token):
 *  ┌─────────────────┬────────────────────────────────────────────────────┐
 *  │ Access Token    │ JWT de corta duración (1h por defecto).            │
 *  │                 │ Se envía en el header Authorization: Bearer <tok>. │
 *  │                 │ Payload: { id, rol } — mínimo necesario.          │
 *  ├─────────────────┼────────────────────────────────────────────────────┤
 *  │ Refresh Token   │ JWT de larga duración (7d por defecto).            │
 *  │                 │ Se guarda en cookie httpOnly (nunca en JS).        │
 *  │                 │ Payload: { id } — mínimo posible.                 │
 *  │                 │ Al refrescar, el rol se consulta de la DB para     │
 *  │                 │ reflejar cambios de permisos inmediatamente.        │
 *  └─────────────────┴────────────────────────────────────────────────────┘
 *
 * Seguridad implementada:
 *  - SELECT con columnas explícitas — nunca SELECT *.
 *  - Mitigación de timing attacks en login (dummy bcrypt si usuario no existe).
 *  - Normalización de email (trim + lowercase) antes de consultar la DB.
 *  - Validación de fortaleza de contraseña en registro.
 *  - Cookies con httpOnly + sameSite + secure en producción.
 *  - Refresh con lookup a DB para reflejar cambios de rol en tiempo real.
 *  - Doble clave en errores (message + error) durante transición frontend.
 *  - 🔐 Configuración JWT con algoritmo explícito HS256 (previene CVE-2022-23539/23540/23541)
 *
 * @module controllers/authController
 */

const pool   = require('../models/db');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const axios  = require('axios');
const { generateCsrfToken } = require('../middlewares/csrfProtection');

/* ── Constantes de validación ──────────────────────────────────────────── */

/** @constant {RegExp} Regex de validación de contraseña */
const PASSWORD_REGEX = /^(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;

/* ── Configuración JWT centralizada ─────────────────────────────────────── */

/**
 * Opciones comunes para firmar tokens JWT.
 * Centralizadas para mantener consistencia en toda la aplicación.
 *
 * @constant {Object}
 */
const JWT_SIGN_OPTIONS = {
  algorithm: 'HS256',              // ← OBLIGATORIO - previene algoritmos inseguros
  issuer: 'artesanias-app',        // Identifica quién emite el token
  audience: 'artesanias-users',    // Para quién es el token
};

/**
 * Opciones de verificación JWT (usadas en refresh).
 *
 * @constant {Object}
 */
const JWT_VERIFY_OPTIONS = {
  algorithms: ['HS256'],           // ← OBLIGATORIO - previene CVE-2022-23539/23540/23541
  issuer: 'artesanias-app',
  audience: 'artesanias-users',
};

/* ── Constantes ────────────────────────────────────────────────────────── */

/**
 * Número de rondas de sal para bcrypt.
 * 10 rondas ≈ 100ms en hardware moderno — balance seguridad/rendimiento.
 * No bajar de 10. Para producción crítica, considerar 12.
 * @constant {number}
 */
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hash ficticio para mitigación de timing attacks.
 * Se usa para ejecutar bcrypt.compare() incluso cuando el usuario no existe,
 * manteniendo el tiempo de respuesta constante e impidiendo que un atacante
 * descubra si un email está registrado midiendo los tiempos de respuesta.
 * @constant {string}
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uQxTmrjuCPDGGKKTDC7RgGfEUhCEmhSu';

/**
 * Opciones de la cookie que guarda el refresh token.
 * Centralizadas aquí para que login y logout usen exactamente las mismas —
 * si logout usa opciones diferentes, algunos navegadores no eliminan la cookie.
 *
 * @type {import('express').CookieOptions}
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 1 día en ms
  path: '/api/auth',
};

const REVOKED_TOKENS_TABLE = 'revoked_tokens';

const isRefreshTokenRevoked = async (token) => {
  if (!token) return false;
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return false;

    // Usar jti si está presente, sino usar id del usuario
    const tokenId = decoded.jti || decoded.id;

    const [rows] = await pool.query(
      `SELECT id FROM ${REVOKED_TOKENS_TABLE} WHERE token = ? AND expires_at > NOW() LIMIT 1`,
      [tokenId]
    );
    return rows.length > 0;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
      return false;
    }
    console.warn('[AUTH] Error comprobando revocación de refresh token:', error.message);
    return false;
  }
};

const revokeRefreshToken = async (token) => {
  if (!token) return;
  try {
    const decoded = jwt.decode(token);
    if (!decoded) return;

    // Usar jti si está presente, sino usar id del usuario
    const tokenId = decoded.jti || decoded.id;
    const expiresAt = new Date(decoded.exp * 1000); // Convertir timestamp a Date

    await pool.query(
      `INSERT IGNORE INTO ${REVOKED_TOKENS_TABLE} (token, expires_at) VALUES (?, ?)`,
      [tokenId, expiresAt]
    );
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return;
    }
    console.warn('[AUTH] No se pudo revocar refresh token:', error.message);
  }
};

/**
 * Regex de validación de email.
 * Comprueba formato básico: algo@algo.algo
 * @constant {RegExp}
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verifica si una contraseña ha sido comprometida usando la API de Have I Been Pwned.
 * Usa k-Anonymity: solo envía los primeros 5 caracteres del hash SHA1.
 * @param {string} password - Contraseña a verificar
 * @returns {Promise<boolean>} true si la contraseña está comprometida
 */
const checkPasswordPwned = async (password) => {
  try {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
      timeout: 5000, // 5 segundos de timeout
    });

    const lines = response.data.split('\n');
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix === suffix) {
        return parseInt(count, 10) > 0; // true si ha sido vista al menos una vez
      }
    }
    return false;
  } catch (error) {
    console.warn('[AUTH] Error verificando contraseña comprometida:', error.message);
    return false; // En caso de error, permitir la contraseña (fail-open)
  }
};

/* ── Helpers privados ──────────────────────────────────────────────────── */

/**
 * Genera un access token JWT con el payload mínimo necesario.
 * Solo incluye id y rol — no email ni nombre (innecesario y agrega peso).
 *
 * 🔐 SEGURIDAD:
 *  - Se especifica algoritmo HS256 explícitamente
 *  - Se incluyen issuer y audience para validación
 *
 * @param {{ id: number, rol: string }} usuario
 * @returns {string} Token JWT firmado.
 */
const generarAccessToken = (usuario) =>
  jwt.sign(
    { id: usuario.id, rol: usuario.rol },
    process.env.JWT_SECRET,
    {
      ...JWT_SIGN_OPTIONS,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    }
  );

/**
 * Genera un refresh token JWT con payload mínimo.
 * Solo incluye el id — el rol se consulta de la DB al refrescar,
 * lo que permite que cambios de permisos tomen efecto inmediatamente.
 *
 * 🔐 SEGURIDAD:
 *  - Se especifica algoritmo HS256 explícitamente
 *  - Se incluyen issuer y audience para validación
 *
 * @param {{ id: number }} usuario
 * @returns {string} Token JWT de larga duración.
 */
const generarRefreshToken = (usuario) =>
  jwt.sign(
    { id: usuario.id, tokenVersion: usuario.token_version || 0 },
    process.env.JWT_REFRESH_SECRET,
    {
      ...JWT_SIGN_OPTIONS,
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );

/* ── Controladores ─────────────────────────────────────────────────────── */

/**
 * POST /api/auth/login
 *
 * Autentica un usuario con email y contraseña.
 * En caso de éxito:
 *  - Devuelve un access token en el body.
 *  - Establece el refresh token en una cookie httpOnly.
 *
 * Protegido en app.js con loginLimiter (5 intentos / 10 min por IP).
 *
 * @type {import('express').RequestHandler}
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  /* ── Validación de campos obligatorios ─────────────────────────────── */
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email y contraseña son obligatorios.',
    });
  }

  try {
    // Normalizar email: trim + lowercase para evitar duplicados por capitalización
    const emailNorm = email.trim().toLowerCase();

    /* ── Buscar usuario — columnas explícitas, nunca SELECT * ─────────── */
    const [rows] = await pool.query(
      'SELECT id, nombre, email, password, rol, token_version FROM usuarios WHERE email = ?',
      [emailNorm]
    );

    /* ── Mitigación de timing attacks ──────────────────────────────────
       Si el usuario no existe, ejecutamos bcrypt.compare() con un hash ficticio.
       Esto mantiene el tiempo de respuesta constante (~100ms) tanto cuando
       el usuario existe como cuando no, impidiendo user enumeration
       midiendo diferencias de tiempo entre ambas respuestas.
    ─────────────────────────────────────────────────────────────────── */
    if (rows.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH); // tiempo constante
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    const usuario = rows[0];

    /* ── Verificar contraseña ───────────────────────────────────────── */
    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas.',
      });
    }

    /* ── Generar tokens ─────────────────────────────────────────────── */
    const accessToken  = generarAccessToken(usuario);
    const refreshToken = generarRefreshToken(usuario);

    /* ── Enviar refresh token en cookie segura ──────────────────────── */
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

    /* ── Generar y devolver token CSRF compatible con double submit cookie ── */
    const csrfToken = generateCsrfToken(req, res);

    /* ── Respuesta — contrato que espera Login.jsx ──────────────────── */
    return res.status(200).json({
      success: true,
      message: 'Login correcto.',
      token: accessToken,
      csrfToken,
      usuario: {
        id:     usuario.id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol,
      },
    });

  } catch (error) {
    console.error('[AUTH] Error en login:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión.',
    });
  }
};

/* ─────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/auth/register
 *
 * Registra un nuevo usuario con rol 'cliente'.
 * Valida formato de email, fortaleza de contraseña y unicidad del email.
 *
 * @type {import('express').RequestHandler}
 */
const register = async (req, res) => {
  const { nombre, email, password } = req.body;

  /* ── Validar presencia de campos ────────────────────────────────────── */
  if (!nombre || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nombre, email y contraseña son obligatorios.',
      error:   'Nombre, email y contraseña son obligatorios.', // compat Register.jsx
    });
  }

  /* ── Normalizar y validar nombre ────────────────────────────────────── */
  const nombreTrim = nombre.trim();
  if (nombreTrim.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'El nombre debe tener al menos 2 caracteres.',
      error:   'El nombre debe tener al menos 2 caracteres.',
    });
  }

  /* ── Validar formato de email ───────────────────────────────────────── */
  const emailNorm = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(emailNorm)) {
    return res.status(400).json({
      success: false,
      message: 'El formato del email no es válido.',
      error:   'El formato del email no es válido.',
    });
  }

  /* ── Validar fortaleza de contraseña ────────────────────────────────── */
  // Requisitos: mínimo 8 caracteres y al menos un número.
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña debe tener al menos 8 caracteres y un número.',
      error:   'La contraseña debe tener al menos 8 caracteres y un número.',
    });
  }

  /* ── Verificar si la contraseña está comprometida ──────────────────── */
  const isPwned = await checkPasswordPwned(password);
  if (isPwned) {
    return res.status(400).json({
      success: false,
      message: 'Esta contraseña ha sido comprometida en brechas de seguridad. Por favor, elige una diferente.',
      error:   'Esta contraseña ha sido comprometida en brechas de seguridad. Por favor, elige una diferente.',
    });
  }

  try {
    /* ── Verificar que el email no esté registrado ─────────────────── */
    const [existing] = await pool.query(
      'SELECT id FROM usuarios WHERE email = ?',
      [emailNorm]
    );

    if (existing.length > 0) {
      // Respuesta genérica para evitar enumeración de usuarios
      return res.status(200).json({
        success: true,
        message: 'Si este email no está registrado, recibirás un correo de confirmación.',
      });
    }

    /* ── Hashear contraseña y guardar usuario ──────────────────────── */
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const [result] = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [nombreTrim, emailNorm, hashedPassword, 'cliente']
    );

    /* ── Respuesta — Register.jsx solo redirige, no usa el body ────── */
    return res.status(200).json({
      success: true,
      message: 'Si este email no está registrado, recibirás un correo de confirmación.',
    });

  } catch (error) {
    console.error('[AUTH] Error en register:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar usuario.',
      error:   'Error al registrar usuario.',
    });
  }
};

/* ─────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/auth/refresh
 *
 * Emite un nuevo access token usando el refresh token guardado en cookie.
 *
 * SEGURIDAD — Por qué consultamos la DB aquí:
 *  La versión anterior tomaba el rol directamente del refresh token.
 *  Si el admin cambiaba el rol de un usuario, el token antiguo seguía
 *  concediendo el rol previo hasta expirar. Ahora consultamos la DB
 *  para que los cambios de permisos sean efectivos de inmediato.
 *
 * 🔐 SEGURIDAD JWT:
 *  - Verificación con algoritmo explícito HS256
 *  - Validación de issuer y audience
 *
 * @type {import('express').RequestHandler}
 */
const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No hay refresh token. Inicia sesión.',
    });
  }

  try {
    /* ── Verificar firma y vigencia del refresh token ──────────────── */
    // 🔐 CRÍTICO: Especificar algoritmo explícitamente previene CVE-2022-23539/23540/23541
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, JWT_VERIFY_OPTIONS);

    /* ── Comprobar blacklist de refresh tokens (si la tabla existe) ── */
    if (await isRefreshTokenRevoked(token)) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token revocado. Inicia sesión nuevamente.',
      });
    }

    /* ── Obtener rol actual y token_version desde la DB ────────────── */
    const [rows] = await pool.query(
      'SELECT id, rol, token_version FROM usuarios WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      // El usuario fue eliminado después de emitir el token
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    const usuario = rows[0];

    if (decoded.tokenVersion !== usuario.token_version) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token inválido. Inicia sesión nuevamente.',
      });
    }

    /* ── Emitir nuevo refresh token rotado y nuevo access token ───── */
    const newRefreshToken = generarRefreshToken(usuario);
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);

    const newAccessToken = generarAccessToken(usuario);

    return res.status(200).json({
      success: true,
      token:   newAccessToken,
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Refresh token expirado. Inicia sesión nuevamente.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      console.warn('[AUTH] Refresh token inválido', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        error: error.message,
      });
      return res.status(403).json({
        success: false,
        message: 'Refresh token inválido.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Refresh token inválido.',
    });
  }
};

/* ─────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/auth/logout
 *
 * Cierra la sesión eliminando la cookie del refresh token.
 *
 * IMPORTANTE: clearCookie debe recibir las mismas opciones con las que
 * se creó la cookie (mismo path, domain, secure, sameSite), de lo contrario
 * algunos navegadores no la eliminan. Por eso usamos COOKIE_OPTIONS.
 *
 * @type {import('express').RequestHandler}
 */
const logout = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  res.clearCookie('refreshToken', COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    message: 'Logout exitoso.',
  });
};

/* ─────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/auth/me
 *
 * Devuelve los datos del usuario autenticado consultando la DB.
 * Requiere header `Authorization: Bearer <token>` (verificado por verifyToken).
 *
 * Se consulta la DB en lugar de usar el payload del token para garantizar
 * que los datos mostrados son siempre los más actualizados.
 *
 * Respuesta esperada por AuthProvider.jsx:
 *   { usuario: { id, nombre, email, rol } }
 *
 * @type {import('express').RequestHandler}
 */
const getMe = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado.',
      });
    }

    return res.status(200).json({
      success: true,
      usuario: rows[0],
    });

  } catch (error) {
    console.error('[AUTH] Error en getMe:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener usuario.',
    });
  }
};

/* ── Exportar ──────────────────────────────────────────────────────────── */

module.exports = {
  login,
  register,
  refresh,
  logout,
  getMe,
};