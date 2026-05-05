/**
 * ==============================
 * 🔔 SERVICIO DE NOTIFICACIONES EN TIEMPO REAL
 * ==============================
 * Maneja eventos de Socket.IO para notificaciones
 * Emite eventos a clientes conectados (admins, usuarios)
 */

class NotificationService {
  /**
   * Getter dinámico para obtener Socket.IO cuando esté inicializado.
   */
  get io() {
    return global.io;
  }

  /**
   * Emitir evento a todos los admins conectados
   * @param {string} event - Nombre del evento
   * @param {object} data - Datos del evento
   */
  emitToAdmins(event, data) {
    if (this.io) {
      this.io.to('admins').emit(event, data);
      console.log(`🔔 Evento emitido a admins: ${event}`, data);
    } else {
      console.warn(`⚠️ Socket.IO no disponible al intentar emitir evento a admins: ${event}`);
    }
  }

  /**
   * Emitir evento a un usuario específico
   * @param {string} userId - ID del usuario
   * @param {string} event - Nombre del evento
   * @param {object} data - Datos del evento
   */
  emitToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user_${userId}`).emit(event, data);
      console.log(`🔔 Evento emitido a usuario ${userId}: ${event}`, data);
    } else {
      console.warn(`⚠️ Socket.IO no disponible al intentar emitir evento a usuario ${userId}: ${event}`);
    }
  }

  /**
   * Emitir evento a todos los clientes conectados
   * @param {string} event - Nombre del evento
   * @param {object} data - Datos del evento
   */
  emitToAll(event, data) {
    if (this.io) {
      this.io.emit(event, data);
      console.log(`🔔 Evento emitido a todos: ${event}`, data);
    } else {
      console.warn(`⚠️ Socket.IO no disponible al intentar emitir evento a todos: ${event}`);
    }
  }

  /**
   * Notificar nuevo pedido a admins
   * @param {object} pedido - Datos del pedido
   */
  notifyNewOrder(pedido) {
    this.emitToAdmins('order:created', {
      id: pedido.id,
      total: pedido.total,
      cliente: pedido.nombre_cliente,
      productos: pedido.productos?.length || 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Notificar pago recibido
   * @param {object} pedido - Datos del pedido
   */
  notifyPaymentReceived(pedido) {
    this.emitToAdmins('order:paid', {
      id: pedido.id,
      total: pedido.total,
      metodo: pedido.metodo_pago,
      timestamp: new Date().toISOString()
    });

    // También notificar al usuario si está conectado
    if (pedido.usuario_id) {
      this.emitToUser(pedido.usuario_id, 'payment:confirmed', {
        pedidoId: pedido.id,
        total: pedido.total,
        status: 'pagado'
      });
    }
  }

  /**
   * Notificar nuevo mensaje de contacto
   * @param {object} contacto - Datos del contacto
   */
  notifyNewContact(contacto) {
    this.emitToAdmins('contact:submitted', {
      id: contacto.id,
      nombre: contacto.nombre,
      email: contacto.email,
      asunto: contacto.asunto,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new NotificationService();