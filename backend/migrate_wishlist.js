const mysql = require('mysql2/promise');
const fs = require('fs');

async function runMigration() {
  let connection;

  try {
    // Conectar a la base de datos
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'artesanias_db'
    });

    // Leer el archivo SQL
    const sql = fs.readFileSync('migracion_wishlist.sql', 'utf8');

    // Dividir en consultas individuales (por punto y coma)
    const queries = sql.split(';').map(q => q.trim()).filter(q => q.length > 0);

    // Ejecutar cada consulta
    for (const query of queries) {
      if (query.trim()) {
        await connection.execute(query);
      }
    }

    console.log('✅ Tabla wishlist creada exitosamente');

  } catch (error) {
    console.error('❌ Error en la migración:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();