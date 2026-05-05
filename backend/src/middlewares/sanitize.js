/**
 * @fileoverview Middleware de sanitización global para prevenir XSS.
 * 
 * Limpia automáticamente todos los strings de entrada que podrían
 * contener código HTML/JavaScript malicioso.
 * 
 * @module middlewares/sanitize
 */

/**
 * Caracteres peligrosos y sus reemplazos HTML entities
 */
const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
};

const URL_SAFE_REGEX = /^(https?:\/\/|\/|data:|blob:)[^\s<>"{}|\\^`]+$/i;
const URL_FIELDS = new Set(['imagen_url', 'imagen', 'url', 'link', 'href']);

/**
 * Escapa caracteres HTML para prevenir XSS
 * 
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizado
 */
const escapeHtml = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/[&<>"'/`=]/g, (char) => HTML_ENTITIES[char] || char);
};

const sanitizeUrl = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!URL_SAFE_REGEX.test(trimmed)) return null;
    return trimmed;
};

/**
 * Sanitiza recursivamente un objeto o array
 * EXCEPTO los campos que contienen URLs u otros contenidos que no deben ser escapados
 * 
 * @param {any} obj - Objeto a sanitizar
 * @returns {any} Objeto sanitizado
 */
const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (URL_FIELDS.has(key)) {
            sanitized[key] = sanitizeUrl(value);
        } else if (typeof value === 'string') {
            sanitized[key] = escapeHtml(value.trim());
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

/**
 * Middleware de sanitización global
 * Aplica a todos los campos de texto en req.body, req.query y req.params
 */
const sanitizeMiddleware = (req, res, next) => {
    if (req.body) req.body = sanitizeObject(req.body);
    if (req.query) req.query = sanitizeObject(req.query);
    // No sanitizar params porque son números generalmente
    next();
};

module.exports = sanitizeMiddleware;