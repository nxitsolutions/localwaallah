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
);`;

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
  res.json({ firebase: hasFirebase ? firebase : null, devLogin: DEV_LOGIN });
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
