# LocalWaala

A daily delivery ledger for local vendors: milk, newspapers, water cans, laundry and ironing.
It is built for people who may not read much, so it uses large text, icons, fixed status colors with symbols, and Hindi or English.

## What it does

- **Today's delivery**: every house starts as ✓ Given. One tap changes it to ½ Half, ✕ Skip or +1 Extra, with Undo. Houses are grouped by area for the route.
- **Customers**: every day, alternate days, chosen weekdays, or "when they call". Away dates pause delivery.
- **Monthly bill**: a calendar of colored dots (green given, blue extra, amber half, red skipped, grey away), old due, payments and amount to pay. Sent on WhatsApp with a customer link.
- **Customer page**: a live page per customer with today's and tomorrow's delivery, the month calendar, the bill and a Pay by UPI button, with no app install. Customers can ask for a pause or extra, and the vendor approves it on the Route screen. Without the server, the link carries a snapshot of the bill instead.
- **Collect money**: cash, UPI, cheque or bank payments on a big keypad, dues list with an over-limit warning, and today's cash in hand.
- **Morning stock**: total litres for today or tomorrow shown as 40 L cans, read aloud, and sent to the dairy on WhatsApp.
- **Several items per customer**: a house can take milk daily, paneer on weekends and curd when they call, each with its own quantity, days and rate.
- **Route map**: the vendor sets where the round starts and adds each customer's address, or pins it with the phone's GPS at the door. The Route screen shows the day's houses on a Google map in route order, and **Start directions** opens turn-by-turn directions in Google Maps through the next houses. **Route order** moves houses up or down, or picks the **Best order** (by road with a Maps key, otherwise by straight-line distance between pins).
- **Vendor accounts**: on your own server, vendors sign in with Google or email and password (Firebase) and each khata is saved to PostgreSQL. See [server/README.md](server/README.md).
- **Works offline**: data is saved on the phone (localStorage) and the app shell is cached by a service worker. With the server it syncs when the phone is back online. Settings has backup and restore.

## Project layout

```
app/                  the whole app, plain HTML, CSS and JavaScript (no build step)
  index.html
  styles.css          theme tokens (colors, type) and components
  i18n.js             English and Hindi strings
  app.js              ledger rules, screens and actions
  sw.js               offline cache
  manifest.webmanifest
.github/workflows/pages.yml   publishes app/ to GitHub Pages on every push to main
server/               Node.js server: Firebase sign-in, khata sync in PostgreSQL, serves app/
Dockerfile, docker-compose.yml, .env.example   run the server and database with Docker
```

## Run it locally

```
python3 -m http.server 8000 --directory app
```

Then open http://localhost:8000 and tap "Try with sample data".

## Hosting

**On your own server (with vendor accounts):** follow [server/README.md](server/README.md).

**GitHub Pages (no accounts, each phone keeps its own khata):**

The `Publish app` workflow deploys `app/` to GitHub Pages. Pages must be turned on once in
Settings → Pages → Build and deployment → Source: **GitHub Actions**.
