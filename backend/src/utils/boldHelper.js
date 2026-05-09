/**
 * @fileoverview Utilidades para integración con Bold
 *
 * Bold es la nueva solución de pagos para LATAM, con API moderna y segura.
 * Esta utilidad maneja la creación de intenciones de pago y procesamiento.
 *
 * @module utils/boldHelper
 */

const axios = require('axios');
const crypto = require('crypto');

/**
 * URL base de la API de Bold.
 *
 * Bold usa el mismo host para sandbox y producción. El modo sandbox
 * se controla con la propiedad `test: true` en el payload.
 */
const BOLD_BASE_URL = process.env.BOLD_BASE_URL || 'https://api.bold.com';

console.log(`Bold base URL: ${BOLD_BASE_URL} (sandbox=${process.env.BOLD_SANDBOX === 'true'})`);

/**
 * Crea una intención de pago en Bold
 * @param {object} paymentIntent - Datos de la intención de pago
 * @param {string} secretKey - Llave secreta de Bold
 * @returns {Promise<object>} Respuesta de Bold con payment_intent_reference
 */
const createPaymentIntent = async (paymentIntent, secretKey) => {
  if (!secretKey) {
    throw new Error('BOLD_SECRET_KEY no está configurada. Revisa backend/.env');
  }

  try {
    const response = await axios.post(
      `${BOLD_BASE_URL}/v1/payment_intent`,
      paymentIntent,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Artesanias-Bold-Integration/1.0'
        }
      }
    );
    return response.data?.data || response.data;
  } catch (error) {
    console.error('Error creando intención de pago en Bold:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
};

/**
 * Procesa un pago en Bold usando el token del SDK
 * @param {object} paymentAttempt - Datos del intento de pago con token
 * @param {string} secretKey - Llave secreta de Bold
 * @returns {Promise<object>} Respuesta de Bold
 */
const processPayment = async (paymentAttempt, secretKey) => {
  if (!secretKey) {
    throw new Error('BOLD_SECRET_KEY no está configurada. Revisa backend/.env');
  }

  try {
    const response = await axios.post(
      `${BOLD_BASE_URL}/v1/payment`,
      paymentAttempt,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Artesanias-Bold-Integration/1.0'
        }
      }
    );
    return response.data?.data || response.data;
  } catch (error) {
    console.error('Error procesando pago en Bold:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
};

/**
 * Consulta el estado de un pago en Bold
 * @param {string} paymentIntentReference - ID de referencia del payment intent
 * @param {string} secretKey - Llave secreta de Bold
 * @returns {Promise<object>} Respuesta de Bold con estado del pago
 */
const getPaymentStatus = async (paymentIntentReference, secretKey) => {
  if (!secretKey) {
    throw new Error('BOLD_SECRET_KEY no está configurada. Revisa backend/.env');
  }

  try {
    const response = await axios.get(
      `${BOLD_BASE_URL}/v1/payment_intent/${paymentIntentReference}`,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    return response.data?.data || response.data;
  } catch (error) {
    console.error('Error consultando estado de pago en Bold:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error;
  }
};

/**
 * Valida la firma de un webhook de Bold
 * @param {object} body - Cuerpo del request
 * @param {string} signature - Header X-Bold-Signature
 * @param {string} secretKey - Secret key de Bold
 * @returns {boolean} True si la firma es válida
 */
const validateWebhookSignature = (body, signature, secretKey) => {
  if (!signature || !secretKey) return false;

  const bodyString = typeof body === 'string'
    ? body
    : JSON.stringify(body);

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(bodyString)
    .digest('hex');

  return hash === signature;
};

/**
 * Construye el objeto de intención de pago para Bold
 * @param {object} options - Opciones de configuración
 * @returns {object} Objeto de intención de pago
 */
const buildPaymentIntent = (options) => {
  const {
    referenceId,
    amount,
    description,
    callbackUrl,
    customer,
    metadata = {},
    returnUrl = null
  } = options;

  return {
    reference: referenceId,
    amount_in_cents: Math.round(amount.total * 100), // Bold trabaja en centavos
    currency: amount.currency || 'COP',
    description,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: {
        type: 'CC',
        number: customer.documentNumber || '0'
      }
    },
    ...(returnUrl && { return_url: returnUrl }),
    ...(callbackUrl && { webhook_url: callbackUrl }),
    metadata,
    test: process.env.BOLD_SANDBOX === 'true'
  };
};

/**
 * Construye el objeto de intento de pago para Bold
 * @param {object} options - Opciones de configuración
 * @returns {object} Objeto de intento de pago
 */
const buildPaymentAttempt = (options) => {
  const {
    paymentIntentReference,
    token,
    payer
  } = options;

  return {
    payment_intent_reference: paymentIntentReference,
    payment_source: {
      type: 'CARD',
      card: {
        token: token // Token del SDK de Bold
      }
    },
    payer: {
      name: payer.name,
      email: payer.email
    }
  };
};

module.exports = {
  createPaymentIntent,
  processPayment,
  getPaymentStatus,
  validateWebhookSignature,
  buildPaymentIntent,
  buildPaymentAttempt,
  BOLD_BASE_URL
};