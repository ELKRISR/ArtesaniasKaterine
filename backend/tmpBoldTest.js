require('dotenv').config({ path: './.env' });
const axios = require('axios');
const base = 'https://api.bold.com/v1/payment_intent';

console.log('BOLD URL', base);

axios.post(
  base,
  {
    reference: 'test-123',
    amount_in_cents: 100,
    currency: 'COP',
    description: 'Prueba',
    customer: {
      name: 'Test',
      email: 'test@test.com',
      phone: '3001234567',
      document: {
        type: 'CC',
        number: '0'
      }
    },
    webhook_url: 'http://localhost:4000/api/webhook/bold',
    test: true
  },
  {
    headers: {
      Authorization: 'Bearer ' + process.env.BOLD_SECRET_KEY,
      'Content-Type': 'application/json'
    }
  }
)
  .then((r) => {
    console.log('status', r.status);
    console.log(JSON.stringify(r.data, null, 2));
  })
  .catch((e) => {
    console.error('ERROR', e.response?.status, e.response?.data || e.message);
  });
