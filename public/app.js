const API = window.location.origin + '/api';

// Per-card state: Map<queryId, { query, allRecords }>
const cardState = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Favorites (localStorage) ─────────────────────────────────────────────────

function isFav(queryId, airline) {
  return localStorage.getItem(`fav-${queryId}-${airline}`) === '1';
}

function toggleFav(btn) {
  const queryId = btn.dataset.queryId;
  const airline = btn.dataset.airline;
  const key     = `fav-${queryId}-${airline}`;

  if (localStorage.getItem(key) === '1') {
    localStorage.removeItem(key);
    btn.classList.remove('active');
    btn.textContent = '♡';
    btn.title = 'Save as favorite';
  } else {
    localStorage.setItem(key, '1');
    btn.classList.add('active');
    btn.textContent = '♥';
    btn.title = 'Remove favorite';
  }
}

// ─── Load all active trackers ─────────────────────────────────────────────────

async function loadTrackers() {
  const list = document.getElementById('trackers-list');
  list.innerHTML = '';
  cardState.clear();

  try {
    const res  = await fetch(`${API}/queries`);
    const json = await res.json();

    if (!json.success || json.data.length === 0) {
      list.innerHTML = '<p class="empty-state">No active trackers yet. Add one above.</p>';
      return;
    }

    for (const query of json.data) {
      cardState.set(query.id, { query, allRecords: [] });
      list.appendChild(renderCard(query));
    }

    await Promise.all(json.data.map(q => fetchLatestPrice(q)));

  } catch (_) {
    list.innerHTML = '<p class="empty-state">Could not load trackers.</p>';
  }
}

// ─── Fetch latest price for one query ────────────────────────────────────────

async function fetchLatestPrice(query) {
  try {
    const res  = await fetch(`${API}/prices/${query.id}`);
    const json = await res.json();
    if (!json.success || json.data.length === 0) return;

    const latestTime  = new Date(json.data[0].checked_at).getTime();
    const latestBatch = json.data.filter(r =>
      latestTime - new Date(r.checked_at).getTime() < 5 * 60 * 1000
    );
    updateCardPrice(query.id, latestBatch);
  } catch (_) {}
}

// ─── Render a tracker card ────────────────────────────────────────────────────

function renderCard(query) {
  const card = document.createElement('div');
  card.className = 'tracker-card';
  card.id = `card-${query.id}`;

  const depart = query.depart_date
    ? new Date(query.depart_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : '—';
  const ret = query.return_date
    ? ' → ' + new Date(query.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : ' (one-way)';
  const pax       = `${query.num_passengers} passenger${query.num_passengers > 1 ? 's' : ''}`;
  const threshold = parseFloat(query.price_threshold).toFixed(2);

  card.innerHTML = `
    <div class="tracker-card-header">
      <div class="tracker-card-header-left">
        <div class="tracker-route">${esc(query.origin_iata)} → ${esc(query.destination_iata)}</div>
        <div class="tracker-meta">${depart}${ret} &nbsp;·&nbsp; ${pax}</div>
        <div class="tracker-meta" id="last-checked-${query.id}">Last checked: —</div>
        <div class="tracker-threshold-inline">Alert at $${threshold}</div>
      </div>
      <div class="tracker-card-header-right">
        <button class="btn btn-ghost btn-sm" onclick="showEditForm(${query.id})">Edit</button>
        <button class="btn btn-ghost btn-sm btn-icon" id="refresh-btn-${query.id}"
          onclick="refreshCard(${query.id})" title="Refresh prices">↻</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTracker(${query.id})">Delete</button>
      </div>
    </div>

    <div class="tracker-edit-form hidden" id="edit-form-${query.id}">
      <div class="form-group">
        <label>Alert Threshold (USD)</label>
        <input type="number" id="edit-threshold-${query.id}" value="${threshold}"
          min="1" step="0.01" style="width:130px;">
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveEdit(${query.id})">Save</button>
      <button class="btn btn-ghost btn-sm" onclick="hideEditForm(${query.id})">Cancel</button>
    </div>

    <div class="tracker-filter-bar" id="filter-bar-${query.id}">
      <div class="filter-group">
        <label class="filter-label">Airline</label>
        <select class="filter-select" id="filter-airline-${query.id}"
          onchange="applyFilters(${query.id})">
          <option value="">All Airlines</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">Max Price</label>
        <div class="price-range-wrap">
          <span class="filter-label" id="max-price-val-${query.id}">Any</span>
          <input type="range" id="filter-max-price-${query.id}"
            min="0" max="2000" step="10" value="2000"
            oninput="updateMaxPriceLabel(${query.id}); applyFilters(${query.id})">
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Sort</label>
        <select class="filter-select" id="filter-sort-${query.id}"
          onchange="applyFilters(${query.id})">
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
          <option value="airline-asc">Airline: A → Z</option>
        </select>
      </div>
    </div>

    <div class="tracker-results" id="results-${query.id}">
      <div class="tracker-no-results">Not yet checked</div>
    </div>
  `;

  return card;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function updateMaxPriceLabel(queryId) {
  const slider = document.getElementById(`filter-max-price-${queryId}`);
  const label  = document.getElementById(`max-price-val-${queryId}`);
  if (!slider || !label) return;
  label.textContent = parseInt(slider.value) >= parseInt(slider.max) ? 'Any' : `$${slider.value}`;
}

function applyFilters(queryId) {
  const state = cardState.get(queryId);
  if (!state || !state.allRecords.length) return;

  const airlineFilter = document.getElementById(`filter-airline-${queryId}`)?.value || '';
  const slider        = document.getElementById(`filter-max-price-${queryId}`);
  const maxPrice      = slider ? parseFloat(slider.value) : Infinity;
  const atMax         = slider ? parseInt(slider.value) >= parseInt(slider.max) : true;
  const sortVal       = document.getElementById(`filter-sort-${queryId}`)?.value || 'price-asc';

  let filtered = [...state.allRecords];

  if (airlineFilter) {
    filtered = filtered.filter(r => r.airline === airlineFilter);
  }
  if (!atMax) {
    filtered = filtered.filter(r => parseFloat(r.price) <= maxPrice);
  }

  filtered.sort((a, b) => {
    if (sortVal === 'price-asc')   return parseFloat(a.price) - parseFloat(b.price);
    if (sortVal === 'price-desc')  return parseFloat(b.price) - parseFloat(a.price);
    if (sortVal === 'airline-asc') return (a.airline || '').localeCompare(b.airline || '');
    return 0;
  });

  renderResults(queryId, filtered);
}

// ─── Update a card's price data ───────────────────────────────────────────────

function updateCardPrice(queryId, records) {
  const state = cardState.get(queryId);
  if (!state) return;

  state.allRecords = records;

  // Update "Last checked" timestamp
  if (records.length) {
    const ts = new Date(records[0].checked_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    const el = document.getElementById(`last-checked-${queryId}`);
    if (el) el.textContent = `Last checked: ${ts}`;
  }

  // Populate airline dropdown from unique airlines in results
  const airlineSelect = document.getElementById(`filter-airline-${queryId}`);
  if (airlineSelect) {
    const airlines = [...new Set(records.map(r => r.airline).filter(Boolean))].sort();
    const current  = airlineSelect.value;
    airlineSelect.innerHTML =
      '<option value="">All Airlines</option>' +
      airlines.map(a => `<option value="${esc(a)}"${a === current ? ' selected' : ''}>${esc(a)}</option>`).join('');
  }

  // Calibrate price slider to the results range
  const prices = records.map(r => parseFloat(r.price));
  const maxP   = Math.ceil(Math.max(...prices) * 1.25 / 10) * 10;
  const slider = document.getElementById(`filter-max-price-${queryId}`);
  if (slider) {
    slider.max   = maxP || 2000;
    slider.value = maxP || 2000;
    updateMaxPriceLabel(queryId);
  }

  applyFilters(queryId);
}

// ─── Render flight result rows ────────────────────────────────────────────────

function renderResults(queryId, records) {
  const container = document.getElementById(`results-${queryId}`);
  if (!container) return;

  const state     = cardState.get(queryId);
  const threshold = state ? parseFloat(state.query.price_threshold) : null;

  if (!records || records.length === 0) {
    container.innerHTML = '<div class="tracker-no-results">No results match your filters.</div>';
    return;
  }

  container.innerHTML = records.map(r => {
    const price    = parseFloat(r.price);
    const currency = r.currency || 'USD';
    const airline  = r.airline  || 'Unknown';
    const badge    = (r.airline_iata || airline.substring(0, 2)).toUpperCase();
    const favNow   = isFav(queryId, airline);

    // Departure / arrival times
    let timesHtml = '';
    if (r.departure_time && r.arrival_time) {
      const dep = new Date(r.departure_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const arr = new Date(r.arrival_time).toLocaleTimeString('en-US',   { hour: 'numeric', minute: '2-digit' });
      timesHtml = `<div class="flight-times">${dep} → ${arr}</div>`;
    } else if (r.flight_number) {
      timesHtml = `<div class="flight-times">Flight ${esc(r.flight_number)}</div>`;
    }

    // Price color & indicator label vs threshold
    let priceClass = '', priceLabel = '';
    if (threshold !== null) {
      if (price <= threshold) {
        priceClass = 'price-below';
        priceLabel = '<div class="flight-price-indicator below">Below alert</div>';
      } else if (price <= threshold * 1.15) {
        priceClass = 'price-near';
        priceLabel = '<div class="flight-price-indicator near">Near threshold</div>';
      } else {
        priceClass = 'price-above';
        priceLabel = '<div class="flight-price-indicator above">Above threshold</div>';
      }
    }

    return `
      <div class="flight-row">
        <button class="flight-favorite${favNow ? ' active' : ''}"
          data-query-id="${queryId}"
          data-airline="${esc(airline)}"
          onclick="toggleFav(this)"
          title="${favNow ? 'Remove favorite' : 'Save as favorite'}">${favNow ? '♥' : '♡'}</button>
        <div class="flight-airline-badge">${esc(badge)}</div>
        <div class="flight-info">
          <div class="flight-airline-name">${esc(airline)}</div>
          ${timesHtml}
        </div>
        <div class="flight-price-wrap">
          <div class="flight-price ${priceClass}">$${price.toFixed(2)} <span class="flight-currency">${esc(currency)}</span></div>
          ${priceLabel}
        </div>
      </div>`;
  }).join('');
}

// ─── Edit threshold ───────────────────────────────────────────────────────────

function showEditForm(queryId) {
  document.getElementById(`edit-form-${queryId}`)?.classList.remove('hidden');
}

function hideEditForm(queryId) {
  document.getElementById(`edit-form-${queryId}`)?.classList.add('hidden');
}

async function saveEdit(queryId) {
  const input = document.getElementById(`edit-threshold-${queryId}`);
  const value = parseFloat(input?.value);
  if (isNaN(value) || value <= 0) return;

  try {
    const res  = await fetch(`${API}/queries/${queryId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ price_threshold: value })
    });
    const json = await res.json();
    if (!json.success) { alert(json.error || 'Could not update threshold.'); return; }

    // Update local state & UI
    const state = cardState.get(queryId);
    if (state) state.query.price_threshold = value;

    const badge = document.querySelector(`#card-${queryId} .tracker-threshold-inline`);
    if (badge) badge.textContent = `Alert at $${value.toFixed(2)}`;

    hideEditForm(queryId);
    applyFilters(queryId);   // re-color prices with new threshold
  } catch (_) {
    alert('Could not update threshold.');
  }
}

// ─── Per-card refresh ─────────────────────────────────────────────────────────

async function refreshCard(queryId) {
  const btn = document.getElementById(`refresh-btn-${queryId}`);
  if (btn) { btn.textContent = '…'; btn.disabled = true; }

  try {
    const res  = await fetch(`${API}/prices/check/${queryId}`, { method: 'POST' });
    const json = await res.json();

    if (json.success) {
      const state = cardState.get(queryId);
      if (state) await fetchLatestPrice(state.query);
    } else {
      alert(json.error || 'Could not refresh prices.');
    }
  } catch (_) {
    alert('Could not refresh prices.');
  } finally {
    if (btn) { btn.textContent = '↻'; btn.disabled = false; }
  }
}

// ─── Form submission ──────────────────────────────────────────────────────────

document.getElementById('tracker-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('form-message');
  msg.className = 'form-message';
  msg.textContent = '';

  const origin      = document.getElementById('origin').value.trim().toUpperCase();
  const destination = document.getElementById('destination').value.trim().toUpperCase();
  const departDate  = document.getElementById('depart-date').value;
  const returnDate  = document.getElementById('return-date').value || null;
  const adults      = parseInt(document.getElementById('adults').value, 10);
  const threshold   = parseFloat(document.getElementById('threshold').value);
  const alertType   = document.getElementById('alert-type').value;

  try {
    const res  = await fetch(`${API}/queries`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin, destination,
        depart_date:      departDate,
        return_date:      returnDate,
        num_passengers:   adults,
        price_threshold:  threshold,
        alert_preference: alertType
      })
    });
    const json = await res.json();

    if (!json.success) {
      msg.className   = 'form-message error';
      msg.textContent = json.error;
      return;
    }

    msg.className   = 'form-message success';
    msg.textContent = 'Tracker added successfully!';
    e.target.reset();
    loadTrackers();

  } catch (_) {
    msg.className   = 'form-message error';
    msg.textContent = 'Could not connect to server.';
  }
});

// ─── Delete a tracker ─────────────────────────────────────────────────────────

async function deleteTracker(id) {
  if (!confirm('Stop tracking this flight?')) return;
  try {
    const res  = await fetch(`${API}/queries/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) loadTrackers();
  } catch (_) {
    alert('Could not delete tracker.');
  }
}

// ─── Manual price check (all trackers) ───────────────────────────────────────

async function manualCheck() {
  const btn = document.getElementById('check-all-btn');
  btn.textContent = 'Checking…';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/jobs/run`, { method: 'POST' });
    const json = await res.json();
    if (json.success) await loadTrackers();
  } catch (_) {
    alert('Could not trigger price check.');
  } finally {
    btn.textContent = 'Check Prices Now';
    btn.disabled    = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadTrackers();
