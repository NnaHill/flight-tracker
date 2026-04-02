const duffel = require('./duffelClient');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeLayoverMinutes(segments) {
  let total = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    const arrive = new Date(segments[i].arriving_at).getTime();
    const depart = new Date(segments[i + 1].departing_at).getTime();
    total += Math.max(0, Math.round((depart - arrive) / 60000));
  }
  return total;
}

function mapOffer(offer, cabinClass) {
  const segments = offer.slices[0].segments;
  const firstSeg = segments[0];
  const lastSeg  = segments[segments.length - 1];

  return {
    price:          parseFloat(offer.total_amount),
    currency:       offer.total_currency,
    airline:        offer.owner.name,
    airlineIata:    offer.owner.iata_code,
    departureTime:  firstSeg.departing_at,
    arrivalTime:    lastSeg.arriving_at,
    offerId:        offer.id,
    numStops:       segments.length - 1,
    layoverMinutes: computeLayoverMinutes(segments),
    baseFare:       parseFloat(offer.base_amount ?? offer.total_amount),
    taxAmount:      parseFloat(offer.tax_amount ?? 0),
    cabinClass
  };
}

// From a price-sorted list, take the top `limit` cheapest per unique airline
function topPerAirline(sorted, limit) {
  const byAirline = new Map();
  for (const r of sorted) {
    const key = r.airline || r.airlineIata || 'Unknown';
    if (!byAirline.has(key)) byAirline.set(key, []);
    if (byAirline.get(key).length < limit) byAirline.get(key).push(r);
  }
  return [...byAirline.values()].flat();
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function searchLowestPrice(
  origin, destination, departDate, returnDate, adults,
  cabinClass = 'economy'
) {
  try {
    const slices = [{ origin, destination, departure_date: departDate }];
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    const passengers = Array.from({ length: adults }, () => ({ type: 'adult' }));

    const offerRequest = await duffel.offerRequests.create({
      slices,
      passengers,
      cabin_class: cabinClass,
      return_offers: true
    });

    const offers = offerRequest.data.offers;
    if (!offers || offers.length === 0) return null;

    const sorted = [...offers]
      .sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount))
      .map(o => mapOffer(o, cabinClass));

    const uniqueAirlines = [...new Set(sorted.map(r => r.airline))];
    console.log(`  Duffel returned ${offers.length} offers across ${uniqueAirlines.length} airline(s): ${uniqueAirlines.join(', ')}`);

    return topPerAirline(sorted, 3);
  } catch (err) {
    console.error('flightService error:', err.message);
    if (err.errors) console.error('Duffel errors:', JSON.stringify(err.errors, null, 2));
    return null;
  }
}

module.exports = { searchLowestPrice };
