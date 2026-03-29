const pool = require('./connection');

// ─── Search Queries ───────────────────────────────────────────────────────────

async function getAllActiveQueries() {
  try {
    const [rows] = await pool.query(
      `SELECT sq.*, u.email, u.phone, u.alert_preference
       FROM search_queries sq
       JOIN users u ON u.id = sq.user_id
       WHERE sq.is_active = 1`
    );
    return rows;
  } catch (err) {
    console.error('getAllActiveQueries error:', err.message);
    throw err;
  }
}

async function getQueryById(id) {
  try {
    const [rows] = await pool.query(
      `SELECT sq.*, u.email, u.phone, u.alert_preference
       FROM search_queries sq
       JOIN users u ON u.id = sq.user_id
       WHERE sq.id = ?`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    console.error(`getQueryById(${id}) error:`, err.message);
    throw err;
  }
}

async function createQuery(queryData) {
  const {
    user_id,
    origin_iata,
    destination_iata,
    depart_date,
    return_date = null,
    num_passengers = 1,
    price_threshold
  } = queryData;

  try {
    const [result] = await pool.query(
      `INSERT INTO search_queries
         (user_id, origin_iata, destination_iata, depart_date, return_date, num_passengers, price_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, origin_iata, destination_iata, depart_date, return_date, num_passengers, price_threshold]
    );
    return result.insertId;
  } catch (err) {
    console.error('createQuery error:', err.message);
    throw err;
  }
}

// ─── Price History ────────────────────────────────────────────────────────────

async function savePrice(queryId, priceData) {
  const {
    price,
    currency      = 'USD',
    airline       = null,
    airlineIata   = null,
    flight_number = null,
    departureTime = null,
    arrivalTime   = null
  } = priceData;

  try {
    const [result] = await pool.query(
      `INSERT INTO price_history
         (query_id, price, currency, airline, airline_iata, flight_number, departure_time, arrival_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [queryId, price, currency, airline, airlineIata, flight_number, departureTime || null, arrivalTime || null]
    );
    return result.insertId;
  } catch (err) {
    console.error(`savePrice(queryId=${queryId}) error:`, err.message);
    throw err;
  }
}

async function updateQueryThreshold(id, price_threshold) {
  try {
    const [result] = await pool.query(
      `UPDATE search_queries SET price_threshold = ? WHERE id = ? AND is_active = 1`,
      [price_threshold, id]
    );
    return result.affectedRows > 0;
  } catch (err) {
    console.error(`updateQueryThreshold(${id}) error:`, err.message);
    throw err;
  }
}

async function getLowestPriceForQuery(queryId) {
  try {
    const [rows] = await pool.query(
      `SELECT MIN(price) AS lowest_price, currency
       FROM price_history
       WHERE query_id = ?
       GROUP BY currency`,
      [queryId]
    );
    return rows[0] || null;
  } catch (err) {
    console.error(`getLowestPriceForQuery(${queryId}) error:`, err.message);
    throw err;
  }
}

// ─── Alerts Log ───────────────────────────────────────────────────────────────

async function logAlertSent(queryId, alertType, price) {
  try {
    const [result] = await pool.query(
      `INSERT INTO alerts_log (query_id, alert_type, price_at_alert)
       VALUES (?, ?, ?)`,
      [queryId, alertType, price]
    );
    return result.insertId;
  } catch (err) {
    console.error(`logAlertSent(queryId=${queryId}) error:`, err.message);
    throw err;
  }
}

module.exports = {
  getAllActiveQueries,
  getQueryById,
  createQuery,
  savePrice,
  updateQueryThreshold,
  getLowestPriceForQuery,
  logAlertSent
};
