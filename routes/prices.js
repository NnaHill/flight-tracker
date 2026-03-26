const express = require('express');
const router  = express.Router();
const { searchLowestPrice }   = require('../services/flightService');
const { savePrice, getLowestPriceForQuery } = require('../db/queries');
const pool = require('../db/connection');

// Helper to get a future date formatted as YYYY-MM-DD
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// ─── GET /api/test-flight (Phase 4 test route — keep for debugging) ───────────

router.get('/test-flight', async (req, res) => {
  const departDate = futureDate(30);
  const returnDate = futureDate(37);

  const result = await searchLowestPrice('SAT', 'JFK', departDate, returnDate, 1);

  if (!result) {
    return res.json({ status: 'no_results', departDate, returnDate });
  }
  res.json(result);
});

// ─── GET /api/prices/:queryId — price history for a query ────────────────────

router.get('/:queryId', async (req, res) => {
  const { queryId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM price_history WHERE query_id = ? ORDER BY checked_at DESC`,
      [queryId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/prices/check/:queryId — manually trigger a price check ─────────

router.post('/check/:queryId', async (req, res) => {
  const { queryId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT sq.*, u.email, u.phone, u.alert_preference
       FROM search_queries sq
       JOIN users u ON u.id = sq.user_id
       WHERE sq.id = ? AND sq.is_active = 1`,
      [queryId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: `No active query found for ID ${queryId}.` });
    }

    const query      = rows[0];
    const departDate = query.depart_date
      ? new Date(query.depart_date).toISOString().split('T')[0]
      : null;
    const returnDate = query.return_date
      ? new Date(query.return_date).toISOString().split('T')[0]
      : null;

    const result = await searchLowestPrice(
      query.origin_iata,
      query.destination_iata,
      departDate,
      returnDate,
      query.num_passengers
    );

    if (!result) {
      return res.json({ success: false, error: 'No offers returned from Duffel for this query.' });
    }

    await savePrice(queryId, result);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
