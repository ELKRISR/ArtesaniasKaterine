# 🏦 Guía de Configuración Bold - Artesanías Hecha con Amor

## ✅ Estado de Integración

La integración con **Bold Payment Gateway** ha sido completada exitosamente. Aquí está lo que se ha configurado:

---

## 📋 Cambios Realizados

### 1. **Configuración de Variables de Entorno**

#### Backend (`backend/.env`)
```env
BOLD_SECRET_KEY=9YHumhBDDDYu8RHppnQAEw
BOLD_SANDBOX=true
FRONTEND_URL=http://localhost:5173
```

#### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:4000/api
VITE_BOLD_PUBLIC_KEY=FY2mjk1CdzOCae6Osjx3vY8z_4RXYWe9S9meIhhhyBKQ
```

---

### 2. **Backend - Nuevos Endpoints**

Se han agregado tres nuevos endpoints para manejar pagos con Bold:

#### `GET /api/pedidos/bold-payment-intent/:referenceId`
- **Propósito:** Obtener detalles de la intención de pago
- **Retorna:** Monto, moneda, descripción y datos del pedido
- **Autenticación:** No requerida

#### `POST /api/pedidos/procesar-bold-payment`
- **Propósito:** Procesar el pago después de que Bold envía el token
- **Requerido:** Token de Bold, referenceId, monto
- **Autenticación:** Requiere JWT (usuario autenticado)
- **Resultado:** Actualiza estado del pedido a "pagado"

#### `GET /api/pedidos/bold-payment-status/:referenceId`
- **Propósito:** Verificar estado del pago
- **Retorna:** Estado actual del pedido (pendiente, pagado, cancelado)
- **Autenticación:** No requerida

---

### 3. **Frontend - Componente Actualizado**

#### `frontend/src/pages/BoldPayment.jsx`
- ✅ Carga el SDK de Bold desde CDN
- ✅ Obtiene detalles del pago del backend
- ✅ Inicializa el widget de pago de Bold
- ✅ Procesa el token de pago
- ✅ Maneja callbacks y redirecciones
- ✅ Interfaz mejorada con manejo de errores

---

## 🚀 Cómo Probar la Integración

### Paso 1: Asegúrate de que los servidores estén corriendo

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Paso 2: Agregar un Producto al Carrito

1. Navega a la tienda en `http://localhost:5173`
2. Selecciona un producto
3. Haz clic en "Agregar al Carrito"
4. Verifica que el producto aparece en el carrito

### Paso 3: Proceder al Checkout

1. Haz clic en el carrito o navega a `/checkout`
2. Completa los datos del cliente:
   - Nombre
   - Email
   - Dirección
   - Teléfono
3. Selecciona método de pago: **"Tarjeta"** (se abrirá Bold)

### Paso 4: Realizar el Pago

1. Haz clic en **"Pagar Pedido"**
2. Serás redirigido a `/checkout/bold/:referenceId`
3. Verás el formulario de pago de Bold
4. Completa los datos de la tarjeta (en sandbox, puedes usar datos de prueba)
5. Confirma el pago

### Paso 5: Verificar Éxito

- Si el pago es exitoso: Redirige a `/success/:pedidoId`
- El estado del pedido cambia a **"pagado"** en la base de datos
- Se muestra un mensaje de confirmación

---

## 💳 Datos de Prueba para Sandbox (Bold)

Si Bold proporciona datos de prueba, úsalos. De lo contrario, contacta al soporte de Bold.

**Modo Actual:** `BOLD_SANDBOX=true` (Desarrollo)

---

## 🔐 Credenciales de Bold Utilizadas

```
Llave de Identidad (Public Key):  FY2mjk1CdzOCae6Osjx3vY8z_4RXYWe9S9meIhhhyBKQ
Llave Secreta (Secret Key):       9YHumhBDDDYu8RHppnQAEw
Ambiente:                         Sandbox (Desarrollo)
```

⚠️ **IMPORTANTE:** Estas credenciales son de prueba. Para producción, obtén nuevas credenciales del dashboard de Bold.

---

## 📊 Flujo de Pago Completo

```
1. Usuario selecciona productos → Carrito
2. Usuario va a Checkout → Ingresa datos
3. Usuario selecciona "Tarjeta" → POST /api/pedidos/bold-session
4. Backend crea sesión en Bold → Retorna paymentUrl
5. Frontend redirige a /checkout/bold/:referenceId
6. BoldPayment.jsx carga SDK de Bold
7. Widget de Bold se renderiza
8. Usuario completa pago en Bold
9. Bold envía token al frontend
10. Frontend envía token a POST /api/pedidos/procesar-bold-payment
11. Backend valida y marca pedido como "pagado"
12. Frontend redirige a /success/:pedidoId
13. Usuario ve confirmación del pedido
```

---

## ⚠️ Troubleshooting

### "Bold SDK no cargó correctamente"
- Verifica que tengas conexión a internet (CDN)
- Verifica la consola del navegador para errores
- Recarga la página y vuelve a intentar

### "Error procesando el pago"
- Verifica que `BOLD_SECRET_KEY` esté configurado en `backend/.env`
- Verifica que el servidor backend esté corriendo
- Revisa los logs del backend para más detalles

### "Error 404 - Pago no encontrado"
- Asegúrate de que `FRONTEND_URL` en `backend/.env` sea correcto
- Verifica que el referenceId sea válido

### "CORS blocked x-csrf-token"
- Ya está solucionado en el codigo
- Si sigue ocurriendo, verifica que `app.js` incluya `'X-CSRF-Token'` en allowedHeaders

---

## 🚀 Próximos Pasos para Producción

### Antes de Desplegar:

1. **Cambiar a Producción en Bold:**
   ```env
   BOLD_SANDBOX=false
   BOLD_SECRET_KEY=<tu_production_secret>
   ```

2. **Actualizar URLs:**
   ```env
   FRONTEND_URL=https://tu-dominio.com
   ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
   NODE_ENV=production
   ```

3. **Verificar Variables de Entorno:**
   - `NODE_ENV=production`
   - `FORCE_SECURE_COOKIES=true`
   - `BOLD_SANDBOX=false`

4. **Implementar Webhooks (Opcional pero Recomendado):**
   - Bold puede enviar notificaciones de pagos a un webhook
   - Agregar endpoint POST `/api/pedidos/bold-webhook` para recibir confirmaciones

5. **Testing Completo:**
   - Probar con datos reales de tarjeta (en sandbox de Bold)
   - Verificar email de confirmación
   - Verificar que los pedidos se registren correctamente en la BD

---

## 📞 Soporte

Si encuentras algún problema:

1. Revisa los logs:
   - **Backend:** Verifica la terminal donde corre `npm run dev`
   - **Frontend:** Abre DevTools (F12) → Console

2. Contacta a Bold:
   - Sitio: https://bold.co
   - Email: support@bold.co

3. Contacta al equipo de desarrollo

---

## 📝 Resumen de Archivos Modificados

```
✅ backend/.env                          - Agregadas credenciales Bold
✅ backend/.env.example                  - Actualizado con Bold config
✅ frontend/.env                         - Agregadas credenciales Bold
✅ frontend/src/pages/BoldPayment.jsx    - Implementación del SDK
✅ backend/src/controllers/pedidosController.js - Nuevos endpoints
✅ backend/src/routes/pedidos.js         - Nuevas rutas
```

---

## ✨ ¡Listo para Desplegar!

Tu tienda está configurada y lista para aceptar pagos con Bold. 

**¡A vender!** 🎉
