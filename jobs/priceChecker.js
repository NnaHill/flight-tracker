const cron                              = require('node-cron');
const { getAllActiveQueries, savePrice } = require('../db/queries');
const { searchLowestPrice }             = require('../services/flightService');
const { checkAndAlert }                 = require('../services/alertService');

// Format a date value as YYYY-MM-DD, or return null if empty
function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return d.toISOString().split('T')[0];
}

// 2-second delay helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runNow() {
  const timestamp = new Date().toLocaleString();
  console.log(`\n[${timestamp}] Price checker started...`);

  const queries = await getAllActiveQueries();
  console.log(`[${timestamp}] Found ${queries.length} active queries.`);

  if (queries.length > 3) {
    console.warn(`WARNING: ${queries.length} active queries detected. Free tier recommended limit is 3. Consider deactivating unused queries.`);
  }

  let apiCallCount = 0;

  for (const query of queries) {
    const departDate = formatDate(query.depart_date);
    const returnDate = formatDate(query.return_date);

    console.log(`  Checking query ${query.id}: ${query.origin_iata} -> ${query.destination_iata} | depart: ${departDate}`);

    const result = await searchLowestPrice(
      query.origin_iata,
      query.destination_iata,
      departDate,
      returnDate,
      query.num_passengers
    );

    apiCallCount++;

    if (!result) {
      console.warn(`  No offers returned for query ID: ${query.id} — skipping save and alert check.`);
    } else {
      await savePrice(query.id, result);
      await checkAndAlert(query, result);
    }

    await sleep(2000);
  }

  console.log(`[${new Date().toLocaleString()}] Price checker finished. API calls made: ${apiCallCount}`);
  return queries.length;
}

// Schedule: 8:00 AM and 8:00 PM local time
const job = cron.schedule('0 8,20 * * *', () => {
  console.log('Cron triggered price check...');
  runNow().catch(err => console.error('Price checker error:', err.message));
}, { scheduled: false });

module.exports = { job, runNow };
