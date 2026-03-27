const API = window.location.origin + '/api';

// ─── Load all active trackers ────────────────────────────────────────────────

async function loadTrackers() {
  const list = document.getElementById('trackers-list');
  list.innerHTML = '';

  try {
    const res  = await fetch(`${API}/queries`);
    const json = await res.json();

    if (!json.success || json.data.length === 0) {
      list.innerHTML = '<p class="empty-state">No active trackers yet. Add one above.</p>';
      return;
    }

    // Render all cards first, then fetch prices in parallel
    for (const query of json.data) {
      const card = renderCard(query, null);
      list.appendChild(card);
    }
    await Promise.all(json.data.map(query => fetchLatestPrice(query)));

  } catch (err) {
    list.innerHTML = '<p class="empty-state">Could not load trackers.</p>';
  }
}

// ─── Fetch latest price for a single query ───────────────────────────────────

async function fetchLatestPrice(query) {
  try {
    const res  = await fetch(`${API}/prices/${query.id}`);
    const json = await res.json();

    if (!json.success || json.data.length === 0) return;

    // data is sorted DESC by checked_at — first item is most recent
    const latest = json.data[0];
    updateCardPrice(query.id, latest);
  } catch (err) {
    // silently ignore — card already shows "Not yet checked"
  }
}

// ─── Render a tracker card ───────────────────────────────────────────────────

function renderCard(query, priceRecord) {
  const card = document.createElement('div');
  card.className  = 'tracker-card';
  card.id         = `card-${query.id}`;

  const depart = query.depart_date
    ? new Date(query.depart_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const ret = query.return_date
    ? ' → ' + new Date(query.return_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ' (one-way)';

  card.innerHTML = `
    <div class="tracker-info">
      <div class="tracker-route">${query.origin_iata} → ${query.destination_iata}</div>
      <div class="tracker-meta">${depart}${ret} &nbsp;·&nbsp; ${query.num_passengers} passenger${query.num_passengers > 1 ? 's' : ''}</div>
      <div class="tracker-price-wrap" id="price-${query.id}">
        <span class="tracker-not-checked">Not yet checked</span>
      </div>
      <div class="tracker-threshold">Alert threshold: $${parseFloat(query.price_threshold).toFixed(2)} USD</div>
    </div>
    <div class="tracker-actions">
      <button class="btn btn-danger" onclick="deleteTracker(${query.id})">Delete</button>
    </div>
  `;

  if (priceRecord) updateCardPrice(query.id, priceRecord);
  return card;
}

// ─── Update a card's price section ───────────────────────────────────────────

function updateCardPrice(queryId, record) {
  const wrap = document.getElementById(`price-${queryId}`);
  if (!wrap) return;

  const price    = parseFloat(record.price).toFixed(2);
  const airline  = record.airline  || '';
  const depTime  = record.checked_at
    ? new Date(record.checked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  wrap.innerHTML = `
    <div class="tracker-price">$${price} <span style="font-size:14px;font-weight:400;color:#555;">${record.currency || 'USD'}</span></div>
    <div class="tracker-price-detail">${airline}${depTime ? ' &nbsp;·&nbsp; checked ' + depTime : ''}</div>
  `;
}

// ─── Form submission ─────────────────────────────────────────────────────────

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
        origin,
        destination,
        depart_date:     departDate,
        return_date:     returnDate,
        num_passengers:  adults,
        price_threshold: threshold,
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

  } catch (err) {
    msg.className   = 'form-message error';
    msg.textContent = 'Could not connect to server.';
  }
});

// ─── Delete a tracker ────────────────────────────────────────────────────────

async function deleteTracker(id) {
  if (!confirm('Stop tracking this flight?')) return;

  try {
    const res  = await fetch(`${API}/queries/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) loadTrackers();
  } catch (err) {
    alert('Could not delete tracker.');
  }
}

// ─── Manual price check ──────────────────────────────────────────────────────

async function manualCheck() {
  const btn = document.querySelector('.btn-secondary');
  btn.textContent = 'Checking...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/jobs/run`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      await loadTrackers();
    }
  } catch (err) {
    alert('Could not trigger price check.');
  } finally {
    btn.textContent = 'Check Prices Now';
    btn.disabled    = false;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadTrackers();
