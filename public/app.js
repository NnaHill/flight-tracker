'use strict';

const API_BASE = window.location.origin + '/api';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. API SERVICE
// Single Responsibility: all HTTP communication in one place
// Dependency Inversion: consumers depend on this abstraction, not raw fetch
// ═══════════════════════════════════════════════════════════════════════════════

const ApiService = {
  async _json(url, opts = {}) {
    const res = await fetch(url, opts);
    return res.json();
  },
  getQueries()         { return this._json(`${API_BASE}/queries`); },
  getPrices(queryId)   { return this._json(`${API_BASE}/prices/${queryId}`); },
  checkPrices(queryId) { return this._json(`${API_BASE}/prices/check/${queryId}`, { method: 'POST' }); },
  runAll()             { return this._json(`${API_BASE}/jobs/run`, { method: 'POST' }); },
  updateThreshold(queryId, val) {
    return this._json(`${API_BASE}/queries/${queryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_threshold: val })
    });
  },
  deleteQuery(id) { return this._json(`${API_BASE}/queries/${id}`, { method: 'DELETE' }); },
  createQuery(data) {
    return this._json(`${API_BASE}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. STATE MANAGER
// Single Responsibility: manages in-memory application state
// ═══════════════════════════════════════════════════════════════════════════════

const StateManager = {
  _cards: new Map(),
  init(queryId, query)      { this._cards.set(queryId, { query, allRecords: [] }); },
  get(queryId)              { return this._cards.get(queryId) || null; },
  clear()                   { this._cards.clear(); },
  setRecords(queryId, recs) { const s = this.get(queryId); if (s) s.allRecords = recs; },
  setThreshold(queryId, t)  { const s = this.get(queryId); if (s) s.query.price_threshold = t; },
  getRecords(queryId)       { return this.get(queryId)?.allRecords || []; }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AIRLINE PREFS
// Single Responsibility: persists preferred airline selections per tracker card
// ═══════════════════════════════════════════════════════════════════════════════

const AirlinePrefs = {
  _key: (queryId) => `airlinePrefs-${queryId}`,
  get(queryId) {
    try { return JSON.parse(localStorage.getItem(this._key(queryId))); }
    catch { return null; }
  },
  set(queryId, airlines) {
    localStorage.setItem(this._key(queryId), JSON.stringify(airlines));
  },
  // Returns saved prefs filtered to still-available airlines, or all available as default
  resolve(queryId, available) {
    const saved = this.get(queryId);
    if (saved) {
      const valid = saved.filter(a => available.includes(a));
      if (valid.length > 0) return valid;
    }
    return [...available].slice(0, 8);
  },
  toggle(queryId, airline, available) {
    const current = this.resolve(queryId, available);
    const next    = current.includes(airline)
      ? current.filter(a => a !== airline)
      : [...current, airline];
    if (next.length === 0) return current; // keep at least 1
    this.set(queryId, next);
    return next;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FAVORITES SERVICE
// Single Responsibility: manages favorited flights per tracker
// ═══════════════════════════════════════════════════════════════════════════════

const FavoritesService = {
  _key: (queryId, airline) => `fav-${queryId}-${airline}`,
  isFav(queryId, airline) { return localStorage.getItem(this._key(queryId, airline)) === '1'; },
  toggle(queryId, airline) {
    const key  = this._key(queryId, airline);
    const next = localStorage.getItem(key) !== '1';
    next ? localStorage.setItem(key, '1') : localStorage.removeItem(key);
    return next;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. GROUP SERVICE
// Single Responsibility: groups flight records by airline, returns top N per group
// ═══════════════════════════════════════════════════════════════════════════════

const GroupService = {
  uniqueAirlines(records) {
    return [...new Set(records.map(r => r.airline).filter(Boolean))].sort();
  },
  groupByAirline(records) {
    const map = new Map();
    for (const r of records) {
      const key = r.airline || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    for (const [k, v] of map) {
      map.set(k, v.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)));
    }
    return map;
  },
  topN(flights, n) { return flights.slice(0, n); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FILTER SERVICE
// Single Responsibility: pure filter predicates and sort logic
// Open/Closed: new modal filter types added via MODAL_FILTERS config only —
//              applyModal() requires no changes
// ═══════════════════════════════════════════════════════════════════════════════

const FilterService = {
  applyCard(records, { maxPrice, atMax, sort }) {
    let r = [...records];
    if (!atMax) r = r.filter(x => parseFloat(x.price) <= maxPrice);
    if (sort === 'price-asc')   r.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    if (sort === 'airline-asc') r.sort((a, b) => (a.airline || '').localeCompare(b.airline || ''));
    return r;
  },

  // Each entry: { id, label, type, options?, min?, max?, step?, test }
  // Adding a filter = one new object here; no logic changes needed elsewhere
  MODAL_FILTERS: [
    {
      id: 'cabin', label: 'Seat Location', type: 'radio',
      options: [
        { value: 'any',             label: 'Any'          },
        { value: 'economy',         label: 'Economy'      },
        { value: 'premium_economy', label: 'Premium Eco'  },
        { value: 'business',        label: 'Business'     },
        { value: 'first',           label: 'First'        }
      ],
      test: (r, v) => v === 'any' || (r.cabin_class || 'economy') === v
    },
    {
      id: 'stops', label: 'Connections', type: 'radio',
      options: [
        { value: 'any', label: 'Any'      },
        { value: '0',   label: 'Direct'   },
        { value: '1',   label: '1 Stop'   },
        { value: '2',   label: '2+ Stops' }
      ],
      test: (r, v) => {
        if (v === 'any') return true;
        const s = r.num_stops ?? 0;
        if (v === '0') return s === 0;
        if (v === '1') return s === 1;
        return s >= 2;
      }
    },
    {
      id: 'layover', label: 'Layover', type: 'radio',
      options: [
        { value: 'any',  label: 'Any'  },
        { value: '60',   label: '<1h'  },
        { value: '120',  label: '1–2h' },
        { value: '240',  label: '2–4h' },
        { value: '999',  label: '4h+'  }
      ],
      test: (r, v) => {
        if (v === 'any') return true;
        const m = r.layover_minutes ?? 0;
        if (v === '60')  return m < 60;
        if (v === '120') return m >= 60  && m < 120;
        if (v === '240') return m >= 120 && m < 240;
        return m >= 240;
      }
    },
    {
      id: 'maxFees', label: 'Max Add-on Fees', type: 'range',
      min: 0, max: 500, step: 10,
      test: (r, v) => (parseFloat(r.tax_amount) || 0) <= parseFloat(v)
    }
  ],

  defaultModalState() {
    return Object.fromEntries(
      FilterService.MODAL_FILTERS.map(f =>
        [f.id, f.type === 'range' ? String(f.max) : 'any']
      )
    );
  },

  applyModal(records, state) {
    return records.filter(r =>
      FilterService.MODAL_FILTERS.every(f => {
        const v = state[f.id];
        return (v === undefined || v === null) ? true : f.test(r, v);
      })
    );
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. RENDERER
// Single Responsibility: generates HTML strings from data only (no DOM side-effects)
// Liskov: all record objects are treated through a consistent interface
// ═══════════════════════════════════════════════════════════════════════════════

const Renderer = {
  esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _priceClass(price, threshold) {
    if (threshold === null) return '';
    if (price <= threshold)        return 'price-below';
    if (price <= threshold * 1.15) return 'price-near';
    return 'price-above';
  },

  _priceIndicator(price, threshold) {
    if (threshold === null) return '';
    if (price <= threshold)        return '<div class="flight-price-indicator below">Below alert</div>';
    if (price <= threshold * 1.15) return '<div class="flight-price-indicator near">Near threshold</div>';
    return '<div class="flight-price-indicator above">Above threshold</div>';
  },

  _timesHtml(r) {
    if (r.departure_time && r.arrival_time) {
      const dep = new Date(r.departure_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const arr = new Date(r.arrival_time  ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `<div class="flight-times">${dep} → ${arr}</div>`;
    }
    if (r.flight_number) return `<div class="flight-times">Flight ${this.esc(r.flight_number)}</div>`;
    return '';
  },

  _tagsHtml(r) {
    const stops  = r.num_stops ?? null;
    const layMin = r.layover_minutes ?? 0;
    const fees   = parseFloat(r.tax_amount || 0);
    let html = '';

    if (stops !== null) {
      html += stops === 0
        ? '<span class="flight-tag tag-direct">Direct</span>'
        : `<span class="flight-tag tag-stops">${stops} Stop${stops > 1 ? 's' : ''}</span>`;
    }
    if (layMin > 0) {
      const h = Math.floor(layMin / 60), m = layMin % 60;
      const label = h > 0 ? `${h}h${m ? ` ${m}m` : ''} layover` : `${m}m layover`;
      html += `<span class="flight-tag tag-layover">${label}</span>`;
    }
    if (fees > 0) {
      html += `<span class="flight-tag tag-fees">+$${fees.toFixed(0)} fees</span>`;
    }
    return html ? `<div class="flight-tags">${html}</div>` : '';
  },

  flightRow(r, queryId, threshold, showTags = false) {
    const price   = parseFloat(r.price);
    const airline = r.airline || 'Unknown';
    const badge   = (r.airline_iata || airline.substring(0, 2)).toUpperCase();
    const favNow  = FavoritesService.isFav(queryId, airline);

    return `
      <div class="flight-row">
        <button class="flight-favorite${favNow ? ' active' : ''}"
          data-query-id="${queryId}" data-airline="${this.esc(airline)}"
          onclick="toggleFavBtn(this)"
          title="${favNow ? 'Remove favorite' : 'Save as favorite'}">${favNow ? '♥' : '♡'}</button>
        <div class="flight-airline-badge">${this.esc(badge)}</div>
        <div class="flight-info">
          <div class="flight-airline-name">${this.esc(airline)}</div>
          ${this._timesHtml(r)}
          ${showTags ? this._tagsHtml(r) : ''}
        </div>
        <div class="flight-price-wrap">
          <div class="flight-price ${this._priceClass(price, threshold)}">
            $${price.toFixed(2)} <span class="flight-currency">${this.esc(r.currency || 'USD')}</span>
          </div>
          ${this._priceIndicator(price, threshold)}
        </div>
      </div>`;
  },

  airlineSection(airlineName, flights, queryId, threshold) {
    const badge = (flights[0]?.airline_iata || airlineName.substring(0, 2)).toUpperCase();
    const rows  = flights.map(r => this.flightRow(r, queryId, threshold)).join('');

    return `
      <div class="airline-section">
        <div class="airline-section-header"
          data-qid="${queryId}" data-airline="${this.esc(airlineName)}"
          onclick="openAirlineModal(+this.dataset.qid, this.dataset.airline)"
          role="button" tabindex="0"
          onkeydown="if(event.key==='Enter')openAirlineModal(+this.dataset.qid,this.dataset.airline)">
          <div class="airline-section-name">
            <div class="flight-airline-badge badge-sm">${this.esc(badge)}</div>
            <span>${this.esc(airlineName)}</span>
          </div>
          <span class="airline-section-cta">Details →</span>
        </div>
        <div class="airline-section-flights">${rows}</div>
      </div>`;
  },

  airlinePicker(queryId, allAirlines, selected) {
    if (allAirlines.length === 0) return '';
    const pills = allAirlines.map(a => {
      const on = selected.includes(a);
      return `<button class="airline-pill${on ? ' selected' : ''}"
        data-qid="${queryId}" data-airline="${this.esc(a)}"
        onclick="toggleAirlinePref(+this.dataset.qid, this.dataset.airline)">${this.esc(a)}</button>`;
    }).join('');
    return `
      <div class="airline-picker">
        <span class="airline-picker-label">Your Airlines:</span>
        <div class="airline-pills">${pills}</div>
      </div>`;
  },

  card(query) {
    const depart = new Date(query.depart_date).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const ret = query.return_date
      ? ' → ' + new Date(query.return_date).toLocaleDateString('en-US',
          { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      : ' (one-way)';
    const pax = `${query.num_passengers} passenger${query.num_passengers > 1 ? 's' : ''}`;
    const thr = parseFloat(query.price_threshold).toFixed(2);

    return `
      <div class="tracker-card-header">
        <div class="tracker-card-header-left">
          <div class="tracker-route">${this.esc(query.origin_iata)} → ${this.esc(query.destination_iata)}</div>
          <div class="tracker-meta">${depart}${ret} &nbsp;·&nbsp; ${pax}</div>
          <div class="tracker-meta" id="last-checked-${query.id}">Last checked: —</div>
          <div class="tracker-threshold-inline">Alert at $${thr}</div>
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
          <input type="number" id="edit-threshold-${query.id}" value="${thr}"
            min="1" step="0.01" style="width:130px;">
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveEdit(${query.id})">Save</button>
        <button class="btn btn-ghost btn-sm" onclick="hideEditForm(${query.id})">Cancel</button>
      </div>

      <div id="airline-picker-${query.id}"></div>

      <div class="tracker-filter-bar" id="filter-bar-${query.id}">
        <div class="filter-group">
          <label class="filter-label">Max Price</label>
          <div class="price-range-wrap">
            <span class="filter-label" id="max-price-val-${query.id}">Any</span>
            <input type="range" id="filter-max-price-${query.id}"
              min="0" max="2000" step="10" value="2000"
              oninput="updateMaxPriceLabel(${query.id}); applyCardFilters(${query.id})">
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label">Sort</label>
          <select class="filter-select" id="filter-sort-${query.id}"
            onchange="applyCardFilters(${query.id})">
            <option value="price-asc">Cheapest First</option>
            <option value="airline-asc">Airline A → Z</option>
          </select>
        </div>
      </div>

      <div class="tracker-results" id="results-${query.id}">
        <div class="tracker-no-results">Not yet checked</div>
      </div>`;
  },

  modalFilters(filterState, maxFees) {
    return FilterService.MODAL_FILTERS.map(f => {
      if (f.type === 'radio') {
        const pills = f.options.map(opt =>
          `<button class="filter-pill${filterState[f.id] === opt.value ? ' active' : ''}"
            onclick="setModalFilter('${f.id}','${opt.value}')">${this.esc(opt.label)}</button>`
        ).join('');
        return `
          <div class="modal-filter-group">
            <span class="modal-filter-label">${this.esc(f.label)}</span>
            <div class="modal-filter-pills">${pills}</div>
          </div>`;
      }
      if (f.type === 'range') {
        const dynMax = maxFees > 0 ? Math.ceil(maxFees * 1.5 / 10) * 10 : f.max;
        const val    = Math.min(parseFloat(filterState[f.id] ?? dynMax), dynMax);
        const atMax  = val >= dynMax;
        return `
          <div class="modal-filter-group">
            <span class="modal-filter-label">${this.esc(f.label)}</span>
            <div class="price-range-wrap">
              <span class="filter-label" id="modal-fees-label">${atMax ? 'Any' : `$${val}`}</span>
              <input type="range" id="modal-fees-range"
                min="${f.min}" max="${dynMax}" step="${f.step}" value="${atMax ? dynMax : val}"
                oninput="onModalFeesInput(this)">
            </div>
          </div>`;
      }
      return '';
    }).join('');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. MODAL CONTROLLER
// Single Responsibility: manages airline detail modal lifecycle and filter state
// ═══════════════════════════════════════════════════════════════════════════════

const ModalController = {
  _queryId:     null,
  _airline:     null,
  _filterState: {},

  open(queryId, airline) {
    this._queryId     = +queryId;
    this._airline     = airline;
    this._filterState = FilterService.defaultModalState();

    const state = StateManager.get(this._queryId);
    const route = state ? `${state.query.origin_iata} → ${state.query.destination_iata}` : '';
    document.getElementById('modal-title').textContent = `${airline}  ·  ${route}`;

    this._render();
    document.getElementById('airline-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('airline-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._queryId = this._airline = null;
  },

  setFilter(filterId, value) {
    this._filterState[filterId] = value;
    this._render();
  },

  _records() {
    if (!this._queryId || !this._airline) return [];
    return StateManager.getRecords(this._queryId).filter(r => r.airline === this._airline);
  },

  _render() {
    const records   = this._records();
    const state     = StateManager.get(this._queryId);
    const threshold = state ? parseFloat(state.query.price_threshold) : null;
    const filtered  = FilterService.applyModal(records, this._filterState);
    const maxFees   = Math.max(0, ...records.map(r => parseFloat(r.tax_amount || 0)));

    document.getElementById('modal-filters').innerHTML =
      Renderer.modalFilters(this._filterState, maxFees);

    const el = document.getElementById('modal-results');
    el.innerHTML = filtered.length
      ? filtered.map(r => Renderer.flightRow(r, this._queryId, threshold, true)).join('')
      : '<div class="tracker-no-results">No flights match these filters.</div>';
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CARD CONTROLLER
// Single Responsibility: manages tracker card behavior and DOM updates
// ═══════════════════════════════════════════════════════════════════════════════

const CardController = {
  async load() {
    const list = document.getElementById('trackers-list');
    list.innerHTML = '';
    StateManager.clear();

    try {
      const json = await ApiService.getQueries();
      if (!json.success || json.data.length === 0) {
        list.innerHTML = '<p class="empty-state">No active trackers yet. Add one above.</p>';
        return;
      }

      for (const query of json.data) {
        StateManager.init(query.id, query);
        const card     = document.createElement('div');
        card.className = 'tracker-card';
        card.id        = `card-${query.id}`;
        card.innerHTML = Renderer.card(query);
        list.appendChild(card);
      }

      await Promise.all(json.data.map(q => this.fetchPrices(q)));
    } catch {
      list.innerHTML = '<p class="empty-state">Could not load trackers.</p>';
    }
  },

  async fetchPrices(query) {
    try {
      const json = await ApiService.getPrices(query.id);
      if (!json.success || json.data.length === 0) return;

      const latestTime  = new Date(json.data[0].checked_at).getTime();
      const latestBatch = json.data.filter(r =>
        latestTime - new Date(r.checked_at).getTime() < 5 * 60 * 1000
      );
      this._applyRecords(query.id, latestBatch);
    } catch {}
  },

  _applyRecords(queryId, records) {
    StateManager.setRecords(queryId, records);

    if (records.length) {
      const ts = new Date(records[0].checked_at).toLocaleString('en-US',
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const el = document.getElementById(`last-checked-${queryId}`);
      if (el) el.textContent = `Last checked: ${ts}`;
    }

    const prices = records.map(r => parseFloat(r.price));
    const maxP   = Math.ceil(Math.max(...prices) * 1.25 / 10) * 10;
    const slider = document.getElementById(`filter-max-price-${queryId}`);
    if (slider) {
      slider.max   = maxP || 2000;
      slider.value = maxP || 2000;
      this.updateMaxPriceLabel(queryId);
    }

    this._renderAirlinePicker(queryId, records);
    this.renderGroupedResults(queryId);
  },

  _renderAirlinePicker(queryId, records) {
    const el = document.getElementById(`airline-picker-${queryId}`);
    if (!el) return;
    const allAirlines = GroupService.uniqueAirlines(records);
    const selected    = AirlinePrefs.resolve(queryId, allAirlines);
    el.innerHTML      = Renderer.airlinePicker(queryId, allAirlines, selected);
  },

  renderGroupedResults(queryId) {
    const container = document.getElementById(`results-${queryId}`);
    if (!container) return;

    const state = StateManager.get(queryId);
    if (!state) return;

    const slider    = document.getElementById(`filter-max-price-${queryId}`);
    const maxPrice  = slider ? parseFloat(slider.value) : Infinity;
    const atMax     = slider ? parseInt(slider.value) >= parseInt(slider.max) : true;
    const sortVal   = document.getElementById(`filter-sort-${queryId}`)?.value || 'price-asc';
    const threshold = parseFloat(state.query.price_threshold);

    const filtered         = FilterService.applyCard(state.allRecords, { maxPrice, atMax, sort: sortVal });
    const allAirlines      = GroupService.uniqueAirlines(state.allRecords);
    const selectedAirlines = AirlinePrefs.resolve(queryId, allAirlines);
    const grouped          = GroupService.groupByAirline(filtered);

    const sections = selectedAirlines
      .map(name => {
        const flights = grouped.get(name);
        if (!flights || !flights.length) return null;
        const top3 = GroupService.topN(flights, 3);
        return {
          name,
          minPrice: parseFloat(top3[0].price),
          html: Renderer.airlineSection(name, top3, queryId, threshold)
        };
      })
      .filter(Boolean);

    if (!sections.length) {
      container.innerHTML = filtered.length
        ? '<div class="tracker-no-results">No results for your selected airlines.</div>'
        : '<div class="tracker-no-results">No results match your filters.</div>';
      return;
    }

    if (sortVal === 'price-asc')   sections.sort((a, b) => a.minPrice - b.minPrice);
    if (sortVal === 'airline-asc') sections.sort((a, b) => a.name.localeCompare(b.name));

    container.innerHTML = sections.map(s => s.html).join('');
  },

  updateMaxPriceLabel(queryId) {
    const slider = document.getElementById(`filter-max-price-${queryId}`);
    const label  = document.getElementById(`max-price-val-${queryId}`);
    if (!slider || !label) return;
    label.textContent = parseInt(slider.value) >= parseInt(slider.max) ? 'Any' : `$${slider.value}`;
  },

  toggleAirline(queryId, airline) {
    const state = StateManager.get(queryId);
    if (!state) return;
    const allAirlines = GroupService.uniqueAirlines(state.allRecords);
    AirlinePrefs.toggle(queryId, airline, allAirlines);
    this._renderAirlinePicker(queryId, state.allRecords);
    this.renderGroupedResults(queryId);
  },

  showEditForm(queryId) { document.getElementById(`edit-form-${queryId}`)?.classList.remove('hidden'); },
  hideEditForm(queryId) { document.getElementById(`edit-form-${queryId}`)?.classList.add('hidden'); },

  async saveEdit(queryId) {
    const input = document.getElementById(`edit-threshold-${queryId}`);
    const value = parseFloat(input?.value);
    if (isNaN(value) || value <= 0) return;
    try {
      const json = await ApiService.updateThreshold(queryId, value);
      if (!json.success) { alert(json.error || 'Could not update threshold.'); return; }
      StateManager.setThreshold(queryId, value);
      const badge = document.querySelector(`#card-${queryId} .tracker-threshold-inline`);
      if (badge) badge.textContent = `Alert at $${value.toFixed(2)}`;
      this.hideEditForm(queryId);
      this.renderGroupedResults(queryId);
    } catch { alert('Could not update threshold.'); }
  },

  async refresh(queryId) {
    const btn = document.getElementById(`refresh-btn-${queryId}`);
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    try {
      const json = await ApiService.checkPrices(queryId);
      if (json.success) {
        const state = StateManager.get(queryId);
        if (state) await this.fetchPrices(state.query);
      } else {
        alert(json.error || 'Could not refresh prices.');
      }
    } catch { alert('Could not refresh prices.'); }
    finally { if (btn) { btn.textContent = '↻'; btn.disabled = false; } }
  },

  async delete(id) {
    if (!confirm('Stop tracking this flight?')) return;
    try {
      const json = await ApiService.deleteQuery(id);
      if (json.success) this.load();
    } catch { alert('Could not delete tracker.'); }
  },

  async runAll() {
    const btn = document.getElementById('check-all-btn');
    btn.textContent = 'Checking…';
    btn.disabled    = true;
    try {
      const json = await ApiService.runAll();
      if (json.success) await this.load();
    } catch { alert('Could not trigger price check.'); }
    finally { btn.textContent = 'Check Prices Now'; btn.disabled = false; }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FORM HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('tracker-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('form-message');
  msg.className = 'form-message';
  msg.textContent = '';

  try {
    const json = await ApiService.createQuery({
      origin:           document.getElementById('origin').value.trim().toUpperCase(),
      destination:      document.getElementById('destination').value.trim().toUpperCase(),
      depart_date:      document.getElementById('depart-date').value,
      return_date:      document.getElementById('return-date').value || null,
      num_passengers:   parseInt(document.getElementById('adults').value, 10),
      price_threshold:  parseFloat(document.getElementById('threshold').value),
      alert_preference: document.getElementById('alert-type').value
    });

    if (!json.success) {
      msg.className = 'form-message error'; msg.textContent = json.error; return;
    }
    msg.className = 'form-message success'; msg.textContent = 'Tracker added successfully!';
    e.target.reset();
    CardController.load();
  } catch {
    msg.className = 'form-message error'; msg.textContent = 'Could not connect to server.';
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. GLOBAL BINDINGS
// Interface Segregation: minimal surface exposed for inline HTML event handlers
// ═══════════════════════════════════════════════════════════════════════════════

window.toggleFavBtn = (btn) => {
  const { queryId, airline } = btn.dataset;
  const fav = FavoritesService.toggle(queryId, airline);
  btn.classList.toggle('active', fav);
  btn.textContent = fav ? '♥' : '♡';
  btn.title = fav ? 'Remove favorite' : 'Save as favorite';
};

window.applyCardFilters    = (qId) => CardController.renderGroupedResults(qId);
window.updateMaxPriceLabel = (qId) => CardController.updateMaxPriceLabel(qId);
window.showEditForm        = (qId) => CardController.showEditForm(qId);
window.hideEditForm        = (qId) => CardController.hideEditForm(qId);
window.saveEdit            = (qId) => CardController.saveEdit(qId);
window.refreshCard         = (qId) => CardController.refresh(qId);
window.deleteTracker       = (id)  => CardController.delete(id);
window.manualCheck         = ()    => CardController.runAll();
window.openAirlineModal    = (qId, airline) => ModalController.open(qId, airline);
window.closeModal          = ()    => ModalController.close();
window.setModalFilter      = (fId, val) => ModalController.setFilter(fId, val);
window.onModalFeesInput    = (input) => {
  const label = document.getElementById('modal-fees-label');
  const atMax = parseInt(input.value) >= parseInt(input.max);
  if (label) label.textContent = atMax ? 'Any' : `$${input.value}`;
  ModalController.setFilter('maxFees', atMax ? String(input.max) : input.value);
};
window.toggleAirlinePref = (qId, airline) => CardController.toggleAirline(qId, airline);

// ═══════════════════════════════════════════════════════════════════════════════
// 12. INIT
// ═══════════════════════════════════════════════════════════════════════════════

document.getElementById('airline-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) ModalController.close();
});

CardController.load();
