/**
 * ==============================
 * RUTAS DE WISHLIST
 * ==============================
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const wishlistController = require('../controllers/wishlistController');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Obtener wishlist del usuario
router.get('/', wishlistController.obtenerWishlist);

// Agregar producto a wishlist
router.post('/', wishlistController.agregarAWishlist);

// Remover producto de wishlist
router.delete('/:productoId', wishlistController.removerDeWishlist);

// Verificar si producto está en wishlist
router.get('/check/:productoId', wishlistController.verificarEnWishlist);

module.exports = router;