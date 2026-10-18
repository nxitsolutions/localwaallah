# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LocalWaala is a daily delivery ledger ("khata") PWA for local vendors (milk, newspapers, water cans, laundry). Its users may not read much, so the UI relies on large text, icons, fixed status colors paired with symbols, and English/Hindi/Telugu strings. See README.md for the feature list.

## Commands

There is no build step, linter, or test suite. CI (`.github/workflows/pages.yml`) only syntax-checks, then publishes `app/` to GitHub Pages on every push to `main`:

```
node --check app/app.js && node --check app/i18n.js && node --check app/sw.js && node --check server/index.js
```

Run the app alone (phone-only mode, no accounts): `python3 -m http.server 8000 --directory app`, open http://localhost:8000 and tap "Try with sample data".

Run with the server (needs PostgreSQL; `DEV_LOGIN=1` skips Firebase and shows a test login, refused when `NODE_ENV=production`):

```
cd server && npm ci
DATABASE_URL=postgres://localhost/localwaallah DEV_LOGIN=1 node index.js   # port 8080, creates tables on start
```

Full stack with Docker: `cp .env.example .env` then `docker compose up -d` (app bound to 127.0.0.1:8080, meant to sit behind Caddy/nginx for HTTPS).

In the browser console, `window.LW` exposes the live state and core functions (`state`, `account`, `sync`, `dayInfo`, `balance`, `monthBill`, `publicLink`, `applyVoice`, `merge`) for debugging.

## Architecture

### Frontend (`app/`, plain HTML/CSS/JS, no framework, no modules)
- `app.js` is one IIFE, split into sections marked `// ---------- name ----------` (helpers, storage, ledger rules, views, live customer page, events, accounts & sync, customer requests, router). Navigate by those markers.
- **State**: a single object `S` (`{ vendor, products, customers, marks, payments, sent }`) persisted whole to localStorage via `save()`. Every mutation calls `save()`, which also schedules a server push when signed in. Dates are `YYYY-MM-DD` strings in local time (`ymd`/`parse` helpers); never use `toISOString()` for days.
- **Ledger model**: a customer has `items` (lines), each with `productId`, `qty`, `sched` (`daily` | `alt` | `days` | `demand`) and optional `rate`. Delivery marks live in `S.marks[day][lineKey]`, where the line key is the customer id for the first line and `customerId.lineId` for others (legacy compatibility; `lines(c)` migrates old single-item customers). With no mark, a scheduled day counts as delivered (`done`); marks only record exceptions (`half`, `skip`, `extra`) or on-demand quantities. `lineInfo`/`dayInfo`/`monthBill`/`balance` derive everything else.
- **Rendering**: views are functions returning HTML strings (always escape user data with `esc()`); `render()` replaces `#app` wholesale. Routing is hash-based (`#/customers`, `#/c/<id>`, `#/edit/new`, `#/money`, `#/stock`, `#/order`, `#/bills`, `#/settings`; `#/p/<link>` is the live customer page, `#/s/...` the offline snapshot link).
- **Events**: one delegated `click` listener on `document` dispatches on `data-act` attributes (plus `input`/`change` listeners). New buttons get a `data-act` and a case there, not their own listener.
- **Strings**: every visible word lives in `i18n.js` (`window.STRINGS.{en,hi,te}`), read via `t(key)` with English fallback. Add new keys to all languages.
- **Icons**: inline stroke SVG paths in the `P` map, rendered with `ic(name, size)`.
- **Offline**: `sw.js` caches the app shell and passes through `/api/` and `/__/` (Firebase auth). Bump `CACHE` (`localwaala-vN`) whenever shipped files change so phones pick up the new version.

### Two run modes
On boot the app fetches `api/config`. If it answers, the app is in server mode: vendors sign in (Firebase, or dev login) and each vendor's khata gets its own localStorage key (`localwaallah.u.<uid>`). Otherwise (GitHub Pages) it stays phone-only under `localwaallah.v1`. Features touching the server must degrade gracefully when there is none (e.g. customer links fall back to a snapshot in the URL).

### Sync
The whole khata is PUT as one JSON document with optimistic versioning (`baseVersion`). On 409 the client runs `merge(remote, local)` (union by id for products/customers/payments, per-day merge for marks, local wins on conflict, customer `link` preserved) and retries once.

### Server (`server/index.js`, Express 5 + pg + firebase-admin)
- Serves `../app` statically and the `/api` routes documented in `server/README.md`. Tables (`vendors`, `ledgers`, `requests`, `payment_links`) are created with `CREATE TABLE IF NOT EXISTS` on startup; there is no migration tool.
- `ledgers.data` stores the client's `S` verbatim as JSONB, so the server reads the client's data shape directly (`customerSlice` and the public customer page logic). Changing the shape of `S` in `app.js` means checking `server/index.js` too.
- Public customer routes (`/api/public/:link`) are keyed by the customer's random `link` code and rate-limited; they must only expose that one customer's slice.
- Customer requests (pause/extra/"I've paid") are approved on the server but applied to the khata by the vendor's phone. Razorpay payment links are polled (on page visits and every 5 minutes) and recorded into the vendor's ledger server-side.
