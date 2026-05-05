/**
 * @fileoverview Reglas de validación para contacto.
 *
 * @module validators/contactValidator
 */

const { body } = require('express-validator');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contactValidator = [
    body('nombre')
        .notEmpty().withMessage('El nombre es obligatorio.')
        .isString().withMessage('El nombre debe ser texto.')
        .trim()
        .isLength({ min: 2, max: 255 }).withMessage('El nombre debe tener entre 2 y 255 caracteres.')
        .matches(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios.'),
    
    body('email')
        .notEmpty().withMessage('El email es obligatorio.')
        .matches(EMAIL_REGEX).withMessage('El formato del email no es válido.')
        .normalizeEmail()
        .isLength({ max: 255 }).withMessage('El email no puede superar 255 caracteres.'),
    
    body('mensaje')
        .notEmpty().withMessage('El mensaje es obligatorio.')
        .isString().withMessage('El mensaje debe ser texto.')
        .trim()
        .isLength({ min: 5, max: 5000 }).withMessage('El mensaje debe tener entre 5 y 5000 caracteres.'),
];

module.exports = contactValidator;