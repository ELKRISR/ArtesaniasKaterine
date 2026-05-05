/**
 * @fileoverview Rutas del módulo de productos — /api/productos/*
 *
 * Gestiona el catálogo de productos artesanales.
 *
 * Visibilidad por ruta:
 *  ┌─────────────────────────────────┬─────────┬──────────────────────┐
 *  │ Ruta                            │ Método  │ Acceso               │
 *  ├─────────────────────────────────┼─────────┼──────────────────────┤
 *  │ /api/productos                  │ GET     │ Público              │
 *  │ /api/productos/mis-productos    │ GET     │ Autenticado          │
 *  │ /api/productos/:id              │ GET     │ Público              │
 *  │ /api/productos                  │ POST    │ Solo admin           │
 *  │ /api/productos/:id              │ PUT     │ Solo admin           │
 *  │ /api/productos/:id              │ DELETE  │ Solo admin           │
 *  └─────────────────────────────────┴─────────┴──────────────────────┘
 *
 * CORRECCIÓN CRÍTICA DE ORDEN:
 *  La versión anterior definía `GET /:id` ANTES que `GET /mis-productos`.
 *  Express evalúa las rutas en orden de definición. Al recibir
 *  `GET /mis-productos`, Express lo capturaba con `/:id` tratando
 *  "mis-productos" como un ID, haciendo que `listarMisProductos` fuera
 *  completamente inalcanzable. La regla en Express Router es:
 *  las rutas con segmentos literales (GET /mis-productos) deben definirse
 *  ANTES que las rutas con parámetros dinámicos (GET /:id).
 *
 * @module routes/productos
 */

const express = require('express');
const router  = express.Router();

const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');
const validate    = require('../middlewares/validationResult');

const {
  crearProducto,
  listarProductos,
  listarMisProductos,
  actualizarProducto,
  eliminarProducto,
  obtenerProductoPorId,
  obtenerCategorias,
} = require('../controllers/productosController');

const {
  crearProductoValidator,
  actualizarProductoValidator,
} = require('../validators/productosValidator');

/**
 * Normaliza el campo de imagen recibido en el body.
 * Algunos clientes pueden enviar `imagen` y otros `imagen_url`.
 * El validator y el controller trabajan siempre con `imagen_url`.
 */
const normalizeImagenBody = (req, res, next) => {
  if (!req.body.imagen_url && req.body.imagen) {
    req.body.imagen_url = req.body.imagen;
  }
  next();
};

/* ── Swagger — tag y esquemas ──────────────────────────────────────────── */

/**
 * @swagger
 * tags:
 *   name: Productos
 *   description: Gestión del catálogo de productos artesanales
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Producto:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         nombre:
 *           type: string
 *         descripcion:
 *           type: string
 *           nullable: true
 *         precio:
 *           type: number
 *           format: float
 *         stock:
 *           type: integer
 *         categoria:
 *           type: string
 *           nullable: true
 *         imagen:
 *           type: string
 *           nullable: true
 *           description: URL de la imagen del producto
 *         usuario_id:
 *           type: integer
 *
 *     ProductoInput:
 *       type: object
 *       required: [nombre, precio, stock]
 *       properties:
 *         nombre:
 *           type: string
 *           minLength: 2
 *           maxLength: 255
 *           example: Mochila wayuu
 *         descripcion:
 *           type: string
 *           maxLength: 1000
 *           example: Tejida a mano con lana virgen
 *         precio:
 *           type: number
 *           format: float
 *           minimum: 0.01
 *           example: 85000
 *         stock:
 *           type: integer
 *           minimum: 0
 *           example: 12
 *         categoria:
 *           type: string
 *           maxLength: 100
 *           example: Textiles
 *         imagen_url:
 *           type: string
 *           format: uri
 *           maxLength: 500
 *           example: https://ejemplo.com/imagen.jpg
 */

/* ══════════════════════════════════════════════════════════════════════
   GET /api/productos — LISTAR TODOS (público)
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos:
 *   get:
 *     summary: Listar todos los productos
 *     description: Devuelve el catálogo completo. Ruta pública, no requiere autenticación.
 *     tags: [Productos]
 *     responses:
 *       200:
 *         description: Lista de productos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Producto'
 */
router.get('/', listarProductos);

/* ══════════════════════════════════════════════════════════════════════
   GET /api/productos/categorias — LISTAR CATEGORÍAS (público)
══════════════════════════════════════════════════════════════════════ */

router.get('/categorias', obtenerCategorias);

/* ══════════════════════════════════════════════════════════════════════
   GET /api/productos/mis-productos — MIS PRODUCTOS (autenticado)
   ⚠️ DEBE ir ANTES que GET /:id para que Express no lo capture como ID
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos/mis-productos:
 *   get:
 *     summary: Listar productos del usuario autenticado
 *     description: |
 *       Devuelve solo los productos creados por el usuario del token.
 *       ⚠️ Esta ruta debe estar definida antes que GET /:id en el código
 *       para que Express no interprete "mis-productos" como un ID numérico.
 *     tags: [Productos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de productos del usuario
 *       401:
 *         description: Token no proporcionado
 */
router.get('/mis-productos', verifyToken, listarMisProductos);

/* ══════════════════════════════════════════════════════════════════════
   GET /api/productos/:id — OBTENER POR ID (público)
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos/{id}:
 *   get:
 *     summary: Obtener producto por ID
 *     description: Devuelve un producto por su ID. Ruta pública.
 *     tags: [Productos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Producto encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Producto'
 *       400:
 *         description: ID no válido
 *       404:
 *         description: Producto no encontrado
 */
router.get('/:id', obtenerProductoPorId);

/* ══════════════════════════════════════════════════════════════════════
   POST /api/productos — CREAR PRODUCTO (solo admin)
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos:
 *   post:
 *     summary: Crear un nuevo producto
 *     description: |
 *       Solo accesible por administradores.
 *       El campo `imagen_url` se guarda en la columna `imagen` de la DB.
 *     tags: [Productos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductoInput'
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
 *       400:
 *         description: Errores de validación
 *       401:
 *         description: Token no proporcionado
 *       403:
 *         description: No tienes permisos (rol admin requerido)
 */
router.post(
  '/',
  verifyToken,
  requireRole('admin'),
  normalizeImagenBody,
  crearProductoValidator,
  validate,
  crearProducto
);

/* ══════════════════════════════════════════════════════════════════════
   PUT /api/productos/:id — ACTUALIZAR PRODUCTO (solo admin)
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos/{id}:
 *   put:
 *     summary: Actualizar un producto existente
 *     description: Solo accesible por administradores. Actualiza todos los campos.
 *     tags: [Productos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductoInput'
 *     responses:
 *       200:
 *         description: Producto actualizado correctamente
 *       400:
 *         description: Errores de validación o ID inválido
 *       401:
 *         description: Token no proporcionado
 *       403:
 *         description: No tienes permisos
 *       404:
 *         description: Producto no encontrado
 */
router.put(
  '/:id',
  verifyToken,
  requireRole('admin'),
  normalizeImagenBody,
  actualizarProductoValidator,
  validate,
  actualizarProducto
);

/* ══════════════════════════════════════════════════════════════════════
   DELETE /api/productos/:id — ELIMINAR PRODUCTO (solo admin)
══════════════════════════════════════════════════════════════════════ */

/**
 * @swagger
 * /productos/{id}:
 *   delete:
 *     summary: Eliminar un producto
 *     description: |
 *       Solo accesible por administradores.
 *       Si el producto tiene pedidos activos, la operación fallará por
 *       restricción de clave foránea en la base de datos.
 *     tags: [Productos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Producto eliminado correctamente
 *       400:
 *         description: ID no válido
 *       401:
 *         description: Token no proporcionado
 *       403:
 *         description: No tienes permisos
 *       404:
 *         description: Producto no encontrado
 */
router.delete(
  '/:id',
  verifyToken,
  requireRole('admin'),
  eliminarProducto
);

module.exports = router;