/**
 * @fileoverview Reglas de validación para autenticación.
 *
 * Previene inyección de código malicioso en campos de login/registro.
 *
 * @module validators/authValidator
 */

const { body } = require('express-validator');

/** Expresión regular para email válido */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Expresión regular para contraseña segura (mínimo 8 chars, al menos 1 número) */
const PASSWORD_REGEX = /^(?=.*\d).{8,}$/;

/**
 * Validación para login
 */
const loginValidator = [
    body('email')
        .notEmpty().withMessage('El email es obligatorio.')
        .isEmail().withMessage('El email no es válido.')
        .normalizeEmail() // Normaliza email (lowercase, trim)
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres.'),
    
    body('password')
        .notEmpty().withMessage('La contraseña es obligatoria.')
        .isString().withMessage('La contraseña debe ser texto.')
        .isLength({ min: 1, max: 255 }).withMessage('La contraseña no puede superar 255 caracteres.'),
];

/**
 * Validación para registro
 */
const registerValidator = [
    body('nombre')
        .notEmpty().withMessage('El nombre es obligatorio.')
        .isString().withMessage('El nombre debe ser texto.')
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres.')
        .matches(/^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$/).withMessage('El nombre solo puede contener letras y espacios.'),
    
    body('email')
        .notEmpty().withMessage('El email es obligatorio.')
        .matches(EMAIL_REGEX).withMessage('El formato del email no es válido.')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('El email no puede superar 100 caracteres.'),
    
    body('password')
        .notEmpty().withMessage('La contraseña es obligatoria.')
        .matches(PASSWORD_REGEX).withMessage('La contraseña debe tener al menos 8 caracteres y un número.')
        .isLength({ max: 255 }).withMessage('La contraseña no puede superar 255 caracteres.'),
];

module.exports = {
    loginValidator,
    registerValidator,
};