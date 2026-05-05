/**
 * @fileoverview Guía de configuración de PayU LATAM para artesanías
 * 
 * Este archivo documenta los pasos necesarios para configurar PayU LATAM
 * en el proyecto después de remover Stripe.
 * 
 * @module PAYU_SETUP_GUIDE
 */

/**
 * ===============================================
 * GUÍA DE CONFIGURACIÓN PAYU LATAM
 * ===============================================
 * 
 * PayU es la solución de pagos recomendada para LATAM,
 * incluyendo Colombia donde se desarrolla este proyecto.
 * 
 * ## PASO 1: Registrarse en PayU
 * 
 * 1. Ve a https://www.payulatam.com/ (o sandbox en desarrollo)
 * 2. Completa el formulario de registro con:
 *    - Razón social / Nombre comercial
 *    - Email de contacto
 *    - Teléfono
 *    - País: Colombia
 * 
 * 3. Una vez aprobado, accede al dashboard
 * 
 * ## PASO 2: Obtener credenciales
 * 
 * En el dashboard de PayU:
 * 1. Ve a "Configuración" o "Settings"
 * 2. Busca "API Credentials" o "Credenciales API"
 * 3. Copia:
 *    - Merchant ID (también llamado Shop ID)
 *    - Account ID (específico para Colombia - COP)
 *    - API Key (API Login Password)
 * 
 * ## PASO 3: Configurar .env
 * 
 * En backend/.env (o crear si no existe):
 * 
 * ```
 * PAYU_MERCHANT_ID=123456
 * PAYU_ACCOUNT_ID=654321
 * PAYU_API_KEY=tu_api_key_super_secreto
 * PAYU_SANDBOX=true
 * 
 * FRONTEND_URL=http://localhost:5173
 * BACKEND_URL=http://localhost:4000
 * ```
 * 
 * Reemplaza los valores con tus credenciales reales.
 * En producción, establece PAYU_SANDBOX=false
 * 
 * ## PASO 4: Webhook de PayU
 * 
 * PayU enviará confirmaciones de pago a:
 * POST /api/pedidos/webhook
 * 
 * En dashboard de PayU:
 * 1. Ve a "Webhooks" o "Notificaciones"
 * 2. Configura la URL de confirmación:
 *    - Desarrollo: http://localhost:4000/api/pedidos/webhook
 *    - Producción: https://tudominio.com/api/pedidos/webhook
 * 
 * 3. Suscríbete a eventos:
 *    - TRANSACTION_APPROVED
 *    - TRANSACTION_DECLINED
 *    - TRANSACTION_PENDING
 * 
 * ## PASO 5: Pruebas
 * 
 * En sandbox (PAYU_SANDBOX=true), usa estas tarjetas de prueba:
 * 
 * **Tarjeta Aprobada:**
 * - Número: 4111111111111111
 * - Vencimiento: 12/2025
 * - CVV: 123
 * 
 * **Tarjeta Declinada:**
 * - Número: 5425233010103337
 * - Vencimiento: 12/2025
 * - CVV: 123
 * 
 * ## PASO 6: Moneda y Localización
 * 
 * El proyecto está configurado para:
 * - Moneda: COP (Pesos Colombianos)
 * - País: Colombia
 * - Idioma: Español
 * 
 * Verifica que tu Account ID en PayU esté configurado para COP.
 * 
 * ## URLS IMPORTANTES
 * 
 * - Dashboard Sandbox: https://sandbox.gateway.payulatam.com/
 * - Dashboard Producción: https://gateway.payulatam.com/
 * - Documentación API: https://developers.payulatam.com/
 * - Contacto: pagosdigitales@payulatam.com
 * 
 * ## ESTRUCTURA DEL FLUJO DE PAGO
 * 
 * 1. Usuario llena formulario de checkout
 * 2. Frontend llama POST /api/pedidos/payu-session
 * 3. Backend:
 *    - Valida datos
 *    - Reserva stock
 *    - Crea pedido en estado "pendiente"
 *    - Genera firma HMAC-MD5
 *    - Retorna parámetros y URL de PayU
 * 4. Frontend enruta automáticamente al formulario hosteado de PayU
 * 5. Usuario completa pago en PayU
 * 6. PayU redirige al usuario a /success/{pedidoId}
 * 7. PayU envía webhook a /api/pedidos/webhook
 * 8. Backend actualiza pedido a estado "pagado"
 * 
 * ## SEGURIDAD
 * 
 * ✅ Los datos de tarjeta NUNCA pasan por nuestros servidores
 * ✅ Los datos sensibles se validan con firma HMAC-MD5
 * ✅ Los webhooks se pueden validar con la firma de PayU
 * ✅ El stock se reserva antes de redirigir a PayU
 * ✅ Se usa transacciones en BD para consistencia
 * 
 * ## TROUBLESHOOTING
 * 
 * **"Credenciales de PayU no configuradas"**
 * → Verifica que existan PAYU_MERCHANT_ID, PAYU_ACCOUNT_ID, PAYU_API_KEY en .env
 * 
 * **"Stock insuficiente"**
 * → El backend valida stock antes de crear el pedido
 * → Si hay concurrencia, es posible que 2 usuarios compren el último producto
 * → Implementar cola de espera en el futuro si es necesario
 * 
 * **"Pedido no encontrado" en webhook**
 * → PayU envía webhook pero backend no encuentra el pedido
 * → Verifica que el parámetro extra1 esté siendo enviado correctamente
 * → Revisa logs del backend
 * 
 * **Webhook no se ejecuta**
 * → Verifica que la URL esté correctamente configurada en PayU
 * → Intenta con curl/Postman: POST http://localhost:4000/api/pedidos/webhook
 * → Revisa que FRONTEND_URL y BACKEND_URL sean accesibles
 * 
 * ===============================================
 */

module.exports = {};
