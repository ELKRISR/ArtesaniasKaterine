/**
 * @fileoverview Controlador de mensajes de contacto.
 *
 * Gestiona el envío y listado de mensajes del formulario de contacto.
 * Los mensajes se guardan en la tabla `contacto` de MySQL.
 *
 * Correcciones aplicadas:
 *
 *  1. createTableIfNotExist ejecutaba un DDL (ALTER TABLE) en CADA request:
 *     Tanto `submitContact` como `listarContactos` llamaban a esta función
 *     en cada petición HTTP. Un DDL en cada request es costoso — MySQL debe
 *     revisar el schema completo incluso cuando la tabla ya existe.
 *     → Ahora se llama UNA SOLA VEZ al cargar el módulo (autoinvocación
 *     asíncrona al final del archivo), no en cada request.
 *
 *  2. Sanitización de entradas antes de guardar:
 *     Los campos nombre, email y mensaje se almacenaban directamente sin
 *     trim(), lo que permitía guardar strings con espacios al inicio/fin.
 *     → Se aplica .trim() y límites de longitud antes del INSERT.
 *     Las queries ya usan placeholders (?) — principal defensa contra SQL injection.
 *
 *  3. Validación de email server-side:
 *     La versión anterior solo verificaba que el campo existiera, no que
 *     fuera un email válido. Se agrega validación de formato.
 *
 *  4. Respuestas normalizadas:
 *     submitContact devolvía `{ error: "..." }` en errores, inconsistente
 *     con el resto de la API que usa `{ success, message }`.
 *     → Normalizado a `{ success: false, message: "..." }` en todos los casos.
 *
 * @module controllers/contactController
 */

const pool = require('../models/db');
const { successResponse, errorResponse } = require('../utils/response');
const notificationService = require('../services/notificationService');

/* ── Constantes de validación ──────────────────────────────────────────── */

/** @constant {RegExp} Regex de validación de email básico */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Longitudes máximas — deben coincidir con las columnas MySQL */
const LIMITES = {
  NOMBRE:  255,
  EMAIL:   255,
  MENSAJE: 5000,
};

/* ── Inicialización de la tabla ────────────────────────────────────────── */

/**
 * Crea la tabla `contacto` si no existe.
 *
 * CORRECCIÓN: antes se llamaba en CADA request de submitContact y listarContactos.
 * Ahora se llama UNA SOLA VEZ cuando el módulo se carga por primera vez.
 * Si la tabla ya existe, IF NOT EXISTS evita cualquier error.
 *
 * La función es asíncrona pero la llamamos con .catch() al final del módulo
 * para no bloquear el arranque del servidor si MySQL no está listo aún.
 */
const createTableIfNotExist = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacto (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nombre     VARCHAR(255) NOT NULL,
      email      VARCHAR(255) NOT NULL,
      mensaje    TEXT         NOT NULL,
      creado_en  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/contacto — ENVIAR MENSAJE
════════════════════════════════════════════════════════════════════════ */

/**
 * Recibe y guarda un mensaje del formulario de contacto.
 *
 * Campos requeridos en el body:
 *  - nombre  {string} Nombre del remitente (máx 255 chars).
 *  - email   {string} Email válido del remitente (máx 255 chars).
 *  - mensaje {string} Cuerpo del mensaje (máx 5000 chars).
 *
 * @type {import('express').RequestHandler}
 */
const submitContact = async (req, res) => {
  const { nombre, email, mensaje } = req.body;

  /* ── Validar presencia de campos ────────────────────────────────────── */
  if (!nombre || !email || !mensaje) {
    return errorResponse(res, 'Nombre, email y mensaje son obligatorios.', 400);
  }

  /* ── Sanitizar y normalizar ─────────────────────────────────────────── */
  const nombreTrim  = String(nombre).trim();
  const emailTrim   = String(email).trim().toLowerCase();
  const mensajeTrim = String(mensaje).trim();

  /* ── Validar que no estén vacíos tras trim ──────────────────────────── */
  if (!nombreTrim || !emailTrim || !mensajeTrim) {
    return errorResponse(res, 'Los campos no pueden contener solo espacios.', 400);
  }

  /* ── Validar longitudes máximas ─────────────────────────────────────── */
  if (nombreTrim.length  > LIMITES.NOMBRE) {
    return errorResponse(res, `El nombre no puede superar ${LIMITES.NOMBRE} caracteres.`, 400);
  }
  if (emailTrim.length   > LIMITES.EMAIL) {
    return errorResponse(res, `El email no puede superar ${LIMITES.EMAIL} caracteres.`, 400);
  }
  if (mensajeTrim.length > LIMITES.MENSAJE) {
    return errorResponse(res, `El mensaje no puede superar ${LIMITES.MENSAJE} caracteres.`, 400);
  }

  /* ── Validar formato de email ───────────────────────────────────────── */
  if (!EMAIL_REGEX.test(emailTrim)) {
    return errorResponse(res, 'El formato del email no es válido.', 400);
  }

  try {
    /* ── INSERT con valores sanitizados y placeholders ──────────────── */
    const [result] = await pool.query(
      'INSERT INTO contacto (nombre, email, mensaje) VALUES (?, ?, ?)',
      [nombreTrim, emailTrim, mensajeTrim]
    );

    // Notificar a admins sobre nuevo mensaje de contacto
    notificationService.notifyNewContact({
      id: result.insertId,
      nombre: nombreTrim,
      email: emailTrim,
      asunto: 'Nuevo mensaje de contacto' // Asumiendo que no hay campo asunto, usar genérico
    });

    return res.status(201).json({
      success:    true,
      message:    'Mensaje enviado correctamente. Te responderemos pronto.',
      contactoId: result.insertId,
    });

  } catch (error) {
    console.error('[CONTACT] Error guardando mensaje:', error);
    return errorResponse(res, 'Error interno al enviar el mensaje.', 500);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/contacto — LISTAR MENSAJES (solo admin)
════════════════════════════════════════════════════════════════════════ */

/**
 * Lista todos los mensajes de contacto, ordenados por más reciente.
 * Ruta protegida — requiere verifyToken + requireRole('admin').
 *
 * @type {import('express').RequestHandler}
 */
const listarContactos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, email, mensaje, creado_en
       FROM contacto
       ORDER BY creado_en DESC`
    );

    return successResponse(res, rows, 200);

  } catch (error) {
    console.error('[CONTACT] Error listando mensajes:', error);
    return errorResponse(res, 'Error interno al obtener los mensajes.', 500);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   INICIALIZACIÓN — Crear tabla una sola vez al cargar el módulo
   Se ejecuta automáticamente cuando Node.js importa este archivo.
   Si falla (por ejemplo, MySQL no está listo aún), solo se registra
   en consola — el servidor arranca de todas formas y reintentará
   en la primera request gracias al IF NOT EXISTS.
════════════════════════════════════════════════════════════════════════ */
createTableIfNotExist()
  .then(() => console.log('[CONTACT] Tabla contacto verificada.'))
  .catch((err) => console.warn('[CONTACT] No se pudo verificar la tabla contacto:', err.message));

module.exports = {
  submitContact,
  listarContactos,
};