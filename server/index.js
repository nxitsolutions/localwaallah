'use strict';
// LocalWaala server: checks Firebase sign-ins, keeps each vendor's khata in PostgreSQL, and serves the app.
const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const env = process.env;
const PORT = +env.PORT || 8080;
// Test-only sign-in without Firebase, for local development. Refused in production.
const DEV_LOGIN = env.DEV_LOGIN === '1';
if (DEV_LOGIN && env.NODE_ENV === 'production') {
  console.error('DEV_LOGIN=1 is not allowed when NODE_ENV=production.');
  process.exit(1);
}
const firebase = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  appId: env.FIREBASE_APP_ID
};
// Optional: shows the Google map on the Route screen. It is a browser key, so restrict it to your domain.
const MAPS_KEY = env.GOOGLE_MAPS_API_KEY || '';
const hasFirebase = !!(firebase.apiKey && firebase.projectId && firebase.authDomain);
if (!hasFirebase && !DEV_LOGIN) {
  console.error('Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID and FIREBASE_APP_ID (see server/README.md).');
  process.exit(1);
}
if (!env.DATABASE_URL) {
  console.error('Set DATABASE_URL, for example postgres://user:pass@localhost:5432/localwaallah');
  process.exit(1);
}

let verify = null;
if (hasFirebase) {
  const { initializeApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  // Checking a sign-in token needs only the project id; no service account key is required.
  const adminApp = initializeApp({ projectId: firebase.projectId });
  verify = (tok) => getAuth(adminApp).verifyIdToken(tok);
}

const pool = new Pool({ connectionString: env.DATABASE_URL });
const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendors (
  uid text PRIMARY KEY,
  email text,
  phone text,
  name text,
  shop text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledgers (
  uid text PRIMARY KEY REFERENCES vendors(uid) ON DELETE CASCADE,
  data jsonb NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Finds the khata that holds a customer's page link.
CREATE INDEX IF NOT EXISTS ledgers_customers ON ledgers USING gin ((data->'customers') jsonb_path_ops);
-- Pause and extra requests customers send from their page, waiting for the vendor's yes or no.
CREATE TABLE IF NOT EXISTS requests (
  id bigserial PRIMARY KEY,
  uid text NOT NULL REFERENCES vendors(uid) ON DELETE CASCADE,
  customer_id text NOT NULL,
  kind text NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS requests_uid ON requests (uid, status);
CREATE INDEX IF NOT EXISTS requests_customer ON requests (uid, customer_id, created_at);`;

async function who(req) {
  const h = req.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  if (DEV_LOGIN && tok.startsWith('dev:')) {
    const n = tok.slice(4).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    return n ? { uid: 'dev-' + n, email: null, phone: null, name: n } : null;
  }
  if (!verify) return null;
  try {
    const d = await verify(tok);
    return { uid: d.uid, email: d.email || null, phone: d.phone_number || null, name: d.name || null };
  } catch (e) {
    return null;
  }
}

// Every signed-in request records the vendor, then runs the handler for that vendor only.
const authed = (fn) => async (req, res) => {
  const u = await who(req);
  if (!u) return res.status(401).json({ error: 'Please sign in again.' });
  try {
    await pool.query(
      `INSERT INTO vendors (uid, email, phone, name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (uid) DO UPDATE SET email = COALESCE(EXCLUDED.email, vendors.email), phone = COALESCE(EXCLUDED.phone, vendors.phone),
         name = COALESCE(EXCLUDED.name, vendors.name), last_seen = now()`,
      [u.uid, u.email, u.phone, u.name]
    );
    await fn(req, res, u);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));
// The app asks this first: an answer means "sign in through this server"; no answer means phone-only mode.
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ firebase: hasFirebase ? firebase : null, devLogin: DEV_LOGIN, mapsKey: MAPS_KEY || null });
});

app.get('/api/ledger', authed(async (req, res, u) => {
  res.set('Cache-Control', 'no-store');
  const r = await pool.query('SELECT data, version FROM ledgers WHERE uid = $1', [u.uid]);
  res.json(r.rows[0] || { data: null, version: 0 });
}));

// Saves the whole khata. baseVersion must match the server copy, otherwise the phone gets the
// newer copy back (409), merges it with its own changes, and tries again.
app.put('/api/ledger', authed(async (req, res, u) => {
  const { data, baseVersion } = req.body || {};
  if (!data || typeof data !== 'object' || !data.vendor || !Array.isArray(data.customers)) {
    return res.status(400).json({ error: 'Bad khata data' });
  }
  const base = Number.isInteger(baseVersion) ? baseVersion : 0;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    let ok;
    if (base === 0) {
      ok = (await db.query('INSERT INTO ledgers (uid, data, version) VALUES ($1, $2, 1) ON CONFLICT (uid) DO NOTHING', [u.uid, data])).rowCount === 1;
    } else {
      ok = (await db.query('UPDATE ledgers SET data = $2, version = version + 1, updated_at = now() WHERE uid = $1 AND version = $3', [u.uid, data, base])).rowCount === 1;
    }
    if (!ok) {
      const cur = await db.query('SELECT data, version FROM ledgers WHERE uid = $1', [u.uid]);
      await db.query('ROLLBACK');
      return res.status(409).json(cur.rows[0] || { data: null, version: 0 });
    }
    await db.query('UPDATE vendors SET shop = $2 WHERE uid = $1', [u.uid, String(data.vendor.name || '').slice(0, 200)]);
    await db.query('COMMIT');
    res.json({ version: base + 1 });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}));

// ---------- customer page ----------
// Each customer has a random link code (c.link) made by the vendor's phone. Anyone holding the link sees
// that one customer's khata and can ask for a pause or extra; nothing else in the vendor's khata is sent.
const LINK_RE = /^[A-Za-z0-9_-]{16,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_REQUESTS = 'SELECT id, kind, data, status, created_at FROM requests WHERE uid = $1 AND customer_id = $2 AND created_at > now() - interval \'30 days\' ORDER BY created_at DESC LIMIT 10';

async function findLink(token) {
  if (!LINK_RE.test(token || '')) return null;
  const r = await pool.query("SELECT uid, data FROM ledgers WHERE data->'customers' @> $1::jsonb LIMIT 1", [JSON.stringify([{ link: token }])]);
  if (!r.rows[0]) return null;
  const { uid, data } = r.rows[0];
  const c = (data.customers || []).find((x) => x.link === token && !x.deleted);
  return c ? { uid, data, c } : null;
}
// Just this customer's share of the khata, in the same shape the app keeps, so the app can draw it with its own rules.
function customerSlice(data, c) {
  const items = Array.isArray(c.items) && c.items.length ? c.items : [{ id: c.id, productId: c.productId, qty: c.qty, sched: c.sched, rate: c.rate }];
  const pids = new Set(items.map((x) => x.productId));
  const keys = new Set(items.map((x) => (x.id === c.id ? c.id : c.id + '.' + x.id)));
  const marks = {};
  Object.keys(data.marks || {}).forEach((day) => {
    const m = data.marks[day] || {};
    Object.keys(m).forEach((k) => { if (keys.has(k)) (marks[day] = marks[day] || {})[k] = m[k]; });
  });
  const v = data.vendor || {};
  return {
    vendor: { name: v.name || '', phone: v.phone || '', upi: v.upi || '', lang: v.lang || 'en' },
    products: (data.products || []).filter((p) => pids.has(p.id)),
    customers: [{ id: c.id, name: c.name, flat: c.flat || '', items, pauses: c.pauses || [], start: c.start || '', opening: c.opening || 0, link: c.link }],
    marks,
    payments: (data.payments || []).filter((p) => p.cid === c.id)
  };
}
const publicRoute = (fn) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const found = await findLink(req.params.token);
    if (!found) return res.status(404).json({ error: 'Not found' });
    await fn(req, res, found);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

app.get('/api/public/:token', publicRoute(async (req, res, { uid, data, c }) => {
  const r = await pool.query(PUBLIC_REQUESTS, [uid, c.id]);
  res.json({ ledger: customerSlice(data, c), requests: r.rows });
}));

// A few requests an hour per link is plenty; this stops a leaked link from flooding the vendor.
const recent = new Map();
function tooMany(token) {
  const now = Date.now();
  const list = (recent.get(token) || []).filter((x) => now - x < 3600e3);
  list.push(now); recent.set(token, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 10;
}
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

app.post('/api/public/:token/requests', publicRoute(async (req, res, { uid, c }) => {
  const b = req.body || {};
  const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10); // India time
  const okDay = (d) => DAY_RE.test(d || '') && d >= today && d <= addDays(today, 120);
  const note = String(b.note || '').slice(0, 200);
  let data;
  if (b.kind === 'pause') {
    if (!okDay(b.from) || !okDay(b.to) || b.to < b.from || b.to > addDays(b.from, 90)) return res.status(400).json({ error: 'Pick valid dates' });
    data = { from: b.from, to: b.to, note };
  } else if (b.kind === 'extra') {
    const items = Array.isArray(c.items) && c.items.length ? c.items : [{ id: c.id }];
    const it = items.find((x) => x.id === b.item) || items[0];
    const qty = Math.round(+b.qty * 100) / 100;
    if (!okDay(b.day) || !(qty > 0 && qty <= 50)) return res.status(400).json({ error: 'Pick a valid day and quantity' });
    data = { day: b.day, item: it.id, qty, note };
  } else {
    return res.status(400).json({ error: 'Unknown request' });
  }
  if (tooMany(req.params.token)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
  const open = await pool.query("SELECT count(*)::int AS n FROM requests WHERE uid = $1 AND customer_id = $2 AND status = 'pending'", [uid, c.id]);
  if (open.rows[0].n >= 5) return res.status(429).json({ error: 'Too many requests waiting. Ask your vendor.' });
  await pool.query('INSERT INTO requests (uid, customer_id, kind, data) VALUES ($1, $2, $3, $4)', [uid, c.id, b.kind, data]);
  const r = await pool.query(PUBLIC_REQUESTS, [uid, c.id]);
  res.json({ requests: r.rows });
}));

// The vendor's side: requests waiting for an answer, and the answer.
app.get('/api/requests', authed(async (req, res, u) => {
  res.set('Cache-Control', 'no-store');
  const r = await pool.query("SELECT id, customer_id, kind, data, created_at FROM requests WHERE uid = $1 AND status = 'pending' ORDER BY created_at", [u.uid]);
  res.json({ requests: r.rows });
}));
app.post('/api/requests/:id', authed(async (req, res, u) => {
  const status = (req.body || {}).status;
  if (!['approved', 'declined'].includes(status) || !/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'Bad request' });
  await pool.query("UPDATE requests SET status = $3, decided_at = now() WHERE id = $1 AND uid = $2 AND status = 'pending'", [req.params.id, u.uid, status]);
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const APP_DIR = path.join(__dirname, '..', 'app');
app.use(express.static(APP_DIR, {
  setHeaders(res, file) {
    // Phones must always check for a new app version; the service worker keeps it offline.
    if (/(sw\.js|index\.html|\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
}));

pool.query(SCHEMA)
  .then(() => app.listen(PORT, () => console.log('LocalWaala server on port ' + PORT + (DEV_LOGIN ? ' (DEV_LOGIN on)' : ''))))
  .catch((e) => { console.error('Could not prepare the database:', e.message); process.exit(1); });
