/**
 * @fileoverview Utilidades para integración con PayU LATAM
 * 
 * PayU requiere firmas HMAC para validar las solicitudes.
 * Esta función genera la firma según el algoritmo de PayU.
 * 
 * @module utils/payuHelper
 */

const crypto = require('crypto');

/**
 * Genera la firma HMAC-MD5 requerida por PayU
 * 
 * Fórmula: MD5(apiKey~merchantId~referenceCode~amount~currency)
 * 
 * @param {string} apiKey - API Key de PayU
 * @param {string} merchantId - Merchant ID de PayU
 * @param {string} referenceCode - Código único de referencia del pedido
 * @param {number} amount - Monto total (con 2 decimales)
 * @param {string} currency - Código de moneda (COP, USD, etc)
 * @returns {string} Firma HMAC-MD5 en hexadecimal
 * 
 * @example
 * const signature = generatePayUSignature(
 *   'your-api-key',
 *   '123456',
 *   'pedido-123',
 *   50000.00,
 *   'COP'
 * );
 */
const generatePayUSignature = (apiKey, merchantId, referenceCode, amount, currency) => {
  const amountFormatted = Number(amount).toFixed(2);
  const message = `${apiKey}~${merchantId}~${referenceCode}~${amountFormatted}~${currency}`;
  
  return crypto
    .createHash('md5')
    .update(message)
    .digest('hex');
};

/**
 * Genera la firma de confirmación de PayU
 * 
 * Usada para validar webhooks de PayU
 * Fórmula: MD5(apiKey~referenceCode~status~value~currency)
 * 
 * @param {string} apiKey - API Key de PayU
 * @param {string} referenceCode - Código de referencia del pedido
 * @param {string} status - Estado del pago (4 = aprobado, 5 = declinado, etc)
 * @param {number} value - Monto del pago
 * @param {string} currency - Código de moneda
 * @returns {string} Firma HMAC-MD5 para validación de webhook
 */
const generatePayUWebhookSignature = (apiKey, referenceCode, status, value, currency) => {
  const valueFmt = Number(value).toFixed(2);
  const message = `${apiKey}~${referenceCode}~${status}~${valueFmt}~${currency}`;
  
  return crypto
    .createHash('md5')
    .update(message)
    .digest('hex');
};

/**
 * Construye el objeto de parámetros para el formulario hosteado de PayU
 * 
 * @param {object} options - Opciones de configuración
 * @param {string} options.merchantId - Merchant ID
 * @param {string} options.accountId - Account ID (varía por país)
 * @param {string} options.referenceCode - Referencia única
 * @param {string} options.amount - Monto total
 * @param {string} options.currency - Moneda (COP)
 * @param {string} options.buyerEmail - Email del comprador
 * @param {string} options.buyerFullName - Nombre completo
 * @param {string} options.buyerPhone - Teléfono
 * @param {string} options.shippingAddress - Dirección
 * @param {string} options.signature - Firma HMAC generada
 * @param {string} options.responseUrl - URL de retorno
 * @param {string} options.confirmationUrl - URL de confirmación (webhook)
 * @returns {object} Parámetros para el formulario
 */
const buildPayUFormParams = (options) => {
  const {
    merchantId,
    accountId,
    referenceCode,
    amount,
    currency,
    buyerEmail,
    buyerFullName,
    buyerPhone,
    shippingAddress,
    signature,
    responseUrl,
    confirmationUrl,
    sandbox = true,
  } = options;

  return {
    merchantId,
    accountId,
    referenceCode,
    amount: Number(amount).toFixed(2),
    currency,
    signature,
    buyerEmail,
    buyerFullName,
    buyerPhone,
    shippingAddress,
    responseUrl,
    confirmationUrl,
    // PayU específicos
    test: sandbox ? 1 : 0,
    buyerTaxId: '123', // Requerido pero puede ser dummy
    buyerTaxType: 'CC',
    responseMode: 'POST',
    extra1: referenceCode, // Para pasar data adicional
    psProcessWithoutCvv2: 'Y', // Permitir sin CVV2 si es necesario
  };
};

/**
 * Obtiene la URL base de PayU según el ambiente
 * 
 * @param {boolean} sandbox - true para sandbox, false para producción
 * @returns {string} URL base de PayU
 */
const getPayUBaseUrl = (sandbox = true) => {
  return sandbox
    ? 'https://sandbox.gateway.payulatam.com/ppp-web-gateway/'
    : 'https://gateway.payulatam.com/ppp-web-gateway/';
};

module.exports = {
  generatePayUSignature,
  generatePayUWebhookSignature,
  buildPayUFormParams,
  getPayUBaseUrl,
};
