const express   = require('express');
const router    = express.Router();
const { runNow } = require('../jobs/priceChecker');

// POST /api/jobs/run — manually trigger a full price check
router.post('/run', async (req, res) => {
  try {
    const processed = await runNow();
    res.json({ success: true, message: `Price check complete.`, queriesProcessed: processed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
