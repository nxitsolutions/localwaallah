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

## 2. Run it

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
| GET | `/api/config` | Firebase web config for the app (or `devLogin`) |
| GET | `/api/ledger` | The signed-in vendor's khata and its version |
| PUT | `/api/ledger` | Saves `{ data, baseVersion }`; answers 409 with the server copy if it changed meanwhile |
| GET | `/healthz` | Health check |

Requests carry `Authorization: Bearer <Firebase ID token>`.

## Data

- `vendors`: one row per signed-in vendor (Firebase uid, email, phone, name, shop name, last seen).
- `ledgers`: one row per vendor holding the whole khata as JSON, with a version number.
