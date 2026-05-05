const express = require('express');
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const requireRole = require("../middlewares/requireRole");
const { submitContact, listarContactos } = require('../controllers/contactController');

// 🔒 Validador
const contactValidator = require('../validators/contactValidator');
const validate = require('../middlewares/validationResult');

/**
 * @swagger
 * tags:
 *   name: Contacto
 *   description: Formulario de contacto
 */

/**
 * @swagger
 * /contacto:
 *   post:
 *     summary: Enviar mensaje de contacto
 *     tags: [Contacto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - email
 *               - mensaje
 *             properties:
 *               nombre:
 *                 type: string
 *               email:
 *                 type: string
 *               mensaje:
 *                 type: string
 *     responses:
 *       201:
 *         description: Mensaje enviado exitosamente
 *       400:
 *         description: Datos inválidos
 */
router.post('/', contactValidator, validate, submitContact);

/**
 * @swagger
 * /contacto:
 *   get:
 *     summary: Listar mensajes de contacto (admin)
 *     tags: [Contacto]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de mensajes
 */
router.get('/', verifyToken, requireRole("admin"), listarContactos);

module.exports = router;