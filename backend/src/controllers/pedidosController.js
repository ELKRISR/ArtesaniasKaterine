const pool = require("../models/db");
const { successResponse, errorResponse } = require("../utils/response");
const PDFDocument = require("pdfkit");
const { generatePayUSignature, getPayUBaseUrl } = require("../utils/payuHelper");
const notificationService = require("../services/notificationService");
const emailService = require("../services/emailService");

/* =========================
   HELPERS
========================= */

const formatCOP = (value) =>
  Number(value).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
  });

/* =========================
   CREAR PEDIDO (CLIENTE)
========================= */
const crearPedido = async (req, res) => {
  const usuarioId = req.usuario?.id;
  const { items, paymentMethod, card } = req.body;

  if (!usuarioId) {
    return errorResponse(res, "Usuario no autenticado", 401);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return errorResponse(res, "Items inválidos", 400);
  }

  if (!paymentMethod || !["efectivo", "tarjeta"].includes(paymentMethod)) {
    return errorResponse(res, "Método de pago inválido", 400);
  }

  if (paymentMethod === "tarjeta") {
    if (!card?.nombre || !card?.numero || !card?.expiracion || !card?.cvv) {
      return errorResponse(res, "Datos de tarjeta incompletos", 400);
    }
    if (!/^\d{16}$/.test(card.numero.replace(/\s+/g, ""))) {
      return errorResponse(res, "Número de tarjeta inválido", 400);
    }
    if (!/^\d{2}\/\d{2}$/.test(card.expiracion)) {
      return errorResponse(res, "Fecha de tarjeta inválida", 400);
    }
    if (!/^\d{3,4}$/.test(card.cvv)) {
      return errorResponse(res, "CVV inválido", 400);
    }
  }

  const itemsMap = {};

  for (const item of items) {
    if (!item.productoId || !item.cantidad || item.cantidad <= 0) {
      return errorResponse(res, "Producto o cantidad inválida", 400);
    }

    if (itemsMap[item.productoId]) {
      itemsMap[item.productoId] += item.cantidad;
    } else {
      itemsMap[item.productoId] = item.cantidad;
    }
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let total = 0;
    const productosMap = {};

    for (const productoId in itemsMap) {
      const cantidad = itemsMap[productoId];

      const [producto] = await connection.query(
        "SELECT precio, stock FROM productos WHERE id = ? FOR UPDATE",
        [productoId]
      );

      if (producto.length === 0) {
        throw new Error(`Producto con ID ${productoId} no encontrado`);
      }

      const { precio, stock } = producto[0];

      if (stock < cantidad) {
        throw new Error(`Stock insuficiente para producto ID ${productoId}`);
      }

      productosMap[productoId] = precio;
      total += precio * cantidad;

      await connection.query(
        "UPDATE productos SET stock = stock - ? WHERE id = ?",
        [cantidad, productoId]
      );
    }

    const [pedidoResult] = await connection.query(
      "INSERT INTO pedidos (usuario_id, total, estado) VALUES (?, ?, ?)",
      [usuarioId, total, "pendiente"]
    );

    const pedidoId = pedidoResult.insertId;

    for (const productoId in itemsMap) {
      await connection.query(
        `INSERT INTO detalle_pedido 
         (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES (?, ?, ?, ?)`,
        [
          pedidoId,
          productoId,
          itemsMap[productoId],
          productosMap[productoId]
        ]
      );
    }

    await connection.query(
      `INSERT INTO pedido_historial 
       (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES (?, ?, ?, ?)`,
      [pedidoId, null, "pendiente", usuarioId]
    );

    await connection.commit();

    // Notificar a admins sobre nuevo pedido
    const [pedidoData] = await connection.query(
      "SELECT p.id, p.total, u.nombre as nombre_cliente, u.email, COUNT(dp.id) as productos FROM pedidos p JOIN usuarios u ON p.usuario_id = u.id LEFT JOIN detalle_pedido dp ON p.id = dp.pedido_id WHERE p.id = ? GROUP BY p.id",
      [pedidoId]
    );
    notificationService.notifyNewOrder(pedidoData[0]);

    // Enviar email de confirmación al cliente
    try {
      const [productos] = await connection.query(
        "SELECT dp.cantidad, dp.precio_unitario, pr.nombre FROM detalle_pedido dp JOIN productos pr ON dp.producto_id = pr.id WHERE dp.pedido_id = ?",
        [pedidoId]
      );
      await emailService.sendOrderConfirmation(pedidoData[0].email, {
        id: pedidoData[0].id,
        cliente: pedidoData[0].nombre_cliente,
        total: pedidoData[0].total,
        productos: productos.map(p => ({
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio: p.precio_unitario * p.cantidad
        }))
      });
    } catch (emailError) {
      console.error('Error enviando email de confirmación:', emailError);
      // No fallar el pedido por error de email
    }

    return successResponse(res, {
      mensaje: "Pedido creado exitosamente",
      pedidoId,
      total
    });

  } catch (error) {
    if (connection) await connection.rollback();
    return errorResponse(res, error.message, 400);
  } finally {
    if (connection) connection.release();
  }
};


/* =========================
   PAGAR PEDIDO (CLIENTE)
========================= */
const pagarPedido = async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, "Usuario no autenticado", 401);
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [pedidoRows] = await connection.query(
      "SELECT estado, usuario_id FROM pedidos WHERE id = ? FOR UPDATE",
      [id]
    );

    if (pedidoRows.length === 0) {
      throw new Error("Pedido no encontrado");
    }

    const pedido = pedidoRows[0];

    if (pedido.usuario_id !== usuarioId) {
      return errorResponse(res, "No autorizado", 403);
    }

    if (pedido.estado !== "pendiente") {
      throw new Error("Solo se pueden pagar pedidos en estado pendiente");
    }

    await connection.query(
      `INSERT INTO pedido_historial
       (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES (?, ?, ?, ?)`,
      [id, pedido.estado, "pagado", usuarioId]
    );

    await connection.query(
      "UPDATE pedidos SET estado = 'pagado' WHERE id = ?",
      [id]
    );

    await connection.commit();

    // Notificar pago recibido
    const [pedidoData] = await connection.query(
      "SELECT id, total, usuario_id FROM pedidos WHERE id = ?",
      [id]
    );
    notificationService.notifyPaymentReceived({ ...pedidoData[0], metodo_pago: 'efectivo' }); // Asumiendo efectivo por ahora
    // Enviar email de confirmación de pago
    try {
      const [userData] = await connection.query(
        "SELECT email FROM usuarios WHERE id = ?",
        [pedidoData[0].usuario_id]
      );
      if (userData[0]?.email) {
        await emailService.sendPaymentConfirmation(userData[0].email, pedidoData[0]);
      }
    } catch (emailError) {
      console.error('Error enviando email de pago:', emailError);
    }
    return successResponse(res, {
      mensaje: "Pago realizado exitosamente"
    });

  } catch (error) {
    if (connection) await connection.rollback();
    return errorResponse(res, error.message, 400);
  } finally {
    if (connection) connection.release();
  }
};

/* =========================
   CREAR SESIÓN DE STRIPE
========================= */
const crearPedidoPayUSession = async (req, res) => {
  const usuarioId = req.usuario?.id;
  const { cliente, items } = req.body;

  if (!usuarioId) {
    return errorResponse(res, "Usuario no autenticado", 401);
  }

  if (!cliente || !cliente.nombre || !cliente.email || !cliente.direccion || !cliente.telefono) {
    return errorResponse(res, "Datos de cliente incompletos", 400);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return errorResponse(res, "Items inválidos", 400);
  }

  const itemsMap = {};

  for (const item of items) {
    if (!item.productoId || !item.cantidad || item.cantidad <= 0) {
      return errorResponse(res, "Producto o cantidad inválida", 400);
    }

    itemsMap[item.productoId] = (itemsMap[item.productoId] || 0) + item.cantidad;
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let total = 0;
    const productosMap = {};

    for (const productoId of Object.keys(itemsMap)) {
      const cantidad = itemsMap[productoId];

      const [producto] = await connection.query(
        "SELECT id, nombre, precio, stock FROM productos WHERE id = ? FOR UPDATE",
        [productoId]
      );

      if (producto.length === 0) {
        throw new Error(`Producto con ID ${productoId} no encontrado`);
      }

      const { precio, stock } = producto[0];

      if (stock < cantidad) {
        throw new Error(`Stock insuficiente para producto ID ${productoId}`);
      }

      productosMap[productoId] = precio;
      total += precio * cantidad;

      await connection.query(
        "UPDATE productos SET stock = stock - ? WHERE id = ?",
        [cantidad, productoId]
      );
    }

    const [pedidoResult] = await connection.query(
      "INSERT INTO pedidos (usuario_id, total, estado) VALUES (?, ?, ?)",
      [usuarioId, total, "pendiente"]
    );

    const pedidoId = pedidoResult.insertId;

    for (const productoId of Object.keys(itemsMap)) {
      await connection.query(
        `INSERT INTO detalle_pedido 
         (pedido_id, producto_id, cantidad, precio_unitario)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, productoId, itemsMap[productoId], productosMap[productoId]]
      );
    }

    // Validar credenciales de PayU
    if (!process.env.PAYU_MERCHANT_ID || !process.env.PAYU_API_KEY || !process.env.PAYU_ACCOUNT_ID) {
      throw new Error("Credenciales de PayU no configuradas");
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const referenceCode = `pedido-${pedidoId}-${Date.now()}`;

    // Generar firma HMAC
    const signature = generatePayUSignature(
      process.env.PAYU_API_KEY,
      process.env.PAYU_MERCHANT_ID,
      referenceCode,
      total,
      "COP"
    );

    const payuFormUrl = getPayUBaseUrl(process.env.PAYU_SANDBOX === "true");

    // Parámetros del formulario de PayU
    const payuParams = {
      merchantId: process.env.PAYU_MERCHANT_ID,
      accountId: process.env.PAYU_ACCOUNT_ID,
      referenceCode,
      amount: Number(total).toFixed(2),
      currency: "COP",
      signature,
      buyerEmail: cliente.email,
      buyerFullName: cliente.nombre,
      buyerPhone: cliente.telefono,
      shippingAddress: cliente.direccion,
      responseUrl: `${frontendUrl}/checkout`,
      confirmationUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/pedidos/webhook`,
      test: process.env.PAYU_SANDBOX === "true" ? 1 : 0,
      buyerTaxId: "123",
      buyerTaxType: "CC",
      extra1: pedidoId, // Guardar el ID del pedido
    };

    await connection.commit();

    return successResponse(res, {
      payuFormUrl,
      payuParams,
      pedidoId,
      total,
      referenceCode,
    }, 201);

  } catch (error) {
    if (connection) await connection.rollback();
    return errorResponse(res, error.message, 400);
  } finally {
    if (connection) connection.release();
  }
};

const handlePayUWebhook = async (req, res) => {
  /**
   * PayU envía los parámetros como POST form-encoded
   * Los parámetros principales son:
   * - merchant_id
   * - reference_code
   * - transaction_id
   * - state (4 = aprobado, 5 = declinado, 6 = fallido, 104 = pendiente)
   * - response_code
   * - value
   * - currency
   * - signature
   * - extra1 (nuestro pedidoId)
   */

  const {
    extra1: pedidoId,
    state: transactionState,
    value,
    signature: payuSignature,
    reference_code: referenceCode,
    currency,
  } = req.body;

  if (!pedidoId || !transactionState) {
    return res.status(400).json({ error: "Parámetros incompletos" });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [pedidoRows] = await connection.query(
      "SELECT estado, usuario_id FROM pedidos WHERE id = ? FOR UPDATE",
      [pedidoId]
    );

    if (pedidoRows.length === 0) {
      throw new Error("Pedido no encontrado");
    }

    const pedido = pedidoRows[0];

    // Estado 4 en PayU significa aprobado
    if (transactionState === "4" && pedido.estado === "pendiente") {
      await connection.query(
        `INSERT INTO pedido_historial
         (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, pedido.estado, "pagado", pedido.usuario_id]
      );

      await connection.query(
        "UPDATE pedidos SET estado = 'pagado' WHERE id = ?",
        [pedidoId]
      );
    }

    // Estado 5 o 6 significa declinado o fallido
    if ((transactionState === "5" || transactionState === "6") && pedido.estado === "pendiente") {
      // Restaurar stock
      const [detalle] = await connection.query(
        "SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?",
        [pedidoId]
      );

      for (const item of detalle) {
        await connection.query(
          "UPDATE productos SET stock = stock + ? WHERE id = ?",
          [item.cantidad, item.producto_id]
        );
      }

      await connection.query(
        `INSERT INTO pedido_historial
         (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
         VALUES (?, ?, ?, ?)`,
        [pedidoId, pedido.estado, "cancelado", pedido.usuario_id]
      );

      await connection.query(
        "UPDATE pedidos SET estado = 'cancelado' WHERE id = ?",
        [pedidoId]
      );
    }

    await connection.commit();
    return res.status(200).json({ received: true });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error procesando webhook de PayU:", error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
};


/* =========================
   LISTAR TODOS (ADMIN)
========================= */
const listarPedidos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, usuario_id, total, estado, fecha
       FROM pedidos
       ORDER BY id DESC`
    );

    return successResponse(res, rows);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   LISTAR MIS PEDIDOS
========================= */
const listarMisPedidos = async (req, res) => {
  const usuarioId = req.usuario?.id;

  if (!usuarioId) {
    return errorResponse(res, "Usuario no autenticado", 401);
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, total, estado, fecha
       FROM pedidos
       WHERE usuario_id = ?
       ORDER BY id DESC`,
      [usuarioId]
    );

    return successResponse(res, rows);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   OBTENER PEDIDO POR ID
========================= */
const obtenerPedidoPorId = async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario?.id;
  const rol = req.usuario?.rol;

  try {
    let query = `
      SELECT id, usuario_id, total, estado, fecha
      FROM pedidos
      WHERE id = ?
    `;

    let params = [id];

    if (rol !== "admin") {
      query += " AND usuario_id = ?";
      params.push(usuarioId);
    }

    const [pedido] = await pool.query(query, params);

    if (pedido.length === 0) {
      return errorResponse(res, "Pedido no encontrado o no autorizado", 404);
    }

    const [detalle] = await pool.query(
      `SELECT dp.producto_id, p.nombre, dp.cantidad, dp.precio_unitario
       FROM detalle_pedido dp
       JOIN productos p ON dp.producto_id = p.id
       WHERE dp.pedido_id = ?`,
      [id]
    );

    return successResponse(res, {
      ...pedido[0],
      detalle
    });

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};


/* =========================
   CAMBIAR ESTADO (ADMIN)
========================= */
const cambiarEstadoPedido = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const usuarioId = req.usuario?.id;

  const estadosValidos = ["pendiente", "pagado", "enviado", "cancelado"];

  if (!estado || !estadosValidos.includes(estado)) {
    return errorResponse(res, "Estado inválido", 400);
  }

  const transicionesPermitidas = {
    pendiente: ["pagado", "cancelado"],
    pagado: ["enviado", "cancelado"],
    enviado: [],
    cancelado: []
  };

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [pedidoRows] = await connection.query(
      "SELECT estado FROM pedidos WHERE id = ? FOR UPDATE",
      [id]
    );

    if (pedidoRows.length === 0) {
      throw new Error("Pedido no encontrado");
    }

    const estadoActual = pedidoRows[0].estado;

    if (!transicionesPermitidas[estadoActual].includes(estado)) {
      throw new Error(`No se puede cambiar de ${estadoActual} a ${estado}`);
    }

    if (estado === "cancelado") {
      const [detalle] = await connection.query(
        "SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?",
        [id]
      );

      for (const item of detalle) {
        await connection.query(
          "UPDATE productos SET stock = stock + ? WHERE id = ?",
          [item.cantidad, item.producto_id]
        );
      }
    }

    await connection.query(
      `INSERT INTO pedido_historial 
       (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES (?, ?, ?, ?)`,
      [id, estadoActual, estado, usuarioId]
    );

    await connection.query(
      "UPDATE pedidos SET estado = ? WHERE id = ?",
      [estado, id]
    );

    await connection.commit();

    return successResponse(res, {
      mensaje: "Estado actualizado correctamente"
    });

  } catch (error) {
    if (connection) await connection.rollback();
    return errorResponse(res, error.message, 400);
  } finally {
    if (connection) connection.release();
  }
};


/* =========================
   OBTENER HISTORIAL
========================= */
const obtenerHistorialPedido = async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario?.id;
  const rol = req.usuario?.rol;

  try {
    const [pedido] = await pool.query(
      "SELECT usuario_id FROM pedidos WHERE id = ?",
      [id]
    );

    if (pedido.length === 0) {
      return errorResponse(res, "Pedido no encontrado", 404);
    }

    if (rol !== "admin" && pedido[0].usuario_id !== usuarioId) {
      return errorResponse(res, "No autorizado", 403);
    }

    const [historial] = await pool.query(
      `SELECT ph.id,
              ph.estado_anterior,
              ph.estado_nuevo,
              ph.fecha,
              u.nombre AS cambiado_por
       FROM pedido_historial ph
       JOIN usuarios u ON ph.cambiado_por = u.id
       WHERE ph.pedido_id = ?
       ORDER BY ph.fecha DESC`,
      [id]
    );

    return successResponse(res, historial);

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/* =========================
   DESCARGAR FACTURA (PRO)
========================= */
const descargarFactura = async (req, res) => {
  const { id } = req.params;
  const usuarioId = req.usuario?.id;
  const rol = req.usuario?.rol;

  try {
    let query = `
      SELECT id, usuario_id, total, estado, fecha
      FROM pedidos
      WHERE id = ?
    `;

    const params = [id];

    if (rol !== "admin") {
      query += " AND usuario_id = ?";
      params.push(usuarioId);
    }

    const [pedidoRows] = await pool.query(query, params);

    if (!pedidoRows.length)
      return errorResponse(res, "Pedido no encontrado", 404);

    const pedido = pedidoRows[0];

    const [detalle] = await pool.query(
      `SELECT p.nombre, dp.cantidad, dp.precio_unitario
       FROM detalle_pedido dp
       JOIN productos p ON dp.producto_id = p.id
       WHERE dp.pedido_id = ?`,
      [id]
    );

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=factura-pedido-${id}.pdf`
    );

    doc.pipe(res);

    /* ===== ENCABEZADO ===== */
    doc.fontSize(20).text("ARTESANÍAS CATERINE", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text("NIT: 900000000-0", { align: "center" });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    /* ===== INFO PEDIDO ===== */
    doc.fontSize(12);
    doc.text(`Factura #: ${pedido.id}`);
    doc.text(`Fecha: ${new Date(pedido.fecha).toLocaleDateString("es-CO")}`);
    doc.text(`Estado: ${pedido.estado.toUpperCase()}`);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    /* ===== TABLA ===== */
    const tableTop = doc.y;

    doc.fontSize(11);
    doc.text("Producto", 50, tableTop);
    doc.text("Cant.", 300, tableTop);
    doc.text("Precio", 350, tableTop);
    doc.text("Subtotal", 450, tableTop);

    doc.moveDown();

    let position = doc.y;

    detalle.forEach((item) => {
      const subtotal = item.precio_unitario * item.cantidad;

      doc.fontSize(10)
        .text(item.nombre, 50, position)
        .text(item.cantidad, 300, position)
        .text(formatCOP(item.precio_unitario), 350, position)
        .text(formatCOP(subtotal), 450, position);

      position += 20;
    });

    doc.moveDown(2);

    doc.moveTo(300, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    /* ===== TOTAL ===== */
    doc.fontSize(14).text(`TOTAL: ${formatCOP(pedido.total)}`, {
      align: "right",
    });

    doc.end();
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  crearPedido,
  pagarPedido,
  listarPedidos,
  listarMisPedidos,
  obtenerPedidoPorId,
  cambiarEstadoPedido,
  crearPedidoPayUSession,
  handlePayUWebhook,
  obtenerHistorialPedido,
  descargarFactura,
};
