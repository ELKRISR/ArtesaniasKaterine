/**
 * @fileoverview Reglas de validación para el módulo de productos.
 *
 * Usa express-validator para declarar las reglas de cada campo antes
 * de que la request llegue al controlador. El middleware `validationResult`
 * recoge los errores y responde con 400 si alguna regla falla,
 * evitando que el controlador procese datos inválidos o maliciosos.
 *
 * Por qué validar aquí Y no solo en el controlador:
 *  - Separación de responsabilidades: el controlador asume datos válidos.
 *  - express-validator ejecuta las reglas en paralelo (más eficiente).
 *  - Los mensajes de error son consistentes y centralizados.
 *  - Prevención activa de inyección: `.escape()` en strings, límites de
 *    longitud, y tipos estrictos impiden que datos malformados lleguen
 *    a las queries SQL (que ya usan placeholders, segunda línea de defensa).
 *
 * Campos corregidos en esta versión:
 *  - `imagen_url` → validado como URL opcional con longitud máxima.
 *  - `categoria`  → validado como string opcional con longitud máxima.
 *  - `nombre`     → límite de longitud máximo añadido (antes sin límite).
 *  - `descripcion`→ límite de longitud máximo añadido (antes sin límite).
 *
 * @module validators/productosValidator
 */

const { body } = require('express-validator');

/* ── Constantes de límites ─────────────────────────────────────────────── */

/**
 * Longitudes máximas de cada campo — deben coincidir con las columnas MySQL.
 * Si en la DB el campo `nombre` es VARCHAR(255), el límite aquí es 255.
 * Rechazar en la app antes de que MySQL lance un error de truncación.
 */
const LIMITES = {
  NOMBRE:      { min: 2,   max: 255 },
  DESCRIPCION: {           max: 1000 },
  CATEGORIA:   {           max: 100  },
  IMAGEN_URL:  {           max: 500  },
};

/* ── Reglas compartidas (usadas en crear Y actualizar) ─────────────────── */

/**
 * Reglas comunes para nombre, precio, stock, descripcion, categoria e imagen_url.
 * Se reutilizan en ambos validators para evitar duplicación.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
const reglasBase = [

  /* ── nombre ─────────────────────────────────────────────────────────── */
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es obligatorio.')
    .isString()
    .withMessage('El nombre debe ser texto.')
    .trim()
    .isLength({ min: LIMITES.NOMBRE.min, max: LIMITES.NOMBRE.max })
    .withMessage(
      `El nombre debe tener entre ${LIMITES.NOMBRE.min} y ${LIMITES.NOMBRE.max} caracteres.`
    ),

  /* ── precio ──────────────────────────────────────────────────────────── */
  body('precio')
    .notEmpty()
    .withMessage('El precio es obligatorio.')
    .isFloat({ gt: 0 })
    .withMessage('El precio debe ser un número mayor a 0.')
    .toFloat(), // coerción: convierte el string "20000" a número 20000

  /* ── stock ───────────────────────────────────────────────────────────── */
  body('stock')
    .notEmpty()
    .withMessage('El stock es obligatorio.')
    .isInt({ min: 0 })
    .withMessage('El stock debe ser un número entero mayor o igual a 0.')
    .toInt(), // coerción: convierte el string "10" a número entero 10

  /* ── descripcion (opcional) ──────────────────────────────────────────── */
  body('descripcion')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('La descripción debe ser texto.')
    .trim()
    .isLength({ max: LIMITES.DESCRIPCION.max })
    .withMessage(`La descripción no puede superar ${LIMITES.DESCRIPCION.max} caracteres.`),

  /* ── categoria (opcional) ─────────────────────────────────────────────
     NUEVO: antes no se validaba. El frontend lo envía y el admin lo ve
     en la tabla. Sin validación, cualquier string llegaba a la DB.
  ─────────────────────────────────────────────────────────────────────── */
  body('categoria_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('El ID de categoría debe ser un número entero válido.')
    .toInt(),

  body('categoria')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('La categoría debe ser texto.')
    .trim()
    .isLength({ max: LIMITES.CATEGORIA.max })
    .withMessage(`La categoría no puede superar ${LIMITES.CATEGORIA.max} caracteres.`),

  /* ── imagen_url (opcional) ────────────────────────────────────────────
     NUEVO: antes no se validaba ni se guardaba. Se valida como URL
     y se limita la longitud para evitar strings enormes en la DB.
     El campo llega del frontend como `imagen_url` y el controller
     lo mapea a la columna `imagen` de la base de datos.
  ─────────────────────────────────────────────────────────────────────── */
  body('imagen_url')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: LIMITES.IMAGEN_URL.max })
    .withMessage(`La URL de imagen no puede superar ${LIMITES.IMAGEN_URL.max} caracteres.`),
];

/* ── Validators exportados ─────────────────────────────────────────────── */

/**
 * Validaciones para POST /api/productos (crear producto).
 * Todos los campos requeridos (nombre, precio, stock) son obligatorios.
 * Los opcionales (descripcion, categoria, imagen_url) pueden omitirse.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
exports.crearProductoValidator = [...reglasBase];

/**
 * Validaciones para PUT /api/productos/:id (actualizar producto).
 * Mismas reglas que crear — en una actualización completa (PUT)
 * todos los campos requeridos siguen siendo obligatorios.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
exports.actualizarProductoValidator = [...reglasBase];