/**
 * ==============================
 * 📧 SERVICIO DE EMAILS
 * ==============================
 * Maneja envío de emails transaccionales
 * Confirmaciones de pedidos, resets de password, etc.
 */

const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    this.transporter = null;
    this.sgInitialized = false;

    // Inicializar SendGrid si hay API key
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.sgInitialized = true;
      console.log('📧 SendGrid inicializado');
    } else {
      // Fallback a SMTP (Gmail, etc.)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      console.log('📧 SMTP transporter inicializado');
    }
  }

  /**
   * Envía email usando SendGrid o SMTP
   * @param {object} options - Opciones del email
   */
  async sendEmail(options) {
    const { to, subject, html, text } = options;

    try {
      if (this.sgInitialized) {
        // Usar SendGrid
        const msg = {
          to,
          from: process.env.EMAIL_FROM || 'noreply@artesanias.com',
          subject,
          html,
          text
        };
        await sgMail.send(msg);
      } else {
        // Usar SMTP
        await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to,
          subject,
          html,
          text
        });
      }
      console.log(`📧 Email enviado a ${to}: ${subject}`);
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      throw error;
    }
  }

  /**
   * Email de confirmación de pedido
   * @param {string} to - Email del cliente
   * @param {object} pedido - Datos del pedido
   */
  async sendOrderConfirmation(to, pedido) {
    const subject = `Confirmación de pedido #${pedido.id} - Artesanías`;
    const html = `
      <h1>¡Gracias por tu pedido!</h1>
      <p>Hola ${pedido.cliente},</p>
      <p>Tu pedido #${pedido.id} ha sido recibido correctamente.</p>
      <h2>Detalles del pedido:</h2>
      <ul>
        ${pedido.productos.map(p => `<li>${p.nombre} x${p.cantidad} - $${p.precio}</li>`).join('')}
      </ul>
      <p><strong>Total: $${pedido.total}</strong></p>
      <p>Te notificaremos cuando tu pedido esté listo para envío.</p>
      <br>
      <p>Saludos,<br>Equipo de Artesanías</p>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Email de pago recibido
   * @param {string} to - Email del cliente
   * @param {object} pedido - Datos del pedido
   */
  async sendPaymentConfirmation(to, pedido) {
    const subject = `Pago confirmado - Pedido #${pedido.id}`;
    const html = `
      <h1>¡Pago recibido!</h1>
      <p>Tu pago por el pedido #${pedido.id} ha sido procesado correctamente.</p>
      <p>Total pagado: $${pedido.total}</p>
      <p>Estamos preparando tu pedido. Recibirás actualizaciones pronto.</p>
      <br>
      <p>Gracias,<br>Equipo de Artesanías</p>
    `;

    await this.sendEmail({ to, subject, html });
  }

  /**
   * Email de reset de password
   * @param {string} to - Email del usuario
   * @param {string} resetToken - Token de reset
   */
  async sendPasswordReset(to, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    const subject = 'Reset de contraseña - Artesanías';
    const html = `
      <h1>Reset de contraseña</h1>
      <p>Has solicitado resetear tu contraseña.</p>
      <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
      <a href="${resetUrl}">Resetear contraseña</a>
      <p>Este enlace expira en 1 hora.</p>
      <p>Si no solicitaste esto, ignora este email.</p>
      <br>
      <p>Saludos,<br>Equipo de Artesanías</p>
    `;

    await this.sendEmail({ to, subject, html });
  }
}

module.exports = new EmailService();