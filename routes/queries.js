const express = require('express');
const router  = express.Router();
const {
  getAllActiveQueries,
  getQueryById,
  createQuery,
  updateQueryThreshold
} = require('../db/queries');

// ─── Validation helpers ───────────────────────────────────────────────────────

const IATA_RE  = /^[A-Z]{3}$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

function isValidIata(code) {
  return typeof code === 'string' && IATA_RE.test(code);
}

function isFutureDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d > new Date();
}

function isValidDate(dateStr) {
  return DATE_RE.test(dateStr) && !isNaN(new Date(dateStr).getTime());
}

// ─── GET / — list all active queries ─────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const data = await getAllActiveQueries();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST / — create a new tracked search ────────────────────────────────────

router.post('/', async (req, res) => {
  const {
    user_id,
    origin,
    destination,
    depart_date,
    return_date,
    num_passengers,
    price_threshold
  } = req.body;

  // Validate IATA codes
  if (!isValidIata(origin)) {
    return res.status(400).json({ success: false, error: 'origin must be exactly 3 uppercase letters (e.g. SAT).' });
  }
  if (!isValidIata(destination)) {
    return res.status(400).json({ success: false, error: 'destination must be exactly 3 uppercase letters (e.g. JFK).' });
  }

  // Validate depart_date
  if (!isFutureDate(depart_date)) {
    return res.status(400).json({ success: false, error: 'depart_date must be a future date in YYYY-MM-DD format.' });
  }

  // Validate return_date if provided
  if (return_date !== undefined && return_date !== null && return_date !== '') {
    if (!isValidDate(return_date)) {
      return res.status(400).json({ success: false, error: 'return_date must be in YYYY-MM-DD format.' });
    }
    if (new Date(return_date) <= new Date(depart_date)) {
      return res.status(400).json({ success: false, error: 'return_date must be after depart_date.' });
    }
  }

  // Validate num_passengers
  const passengers = parseInt(num_passengers, 10);
  if (isNaN(passengers) || passengers < 1 || passengers > 9) {
    return res.status(400).json({ success: false, error: 'num_passengers must be an integer between 1 and 9.' });
  }

  // Validate price_threshold (store as DECIMAL — Duffel returns floats)
  const threshold = parseFloat(price_threshold);
  if (isNaN(threshold) || threshold <= 0) {
    return res.status(400).json({ success: false, error: 'price_threshold must be a positive number (e.g. 299.99).' });
  }

  try {
    const insertId = await createQuery({
      user_id:          user_id || 1,
      origin_iata:      origin,
      destination_iata: destination,
      depart_date,
      return_date:      return_date || null,
      num_passengers:   passengers,
      price_threshold:  threshold
    });

    const data = await getQueryById(insertId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PATCH /:id — update price threshold ─────────────────────────────────────

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const threshold = parseFloat(req.body.price_threshold);

  if (isNaN(threshold) || threshold <= 0) {
    return res.status(400).json({ success: false, error: 'price_threshold must be a positive number.' });
  }

  try {
    const updated = await updateQueryThreshold(id, threshold);
    if (!updated) {
      return res.status(404).json({ success: false, error: `Query ID ${id} not found.` });
    }
    res.json({ success: true, data: { id: parseInt(id), price_threshold: threshold } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /:id — soft-delete (deactivate) a query ──────────────────────────

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = require('../db/connection');
    const [result] = await pool.query(
      'UPDATE search_queries SET is_active = 0 WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: `Query ID ${id} not found.` });
    }
    res.json({ success: true, data: { id: parseInt(id), is_active: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
