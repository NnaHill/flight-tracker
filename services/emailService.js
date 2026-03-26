require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

/**
 * Send a price alert email.
 * @param {object} user         - { name, email }
 * @param {object} query        - { origin_iata, destination_iata, depart_date, return_date, price_threshold }
 * @param {object} flightResult - { price, currency, airline, airlineIata, departureTime, arrivalTime, offerId }
 */
async function sendPriceAlert(user, query, flightResult) {
  const { price, currency, airline, airlineIata, departureTime, arrivalTime } = flightResult;

  const fmt = (dt) => dt
    ? new Date(dt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

  const subject = `Price Alert: ${query.origin_iata} → ${query.destination_iata} now $${price} ${currency}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:28px 32px;">
              <p style="margin:0;font-size:13px;color:#aaa;letter-spacing:1px;text-transform:uppercase;">Flight Price Alert</p>
              <h1 style="margin:6px 0 0;font-size:26px;color:#ffffff;font-weight:700;">
                ${query.origin_iata} &rarr; ${query.destination_iata}
              </h1>
            </td>
          </tr>

          <!-- Price callout -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Current Price</p>
              <p style="margin:0;font-size:42px;font-weight:700;color:#16a34a;">$${price} <span style="font-size:18px;color:#555;">${currency}</span></p>
              <p style="margin:6px 0 0;font-size:14px;color:#888;">Your threshold: $${parseFloat(query.price_threshold).toFixed(2)} ${currency}</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:20px 32px 0;"><hr style="border:none;border-top:1px solid #efefef;margin:0;"></td></tr>

          <!-- Flight details -->
          <tr>
            <td style="padding:20px 32px 0;">
              <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1a1a2e;">Flight Details</p>
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555;width:140px;">Airline</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-weight:500;">${airline} (${airlineIata})</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555;">Departure</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-weight:500;">${fmt(departureTime)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555;">Arrival</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-weight:500;">${fmt(arrivalTime)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555;">Travel Dates</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-weight:500;">
                    ${query.depart_date}${query.return_date ? ' &rarr; ' + query.return_date : ' (one-way)'}
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555;">Passengers</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-weight:500;">${query.num_passengers}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:28px 32px;">
              <a href="#" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:6px;">
                Book Now &rarr;
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #efefef;margin:0;"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 28px;">
              <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
                This price was found via Duffel sandbox data — verify on the airline website before booking.<br>
                You are receiving this because you set a price alert for ${query.origin_iata} &rarr; ${query.destination_iata}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from:    `"Flight Tracker" <${process.env.EMAIL_USER}>`,
    to:      user.email,
    subject,
    html
  });

  console.log(`Email alert sent to ${user.email} for ${query.origin_iata} → ${query.destination_iata} at $${price}`);
}

module.exports = { sendPriceAlert };
