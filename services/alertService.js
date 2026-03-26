const pool                    = require('../db/connection');
const { logAlertSent }        = require('../db/queries');
const { sendPriceAlert }      = require('./emailService');
const { sendSmsAlert }        = require('./smsService');

/**
 * Check if the current price beats the threshold and send alerts if needed.
 * @param {object} query        - Full query row (includes user fields from JOIN)
 * @param {object} flightResult - { price, currency, airline, airlineIata, departureTime, arrivalTime, offerId }
 */
async function checkAndAlert(query, flightResult) {
  const currentPrice  = parseFloat(flightResult.price);
  const threshold     = parseFloat(query.price_threshold);
  const forceTest     = process.env.FORCE_ALERT_TEST === 'true';

  if (forceTest) {
    console.warn(`⚠️  FORCE_ALERT_TEST is ON — skipping threshold check for query ${query.id}. Disable this in .env when done testing.`);
  } else if (currentPrice >= threshold) {
    console.log(`Query ${query.id}: $${currentPrice} >= threshold $${threshold} — no alert needed.`);
    return;
  }

  // Check if an alert was already sent in the last 24 hours
  const [recent] = await pool.query(
    `SELECT id FROM alerts_log
     WHERE query_id = ?
       AND sent_at >= NOW() - INTERVAL 24 HOUR
     LIMIT 1`,
    [query.id]
  );

  if (recent.length > 0) {
    console.log(`Query ${query.id}: alert already sent within 24 hours — skipping.`);
    return;
  }

  const user = {
    name:             query.name,
    email:            query.email,
    phone:            query.phone,
    alert_preference: query.alert_preference
  };

  const pref = user.alert_preference;

  // Send email
  if (pref === 'email' || pref === 'both') {
    try {
      await sendPriceAlert(user, query, flightResult);
      await logAlertSent(query.id, 'email', currentPrice);
    } catch (err) {
      console.error(`Email alert failed for query ${query.id}:`, err.message);
    }
  }

  // Send SMS
  if (pref === 'sms' || pref === 'both') {
    try {
      await sendSmsAlert(user.phone, query, flightResult);
      await logAlertSent(query.id, 'sms', currentPrice);
    } catch (err) {
      console.error(`SMS alert failed for query ${query.id}:`, err.message);
    }
  }
}

module.exports = { checkAndAlert };
