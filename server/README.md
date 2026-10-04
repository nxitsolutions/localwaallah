# LocalWaala server

Signs vendors in with Firebase (Google, or email and password), keeps each vendor's
khata in PostgreSQL, and serves the app from `../app`. Each vendor only ever sees their own khata.

The app still works offline: the khata is kept on the phone and synced to the server when the
phone is online. If two phones of the same vendor changed things while offline, both sets of
changes are kept; where both changed the very same day or customer, the phone that syncs last wins.

## 1. Set up Firebase (one time)

1. Go to https://console.firebase.google.com and create a project (Google Analytics can stay off).
2. **Build → Authentication → Get started → Sign-in method**, then enable:
   - **Google**
   - **Email/Password**
3. **Authentication → Settings → Authorized domains**: add the domain the app will run on,
   for example `app.yourcompany.in`.
4. **Project settings → General → Your apps → Add app → Web**. Copy `apiKey`, `authDomain`,
   `projectId` and `appId` into `.env` (see `.env.example`).

No service account key is needed: the server only checks sign-in tokens, which needs just the project id.

## 2. Google Maps for the route map (optional)

The Route screen shows the day's round on a Google map and can work out the best order of houses
by road. Without a key the app still opens turn-by-turn directions in the Google Maps app and orders
houses by straight-line distance between their pins.

1. In https://console.cloud.google.com (the Firebase project works), turn on billing. Google gives a
   free monthly allowance; a small dairy's daily use normally stays inside it.
2. **APIs & Services → Library**: enable **Maps JavaScript API**, **Directions API** and **Geocoding API**.
3. **APIs & Services → Credentials → Create credentials → API key**. Under *Application restrictions*
   choose **Websites** and add your app's domain (for example `https://app.yourcompany.in/*`); under
   *API restrictions* allow only the three APIs above.
4. Put it in `.env` as `GOOGLE_MAPS_API_KEY`. The app receives it from `/api/config`; it is a browser key,
   which is why the website restriction matters.

The map asks Google for the road route only when the day's houses or their order change, and an
address is looked up once and then kept with the customer, so marking deliveries costs nothing extra.

## 3. Run it

With Docker (app + database together):

```
cp .env.example .env      # then fill it in
docker compose up -d
```

Without Docker, using an existing PostgreSQL:

```
cd server && npm ci
DATABASE_URL=postgres://user:pass@host:5432/localwaallah \
FIREBASE_API_KEY=... FIREBASE_AUTH_DOMAIN=... FIREBASE_PROJECT_ID=... FIREBASE_APP_ID=... \
node index.js
```

The server listens on port 8080 (`PORT` changes it) and creates its two tables on first start.
Put it behind HTTPS (nginx, Caddy or a cloud load balancer): Google sign-in and the
offline app need HTTPS on a real domain.

## Local testing without Firebase

`DEV_LOGIN=1` shows a "Test login" box that signs in with any name and skips Firebase.
It is refused when `NODE_ENV=production`; never turn it on for a public server.

```
DATABASE_URL=postgres://localhost/localwaallah DEV_LOGIN=1 node index.js
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/config` | Firebase web config for the app (or `devLogin`), and the Maps key if set |
| GET | `/api/ledger` | The signed-in vendor's khata and its version |
| PUT | `/api/ledger` | Saves `{ data, baseVersion }`; answers 409 with the server copy if it changed meanwhile |
| GET | `/healthz` | Health check |

Requests carry `Authorization: Bearer <Firebase ID token>`.

## Data

- `vendors`: one row per signed-in vendor (Firebase uid, email, phone, name, shop name, last seen).
- `ledgers`: one row per vendor holding the whole khata as JSON, with a version number.
