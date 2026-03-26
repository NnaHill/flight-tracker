/**
 * DUFFEL API MODE NOTES
 * -----------------------------------------------------
 * SANDBOX MODE (duffel_test_...):
 *   - Duffel returns simulated but realistic flight data.
 *   - All offer IDs and prices are fake and cannot be booked.
 *   - Safe for development and testing — no real charges occur.
 *
 * LIVE MODE (duffel_live_...):
 *   - Returns real flight inventory and bookable offers.
 *   - Replace DUFFEL_API_KEY in .env with a duffel_live_ key
 *     from the Duffel dashboard once your app is approved
 *     for live access at app.duffel.com.
 * -----------------------------------------------------
 */

require('dotenv').config();
const { Duffel } = require('@duffel/api');

const apiKey = process.env.DUFFEL_API_KEY || '';
const keyPrefix = apiKey.slice(0, 12);
const mode = apiKey.startsWith('duffel_live_')
  ? 'LIVE'
  : apiKey.startsWith('duffel_test_')
    ? 'SANDBOX'
    : 'UNKNOWN';

console.log(`Duffel client initialized in ${mode} mode (key: ${keyPrefix}...)`);

const duffel = new Duffel({
  token: apiKey
});

module.exports = duffel;
