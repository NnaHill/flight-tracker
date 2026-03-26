require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'flight_tracker',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

// Verify connectivity on startup with retries
(async () => {
  const maxRetries = 5;
  const delay = ms => new Promise(res => setTimeout(res, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await pool.getConnection();
      console.log('✅ MySQL connected successfully');
      conn.release();
      return;
    } catch (err) {
      console.error(`❌ MySQL connection failed (attempt ${attempt}/${maxRetries}):`, err.message);
      if (attempt < maxRetries) {
        console.log(`Retrying in 5 seconds...`);
        await delay(5000);
      } else {
        console.error('All MySQL connection attempts failed. Exiting.');
        process.exit(1);
      }
    }
  }
})();

module.exports = pool;
