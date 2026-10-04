# LocalWaallah

A daily delivery ledger for local vendors: milk, newspapers, water cans, laundry and ironing.
It is built for people who may not read much, so it uses large text, icons, fixed status colors with symbols, and Hindi or English.

## What it does

- **Today's delivery**: every house starts as ✓ Given. One tap changes it to ½ Half, ✕ Skip or +1 Extra, with Undo. Houses are grouped by area for the route.
- **Customers**: every day, alternate days, chosen weekdays, or "when they call". Away dates pause delivery.
- **Monthly bill**: a calendar of colored dots (green given, blue extra, amber half, red skipped, grey away), old due, payments and amount to pay. Sent on WhatsApp with a customer link.
- **Customer link**: opens the customer's calendar and a Pay by UPI button with no app install. All of the bill data is inside the link, so no server is needed.
- **Collect money**: cash, UPI, cheque or bank payments on a big keypad, dues list with an over-limit warning, and today's cash in hand.
- **Morning stock**: total litres for today or tomorrow shown as 40 L cans, read aloud, and sent to the dairy on WhatsApp.
- **Works offline**: data is saved on the phone (localStorage) and the app shell is cached by a service worker. Settings has backup and restore.

## Project layout

```
app/                  the whole app, plain HTML, CSS and JavaScript (no build step)
  index.html
  styles.css          Doodh Blue theme tokens and components
  i18n.js             English and Hindi strings
  app.js              ledger rules, screens and actions
  sw.js               offline cache
  manifest.webmanifest
.github/workflows/pages.yml   publishes app/ to GitHub Pages on every push to main
```

## Run it locally

```
python3 -m http.server 8000 --directory app
```

Then open http://localhost:8000 and tap "Try with sample data".

## Hosting

The `Publish app` workflow deploys `app/` to GitHub Pages. Pages must be turned on once in
Settings → Pages → Build and deployment → Source: **GitHub Actions**.
