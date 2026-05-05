/**
 * @fileoverview Reglas de validación para pedidos.
 *
 * @module validators/pedidoValidator
 */

const { body, param } = require('express-validator');

/**
 * Validación para crear pedido
 */
const crearPedidoValidator = [
    body('items')
        .isArray({ min: 1 }).withMessage('El carrito no puede estar vacío.')
        .custom((items) => {
            for (const item of items) {
                if (!item.productoId || typeof item.productoId !== 'number' || item.productoId <= 0) {
                    throw new Error('Cada item debe tener un productoId válido');
                }
                if (!item.cantidad || typeof item.cantidad !== 'number' || item.cantidad <= 0) {
                    throw new Error('Cada item debe tener una cantidad válida');
                }
            }
            return true;
        }),
    
    body('paymentMethod')
        .notEmpty().withMessage('El método de pago es obligatorio.')
        .isIn(['efectivo', 'tarjeta']).withMessage('Método de pago inválido.'),
    
    body('card')
        .optional()
        .custom((card, { req }) => {
            if (req.body.paymentMethod === 'tarjeta') {
                if (!card) throw new Error('Datos de tarjeta requeridos');
                if (!card.nombre || typeof card.nombre !== 'string' || card.nombre.trim().length < 3) {
                    throw new Error('Nombre en la tarjeta inválido');
                }
                if (!card.numero || !/^\d{16}$/.test(card.numero.replace(/\s+/g, ''))) {
                    throw new Error('Número de tarjeta inválido (16 dígitos)');
                }
                if (!card.expiracion || !/^\d{2}\/\d{2}$/.test(card.expiracion)) {
                    throw new Error('Fecha de expiración inválida (MM/AA)');
                }
                if (!card.cvv || !/^\d{3,4}$/.test(card.cvv)) {
                    throw new Error('CVV inválido (3-4 dígitos)');
                }
            }
            return true;
        }),
];

/**
 * Validación para ID en parámetros de ruta
 */
const idParamValidator = [
    param('id')
        .isInt({ min: 1 }).withMessage('ID inválido.')
        .toInt(),
];

/**
 * Validación para cambiar estado
 */
const cambiarEstadoValidator = [
    param('id').isInt({ min: 1 }).withMessage('ID inválido.'),
    body('estado')
        .notEmpty().withMessage('El estado es obligatorio.')
        .isIn(['pendiente', 'pagado', 'enviado', 'cancelado'])
        .withMessage('Estado inválido.'),
];

/**
 * Validación para crear sesión de pago Bold
 */
const crearBoldSessionValidator = [
    body('cliente')
        .notEmpty().withMessage('Datos del cliente son obligatorios.')
        .custom((cliente) => {
            if (!cliente.nombre || typeof cliente.nombre !== 'string' || cliente.nombre.trim().length < 2) {
                throw new Error('Nombre del cliente debe tener al menos 2 caracteres');
            }
            if (!cliente.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
                throw new Error('Email del cliente inválido');
            }
            if (!cliente.direccion || typeof cliente.direccion !== 'string' || cliente.direccion.trim().length < 5) {
                throw new Error('Dirección debe tener al menos 5 caracteres');
            }
            if (!cliente.telefono || typeof cliente.telefono !== 'string' || cliente.telefono.trim().length < 7) {
                throw new Error('Teléfono debe tener al menos 7 caracteres');
            }
            return true;
        }),
    
    body('items')
        .isArray({ min: 1 }).withMessage('El carrito no puede estar vacío.')
        .custom((items) => {
            for (const item of items) {
                if (!item.productoId || typeof item.productoId !== 'number' || item.productoId <= 0) {
                    throw new Error('Cada item debe tener un productoId válido');
                }
                if (!item.cantidad || typeof item.cantidad !== 'number' || item.cantidad <= 0) {
                    throw new Error('Cada item debe tener una cantidad válida');
                }
            }
            return true;
        }),
];

module.exports = {
    crearPedidoValidator,
    idParamValidator,
    cambiarEstadoValidator,
    crearBoldSessionValidator,
};