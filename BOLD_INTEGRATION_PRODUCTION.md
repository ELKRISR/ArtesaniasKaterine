# 🏦 Guía de Integración Profesional de Bold - PRODUCCIÓN

## ✅ Estado: Integración Real Completa

Esta guía contiene la integración **completa y profesional** de Bold como pasarela de pago.

---

## 📋 Requisitos Previos

1. **Cuenta Bold**: https://dashboard.bold.co
2. **API Keys de Bold**:
   - `BOLD_API_KEY`: Tu clave de API
   - `BOLD_SECRET_KEY`: Tu clave secreta
   - URLs de ambiente (sandbox vs producción)

3. **Base de datos actualizada**: Ejecutar migraciones SQL

---

## ⚙️ Configuración

### Backend `.env`

```env
# ============== BOLD PAYMENT ==============
BOLD_API_KEY=tu_api_key_aqui
BOLD_SECRET_KEY=tu_secret_key_aqui
BOLD_SANDBOX=false  # true para sandbox, false para producción

# URLs
FRONTEND_URL=https://tudominio.com
BACKEND_URL=https://api.tudominio.com

# Cuando sea en producción:
NODE_ENV=production
ALLOWED_ORIGINS=https://tudominio.com

# ============== BASE DE DATOS ==============
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=artesanias
```

### Frontend `.env`

```env
VITE_API_URL=https://api.tudominio.com/api
VITE_BOLD_PUBLIC_KEY=tu_public_key
```

---

## 🏗️ Arquitectura del Flujo

```
┌─────────────────────────────────────────────────────┐
│                  CLIENTE (Frontend)                 │
│  Ingresa datos del pedido en Checkout               │
└────────────────┬────────────────────────────────────┘
                 │ 1. POST /api/pedidos/bold-session
                 ↓
┌─────────────────────────────────────────────────────┐
│                  BACKEND - Crear Pedido             │
│  • Valida datos                                     │
│  • Crea registro de pedido (estado: "pendiente")    │
│  • Reduce stock                                     │
│  • Crea Payment Intent en Bold ← API CALL           │
│  • Guarda transacción_bold                          │
└────────────────┬────────────────────────────────────┘
                 │ 2. Retorna URL de pago
                 ↓
┌─────────────────────────────────────────────────────┐
│            CLIENTE - BoldPayment.jsx                │
│  • Carga SDK de Bold desde CDN                      │
│  • Inicializa widget de pago                        │
│  • Usuario ingresa datos de tarjeta                 │
│  • SDK genera TOKEN del pago                        │
└────────────────┬────────────────────────────────────┘
                 │ 3. POST /api/pedidos/procesar-bold-payment
                 │    { token, referenceId }
                 ↓
┌─────────────────────────────────────────────────────┐
│           BACKEND - Procesar Pago                   │
│  • Valida token                                     │
│  • Procesa pago con Bold API ← API CALL             │
│  • Valida respuesta (APPROVED/SUCCESS)              │
│  • Actualiza pedido a "pagado"                      │
│  • Registra transacción                             │
└────────────────┬────────────────────────────────────┘
                 │ 4. POST /api/webhook/bold
                 │    (Callback opcional de Bold)
                 ↓
┌─────────────────────────────────────────────────────┐
│          BACKEND - Webhook Handler                  │
│  • Valida firma de Bold                             │
│  • Confirma estado del pago                         │
│  • Actualiza transacción                            │
│  • Envía email de confirmación                      │
└────────────────┬────────────────────────────────────┘
                 │ 5. Redirige a /success/{pedidoId}
                 ↓
┌─────────────────────────────────────────────────────┐
│          CLIENTE - Página de Éxito                  │
│  Muestra confirmación del pago                      │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Flujo Completo

### 1️⃣ Usuario en Checkout

```javascript
// frontend/src/pages/Checkout.jsx
if (formData.paymentMethod === 'tarjeta') {
  const response = await api.post("/pedidos/bold-session", {
    cliente: { nombre, email, direccion, telefono },
    items: cartItems
  });
  
  window.location.href = paymentUrl; // Redirige a Bold
}
```

### 2️⃣ Backend crea Payment Intent

```javascript
// backend/src/controllers/pedidosController.js
const crearPedidoBoldSession = async (req, res) => {
  // 1. Valida datos
  // 2. Crea pedido en BD (estado: "pendiente")
  // 3. Crea Payment Intent en Bold
  // 4. Guarda transacción_bold
  // 5. Retorna URL de pago
};
```

**API Call a Bold:**
```
POST https://api.payments.bold.co/v1/payment_intent
Authorization: Bearer {BOLD_API_KEY}
Content-Type: application/json

{
  "reference": "pedido-123-1715000000000",
  "amount_in_cents": 50000,  // 500.00 COP
  "currency": "COP",
  "description": "Pedido #123 - Artesanías",
  "customer": {
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "3001234567"
  },
  "webhook_url": "https://api.tudominio.com/api/webhook/bold"
}
```

**Respuesta:**
```json
{
  "reference": "pedido-123-1715000000000",
  "payment_intent_reference": "pi_1234567890abc",
  "amount_in_cents": 50000,
  "status": "CREATED"
}
```

### 3️⃣ SDK de Bold carga en Frontend

```javascript
// frontend/src/pages/BoldPayment.jsx
useEffect(() => {
  // Carga SDK desde CDN
  const script = document.createElement('script');
  script.src = 'https://checkout.bold.co/checkout.js';
  document.head.appendChild(script);
}, []);

// Inicializa widget
const bold = new window.Bold({
  publishableKey: import.meta.env.VITE_BOLD_PUBLIC_KEY,
  amount: 50000,
  currency: "COP",
  onSuccess: handlePaymentSuccess  // Obtiene TOKEN aquí
});

// Usuario hace clic en "Pagar"
bold.open(); // Abre widget de pago
```

### 4️⃣ Backend procesa el TOKEN

```javascript
// backend/src/controllers/pedidosController.js
const procesarPagoBold = async (req, res) => {
  const { referenceId, token } = req.body;
  
  // Procesa pago con Bold API
  const paymentResponse = await processPayment({
    payment_intent_reference: payment_intent_ref,
    payment_source: {
      type: "CARD",
      card: { token: token }  // Token del SDK
    }
  }, BOLD_API_KEY);
  
  // Valida respuesta
  if (paymentResponse.status === 'APPROVED') {
    // Actualiza pedido a "pagado"
    // Guarda transacción
    // Envía confirmación
  }
};
```

**API Call a Bold:**
```
POST https://api.payments.bold.co/v1/payment
Authorization: Bearer {BOLD_API_KEY}
Content-Type: application/json

{
  "payment_intent_reference": "pi_1234567890abc",
  "payment_source": {
    "type": "CARD",
    "card": {
      "token": "tok_xxx_yyy_zzz"  // Del SDK
    }
  },
  "payer": {
    "name": "Juan Pérez",
    "email": "juan@example.com"
  }
}
```

**Respuesta exitosa:**
```json
{
  "id": "txn_1234567890",
  "status": "APPROVED",
  "amount_in_cents": 50000,
  "reference": "pedido-123-1715000000000",
  "created_at": "2026-05-05T10:30:00Z"
}
```

### 5️⃣ (Opcional) Webhook de Bold

```javascript
// backend/src/controllers/webhookController.js
const handleBoldWebhook = async (req, res) => {
  // 1. Valida firma de Bold (Header: X-Bold-Signature)
  // 2. Procesa evento (payment.completed, payment.rejected, etc.)
  // 3. Actualiza estado de transacción
  // 4. Envía confirmación final
};
```

---

## 📊 Estados de Pago

| Estado | Significado | Acción |
|--------|------------|--------|
| `pending` | Esperando pago del usuario | Mostrar widget de Bold |
| `approved` / `success` | Pago aprobado | Actualizar pedido a "pagado" |
| `declined` | Tarjeta rechazada | Mostrar error, permitir reintentar |
| `failed` | Error en transacción | Contactar soporte |
| `cancelled` | Usuario canceló | Devolver a checkout |

---

## 🗄️ Tablas de Base de Datos

### `transacciones_bold`
Almacena información de cada intento de pago con Bold

```sql
CREATE TABLE transacciones_bold (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL UNIQUE,
    reference_id VARCHAR(255),
    payment_intent_reference VARCHAR(255),
    transaction_id VARCHAR(255),
    estado ENUM('pending', 'completed', 'failed', 'cancelled'),
    respuesta_bold JSON,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);
```

---

## 🔐 Seguridad

### 1. Validación de Firma de Webhook
```javascript
const validateWebhookSignature = (body, signature, secretKey) => {
  const hash = crypto.createHmac('sha256', secretKey)
    .update(JSON.stringify(body))
    .digest('hex');
  return hash === signature;
};
```

### 2. Flujo Seguro de Token
✅ Token NUNCA se guarda en backend
✅ Token se procesa inmediatamente
✅ Se valida respuesta de Bold antes de actualizar BD

### 3. Validaciones
- ✅ Usuario autenticado
- ✅ Pedido existe y es suyo
- ✅ Estado del pedido es "pendiente"
- ✅ Monto coincide
- ✅ Stock disponible

---

## 📱 Testing en Sandbox

### 1. Activar Sandbox
```env
BOLD_SANDBOX=true
```

### 2. Tarjetas de Prueba

| Número | Resultado | CVV | Fecha |
|--------|-----------|-----|-------|
| 4111111111111111 | APROBADO | 123 | 12/25 |
| 5555555555554444 | APROBADO | 123 | 12/25 |
| 378282246310005  | APROBADO | 1234 | 12/25 |
| 6011111111111117 | RECHAZADO | 123 | 12/25 |

### 3. Pruebas Locales
```bash
# Backend
cd backend
npm run dev  # Puerto 4000

# Frontend
cd frontend
npm run dev  # Puerto 5173

# Ir a: http://localhost:5173
```

---

## 🚨 Manejo de Errores

### Error: "Payment Intent no encontrado"
**Causa**: La transacción_bold no se guardó
**Solución**: Verificar conexión a BD, ver logs

### Error: "Pago rechazado: DECLINED"
**Causa**: Tarjeta rechazada por banco
**Solución**: Usuario intenta con otra tarjeta

### Error: "Firma inválida en webhook"
**Causa**: BOLD_SECRET_KEY incorrecto
**Solución**: Verificar .env, regenerar keys en Bold

---

## 📞 Contacto y Soporte

- **Dashboard Bold**: https://dashboard.bold.co
- **Documentación API**: https://docs.bold.co
- **Email Soporte**: support@bold.co

---

## ✅ Checklist para Producción

- [ ] Variables de entorno configuradas en servidor
- [ ] BOLD_SANDBOX = false
- [ ] Base de datos migrada (tabla transacciones_bold creada)
- [ ] URLs configuradas en Bold (webhook, return_url)
- [ ] SSL/HTTPS habilitado
- [ ] Logs configurados
- [ ] Emails funcionando
- [ ] Testing completo en ambiente stagingcomplejos
- [ ] Documentación actualizada
- [ ] Soporte 24/7 coordinado

---

**¡Tu integración de Bold está lista para producción! 🚀**
