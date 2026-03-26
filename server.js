require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Rate limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests — please try again later.' }
});

const jobsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many manual checks — limit is 5 per 15 minutes.' }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(generalLimiter);

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// Database
require('./db/connection');

// Routes
app.use('/api/prices',        require('./routes/prices'));
app.use('/api/queries',       require('./routes/queries'));
app.use('/api/jobs',          jobsLimiter, require('./routes/jobs'));
// app.use('/api/alerts', require('./routes/alerts'));
// app.use('/api/users',  require('./routes/users'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Flight Price Tracker API is running', status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start the cron scheduler
  const { job } = require('./jobs/priceChecker');
  job.start();
  console.log('Price checker scheduled: 8:00 AM and 8:00 PM daily.');
});

module.exports = app;
