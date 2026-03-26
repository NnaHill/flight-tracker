require('dotenv').config();
const twilio = require('twilio');

function getClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

/**
 * Send an SMS price alert.
 * @param {string} phone        - Recipient phone number (E.164 format, e.g. +12105550123)
 * @param {object} query        - { origin_iata, destination_iata }
 * @param {object} flightResult - { price, currency, airline, departureTime }
 */
async function sendSmsAlert(phone, query, flightResult) {
  const { price, currency, airline, departureTime } = flightResult;

  const date = departureTime
    ? new Date(departureTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : query.depart_date;

  const message =
    `Flight Alert: ${query.origin_iata} → ${query.destination_iata} ` +
    `on ${date} is now $${price} ${currency} with ${airline}. ` +
    `Verify & book at the airline website.`;

  await getClient().messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to:   phone
  });

  console.log(`SMS alert sent to ${phone} for ${query.origin_iata} → ${query.destination_iata} at $${price}`);
}

module.exports = { sendSmsAlert };
