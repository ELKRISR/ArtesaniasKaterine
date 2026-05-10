/**
 * @fileoverview Configuración y exportación del pool de conexiones MySQL.
 *
 * Usa `mysql2/promise` para obtener soporte nativo de async/await sin
 * necesidad de promisificar manualmente las queries.
 *
 * Se exporta un único `pool` compartido por toda la aplicación.
 * Crear un pool por módulo o por request sería un error grave de rendimiento:
 * un pool reutiliza conexiones existentes en lugar de abrir una nueva
 * conexión TCP en cada operación.
 *
 * Variables de entorno requeridas en `.env`:
 *   DB_HOST     → host del servidor MySQL  (ej: "localhost")
 *   DB_USER     → usuario de la base       (ej: "root")
 *   DB_PASS     → contraseña               (ej: "tu_password")
 *   DB_NAME     → nombre de la base        (ej: "artesanias_db")
 *
 * @module models/db
 *
 * @example
 * // Uso básico en un controlador:
 * const pool = require('../models/db');
 *
 * const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
 *
 * @example
 * // Uso con transacción:
 * const connection = await pool.getConnection();
 * await connection.beginTransaction();
 * try {
 *   await connection.query('UPDATE ...', [...]);
 *   await connection.commit();
 * } catch (err) {
 *   await connection.rollback();
 * } finally {
 *   connection.release(); // SIEMPRE liberar la conexión al pool
 * }
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Pool de conexiones a MySQL.
 *
 * Configuración del pool:
 * - `connectionLimit`   : máximo de conexiones simultáneas abiertas.
 *                         10 es un valor seguro para desarrollo/staging.
 *                         Ajustar según el plan del servidor en producción.
 * - `waitForConnections`: si true, las queries esperan en cola cuando
 *                         el pool está lleno, en lugar de lanzar error.
 * - `queueLimit`        : máximo de queries en espera (0 = sin límite).
 * - `timezone`          : fuerza UTC en todas las operaciones de fecha,
 *                         evitando desfases horarios entre el servidor
 *                         Node y MySQL. CORRECCIÓN: sin esto, fechas de
 *                         pedidos pueden aparecer desplazadas según la
 *                         zona horaria del servidor.
 *
 * @type {import('mysql2/promise').Pool}
 */
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port:     4000, // Puerto de TiDB Cloud

  // Gestión del pool
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,

  // Fechas siempre en UTC — evita desfases horarios
  timezone: '+00:00',

  // SSL para producción (TiDB Cloud)
  ssl: {
    require: true,
    rejectUnauthorized: true  // Seguro para producción
  }
});

module.exports = pool;