const duffel = require('./duffelClient');

async function searchLowestPrice(origin, destination, departDate, returnDate, adults) {
  try {
    // Step 1 — Build slices
    const slices = [
      { origin, destination, departure_date: departDate }
    ];
    if (returnDate) {
      slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    }

    // Step 2 — Build passengers array
    const passengers = Array.from({ length: adults }, () => ({ type: 'adult' }));

    // Step 3 — Create offer request
    const offerRequest = await duffel.offerRequests.create({
      slices,
      passengers,
      cabin_class: 'economy',
      return_offers: true
    });

    // Step 4 — Sort offers ascending by price, take top 5
    const offers = offerRequest.data.offers;
    if (!offers || offers.length === 0) return null;

    const sorted = [...offers].sort(
      (a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount)
    );
    const top5 = sorted.slice(0, 5);

    // Step 5 — Return array of simplified objects
    return top5.map(offer => ({
      price:         parseFloat(offer.total_amount),
      currency:      offer.total_currency,
      airline:       offer.owner.name,
      airlineIata:   offer.owner.iata_code,
      departureTime: offer.slices[0].segments[0].departing_at,
      arrivalTime:   offer.slices[0].segments[0].arriving_at,
      offerId:       offer.id
    }));

  } catch (err) {
    console.error('flightService error:', err.message);
    if (err.errors) console.error('Duffel errors:', JSON.stringify(err.errors, null, 2));
    return null;
  }
}

module.exports = { searchLowestPrice };
