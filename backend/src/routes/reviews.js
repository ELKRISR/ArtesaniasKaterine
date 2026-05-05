/**
 * ==============================
 * RUTAS DE RESEÑAS
 * ==============================
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const reviewsController = require('../controllers/reviewsController');

// Crear reseña (requiere auth)
router.post('/', verifyToken, reviewsController.crearReview);

// Obtener reseñas de un producto (público)
router.get('/producto/:productoId', reviewsController.obtenerReviewsProducto);

// Obtener mis reseñas (requiere auth)
router.get('/mis-reviews', verifyToken, reviewsController.obtenerMisReviews);

module.exports = router;