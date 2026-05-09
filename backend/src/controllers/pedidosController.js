const pool = require("../models/db");
const { successResponse, errorResponse } = require("../utils/response");
const PDFDocument = require("pdfkit");
const { createPaymentIntent, processPayment, buildPaymentIntent, buildPaymentAttempt } = require("../utils/boldHelper");
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
   CREAR SESIÓN DE PAGO BOLD
========================= */
const crearPedidoBoldSession = async (req, res) => {
  const usuarioId = req.usuario?.id;
  const { cliente, items } = req.body;

  // 🔍 DEBUG: Log del payload recibido
  console.log('📦 Payload recibido en Bold Session:', {
    usuarioId,
    cliente,
    items,
    itemTypes: items?.map(item => ({ 
      productoId: typeof item.productoId, 
      cantidad: typeof item.cantidad,
      values: item 
    }))
  });

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

    // Generar referenceId único para Bold
    const referenceId = `pedido-${pedidoId}-${Date.now()}`;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // Crear Payment Intent real en Bold
    try {
      const paymentIntentPayload = buildPaymentIntent({
        referenceId,
        amount: {
          total,
          currency: 'COP'
        },
        description: `Pedido #${pedidoId} - Artesanías Hecha con Amor`,
        customer: {
          name: cliente.nombre,
          email: cliente.email,
          phone: cliente.telefono,
          documentNumber: '0'
        },
        returnUrl: `${frontendUrl}/success/${pedidoId}`,
        callbackUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/webhook/bold`,
        metadata: {
          pedidoId: pedidoId.toString(),
          usuarioId: usuarioId.toString()
        }
      });

      const boldResponse = await createPaymentIntent(
        paymentIntentPayload,
        process.env.BOLD_SECRET_KEY
      );

      const paymentIntentReference =
        boldResponse.payment_intent_reference ||
        boldResponse.reference ||
        boldResponse.id ||
        boldResponse.data?.payment_intent_reference ||
        boldResponse.data?.reference ||
        null;

      if (!paymentIntentReference) {
        throw new Error('No se recibió referencia de pago de Bold');
      }

      await connection.query(
        `INSERT INTO transacciones_bold 
         (pedido_id, reference_id, payment_intent_reference, estado) 
         VALUES (?, ?, ?, ?)`,
        [pedidoId, referenceId, paymentIntentReference, 'pending']
      );

      await connection.commit();

      return successResponse(res, {
        pedidoId,
        total,
        referenceId,
        paymentIntentReference,
        paymentUrl: `${frontendUrl}/checkout/bold/${referenceId}`,
      }, 201);
    } catch (boldError) {
      await connection.rollback();

      console.error('Error creando Payment Intent en Bold:', {
        status: boldError.response?.status,
        data: boldError.response?.data,
        message: boldError.message
      });

      const boldMessage = boldError.response?.data?.message || boldError.response?.data?.error || 'Error inicializando pago con Bold';
      return errorResponse(res, boldMessage, 500);
    }

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error creando sesión de pago en Bold:', error);
    return errorResponse(res, error.message, 400);
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
   OBTENER INTENCIÓN DE PAGO BOLD
========================= */
const obtenerBoldPaymentIntent = async (req, res) => {
  const { referenceId } = req.params;
  const usuarioId = req.usuario?.id;
  const rol = req.usuario?.rol;

  if (!referenceId) {
    return errorResponse(res, "Reference ID requerido", 400);
  }

  try {
    // Extraer el ID del pedido del referenceId (formato: pedido-{id}-{timestamp})
    const pedidoId = referenceId.split('-')[1];

    if (!pedidoId) {
      return errorResponse(res, "Reference ID inválido", 400);
    }

    const [pedido] = await pool.query(
      `SELECT id, total, estado, usuario_id FROM pedidos WHERE id = ?`,
      [pedidoId]
    );

    if (pedido.length === 0) {
      return errorResponse(res, "Pedido no encontrado", 404);
    }

    const pedidoData = pedido[0];

    if (rol !== 'admin' && pedidoData.usuario_id !== usuarioId) {
      return errorResponse(res, "No autorizado", 403);
    }

    const totalAmount = Math.round(pedidoData.total * 100); // Convertir a centavos para Bold

    return successResponse(res, {
      reference_id: referenceId,
      amount: {
        total_amount: totalAmount,
        currency: 'COP',
        tip_amount: 0,
        taxes: []
      },
      description: `Pedido #${pedidoData.id} - Artesanías`,
      pedidoId: pedidoData.id,
      estado: pedidoData.estado
    });

  } catch (error) {
    console.error('Error obteniendo intención de pago Bold:', error);
    return errorResponse(res, error.message, 500);
  }
};

/* =========================
   PROCESAR PAGO BOLD
========================= */
const procesarPagoBold = async (req, res) => {
  const usuarioId = req.usuario?.id;
  const { referenceId, token, amount, currency } = req.body;

  if (!usuarioId) {
    return errorResponse(res, "Usuario no autenticado", 401);
  }

  if (!referenceId || !token) {
    return errorResponse(res, "Reference ID y token requeridos", 400);
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Extraer el ID del pedido del referenceId
    const pedidoId = referenceId.split('-')[1];

    const [pedido] = await connection.query(
      `SELECT id, usuario_id, total, estado FROM pedidos WHERE id = ? FOR UPDATE`,
      [pedidoId]
    );

    if (pedido.length === 0) {
      throw new Error("Pedido no encontrado");
    }

    const pedidoData = pedido[0];

    // Verificar autorización
    if (pedidoData.usuario_id !== usuarioId) {
      return errorResponse(res, "No autorizado", 403);
    }

    // Verificar que el pago no sea duplicado
    if (pedidoData.estado === 'pagado') {
      await connection.commit();
      return successResponse(res, {
        mensaje: "Pedido ya fue pagado",
        pedidoId: pedidoData.id,
        estado: 'pagado'
      }, 200);
    }

    // Obtener detalles de la transacción Bold
    const [transaction] = await connection.query(
      `SELECT payment_intent_reference FROM transacciones_bold WHERE reference_id = ?`,
      [referenceId]
    );

    if (!transaction || !transaction[0]?.payment_intent_reference) {
      throw new Error("Payment Intent no encontrado");
    }

    // Obtener email del usuario para el pago
    const [usuarioRows] = await connection.query(
      "SELECT email FROM usuarios WHERE id = ?",
      [usuarioId]
    );
    const userEmail = usuarioRows[0]?.email || 'cliente@example.com';

    // Procesar el pago con Bold usando el token
    const paymentAttempt = buildPaymentAttempt({
      paymentIntentReference: transaction[0].payment_intent_reference,
      token: token,
      payer: {
        name: 'Cliente',
        email: userEmail,
        phone: '0'
      }
    });

    let boldPaymentResponse;
    try {
      boldPaymentResponse = await processPayment(
        paymentAttempt,
        process.env.BOLD_SECRET_KEY
      );
    } catch (boldError) {
      console.error('Error en API de Bold:', boldError.response?.data);
      await connection.rollback();
      return errorResponse(
        res,
        boldError.response?.data?.message || 'Error procesando pago con Bold',
        400
      );
    }

    // Validar respuesta de Bold
    const paymentStatus =
      boldPaymentResponse.status ||
      boldPaymentResponse.data?.status ||
      boldPaymentResponse.payment_status ||
      null;

    if (paymentStatus !== 'APPROVED' && paymentStatus !== 'SUCCESS') {
      await connection.rollback();
      return errorResponse(
        res,
        `Pago rechazado: ${paymentStatus || 'estado desconocido'}`,
        400
      );
    }

    // Actualizar estado del pedido a pagado
    await connection.query(
      "UPDATE pedidos SET estado = ? WHERE id = ?",
      ['pagado', pedidoData.id]
    );

    // Actualizar transacción Bold
    const transactionId =
      boldPaymentResponse.id ||
      boldPaymentResponse.transaction_id ||
      boldPaymentResponse.data?.id ||
      boldPaymentResponse.data?.transaction_id ||
      null;

    await connection.query(
      `UPDATE transacciones_bold 
       SET estado = ?, transaction_id = ?, respuesta_bold = ? 
       WHERE reference_id = ?`,
      ['completed', transactionId, JSON.stringify(boldPaymentResponse), referenceId]
    );

    // Registrar en historial
    await connection.query(
      `INSERT INTO pedido_historial 
       (pedido_id, estado_anterior, estado_nuevo, cambiado_por)
       VALUES (?, ?, ?, ?)`,
      [pedidoData.id, 'pendiente', 'pagado', usuarioId]
    );

    await connection.commit();

    // Notificaciones
    const [userData] = await pool.query(
      "SELECT email FROM usuarios WHERE id = ?",
      [pedidoData.usuario_id]
    );

    notificationService.notifyPaymentReceived({
      ...pedidoData,
      metodo_pago: 'tarjeta',
      transaction_id: boldPaymentResponse.id
    });

    // Enviar email de confirmación
    try {
      if (userData[0]?.email) {
        await emailService.sendPaymentConfirmation(userData[0].email, pedidoData);
      }
    } catch (emailError) {
      console.error('Error enviando email:', emailError);
    }

    return successResponse(res, {
      mensaje: "Pago procesado exitosamente",
      pedidoId: pedidoData.id,
      estado: 'pagado',
      transactionId: boldPaymentResponse.id,
      boldResponse: boldPaymentResponse
    }, 200);

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error procesando pago Bold:', error);
    return errorResponse(res, error.message, 500);
  } finally {
    if (connection) connection.release();
  }
};

/* =========================
   OBTENER ESTADO DE PAGO BOLD
========================= */
const obtenerEstadoPagoBold = async (req, res) => {
  const { referenceId } = req.params;
  const usuarioId = req.usuario?.id;
  const rol = req.usuario?.rol;

  if (!referenceId) {
    return errorResponse(res, "Reference ID requerido", 400);
  }

  try {
    // Extraer el ID del pedido del referenceId
    const pedidoId = referenceId.split('-')[1];

    if (!pedidoId) {
      return errorResponse(res, "Reference ID inválido", 400);
    }

    const [pedido] = await pool.query(
      `SELECT id, total, estado, usuario_id, fecha FROM pedidos WHERE id = ?`,
      [pedidoId]
    );

    if (pedido.length === 0) {
      return errorResponse(res, "Pedido no encontrado", 404);
    }

    const pedidoData = pedido[0];

    if (rol !== 'admin' && pedidoData.usuario_id !== usuarioId) {
      return errorResponse(res, "No autorizado", 403);
    }

    return successResponse(res, {
      referenceId,
      pedidoId: pedidoData.id,
      estado: pedidoData.estado,
      total: pedidoData.total,
      fecha: pedidoData.fecha
    });

  } catch (error) {
    console.error('Error obteniendo estado de pago Bold:', error);
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  crearPedido,
  pagarPedido,
  crearPedidoBoldSession,
  obtenerBoldPaymentIntent,
  procesarPagoBold,
  obtenerEstadoPagoBold,
  listarPedidos,
  listarMisPedidos,
  obtenerPedidoPorId,
  cambiarEstadoPedido,
};