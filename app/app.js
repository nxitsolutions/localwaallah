/* LocalWaala: offline-first delivery ledger. Everything is stored on the phone (localStorage). */
(function () {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const todayStr = () => ymd(new Date());
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const monthOf = (s) => s.slice(0, 7);
  const monthStart = (ym) => ym + '-01';
  const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return ymd(new Date(y, m, 0)); };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const fq = (q) => String(parseFloat((+q || 0).toFixed(2)));
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const waPhone = (p) => { const d = digits(p); return d.length === 10 ? '91' + d : d; };

  // ---------- storage ----------
  // Phone-only mode keeps one khata here; signed-in vendors each get their own key (see useAccount).
  const LEGACY_KEY = 'localwaallah.v1';
  let KEY = LEGACY_KEY;
  const blank = () => ({
    vendor: { name: '', phone: '', upi: '', lang: 'en', limit: 1000, type: 'milk' },
    products: [], customers: [], marks: {}, payments: []
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { S = blank(); }
  let saveOk = true;
  function localSave() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); saveOk = true; } catch (e) { saveOk = false; toast('Phone storage is full. Save a backup file.'); }
  }
  function save() { localSave(); afterSave(); }

  const L = () => window.STRINGS[S.vendor.lang] || window.STRINGS.en;
  const t = (k) => L()[k] || window.STRINGS.en[k] || k;
  const locale = () => (S.vendor.lang === 'hi' ? 'hi-IN' : 'en-IN');

  // ---------- icons (stroke SVG) ----------
  const P = {
    back: '<path d="m15 5-7 7 7 7"/>', next: '<path d="m9 5 7 7-7 7"/>',
    list: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 1.5 1.5L12 8"/><path d="m8 15 1.5 1.5L12 14"/><path d="M14.5 9.5H17"/><path d="M14.5 15.5H17"/>',
    can: '<path d="M6.5 3h11v5.5a5.5 5.5 0 0 1-11 0z"/><path d="M6.5 9.5c0 3 1 4 1 6.5V21h9v-5c0-2.5 1-3.5 1-6.5"/><path d="M10 6h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4 0 4 1.6 4.5 4.5"/>',
    rupee: '<path d="M7 4h11"/><path d="M7 9h11"/><path d="M7 4h3.5a4.5 4.5 0 0 1 0 9H7l8 8"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
    nosig: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01"/><path d="m3 3 18 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', alert: '<path d="M12 7v6"/><path d="M12 17h.01"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    chat: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    pause: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M10 12v5M14 12v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    drop: '<path d="M12 3.5c3.5 4.2 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6.3 6-10.5z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v2"/><rect x="4" y="7" width="17" height="12" rx="2"/><path d="M16 13h2"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    sort: '<path d="M7 4v16"/><path d="m3.5 7.5 3.5-3.5 3.5 3.5"/><path d="M17 20V4"/><path d="m13.5 16.5 3.5 3.5 3.5-3.5"/>',
    nav: '<path d="M3 11 21 3l-8 18-2-8z"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>', link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'
  };
  const ic = (name, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[name] + '</svg>';

  // ---------- presets ----------
  const PRESETS = {
    milk: { products: [{ name: 'Full Cream', unit: 'L', rate: 68 }, { name: 'Toned', unit: 'L', rate: 56 }], sched: 'daily', qty: 1 },
    paper: { products: [{ name: 'Newspaper', unit: 'copy', rate: 8 }], sched: 'daily', qty: 1 },
    water: { products: [{ name: '20 L can', unit: 'can', rate: 40 }], sched: 'demand', qty: 1 },
    laundry: { products: [{ name: 'Ironing', unit: 'piece', rate: 10 }, { name: 'Wash + iron', unit: 'piece', rate: 25 }], sched: 'demand', qty: 1 },
    other: { products: [{ name: 'Item', unit: 'unit', rate: 10 }], sched: 'daily', qty: 1 }
  };

  // ---------- ledger rules ----------
  const prod = (id) => S.products.find((p) => p.id === id) || S.products[0] || { name: '?', unit: '', rate: 0 };
  const cust = (id) => S.customers.find((c) => c.id === id);
  // A customer takes one or more items ("lines"), each with its own quantity, days and rate.
  // The first line's id is the customer id, so marks saved before lines existed still match it.
  function lines(c) {
    if (!c.items || !c.items.length) {
      c.items = [{ id: c.id, productId: c.productId, qty: c.qty, sched: c.sched || { type: 'daily' }, rate: c.rate == null ? '' : c.rate }];
      delete c.productId; delete c.qty; delete c.sched; delete c.rate;
    }
    return c.items;
  }
  const lkey = (c, it) => (it.id === c.id ? c.id : c.id + '.' + it.id);
  const lineOf = (c, lid) => lines(c).find((x) => x.id === lid) || lines(c)[0];
  const rateOf = (it) => (it.rate != null && it.rate !== '' ? +it.rate : +prod(it.productId).rate || 0);
  const pauseOn = (c, day) => (c.pauses || []).find((p) => p.from <= day && day <= p.to);
  function isScheduled(c, it, day) {
    const s = it.sched || { type: 'daily' };
    if (s.type === 'daily') return true;
    if (s.type === 'alt') return ((diffDays(c.start || day, day) % 2) + 2) % 2 === 0;
    if (s.type === 'days') return (s.days || []).includes(parse(day).getDay());
    return false;
  }
  // st: done | half | skip | extra | away | none ; qty in the item's unit
  function lineInfo(c, it, day) {
    if (c.start && day < c.start) return { st: 'none', qty: 0 };
    const p = pauseOn(c, day);
    if (p) return { st: 'away', qty: 0, till: p.to };
    const m = (S.marks[day] || {})[lkey(c, it)];
    if ((it.sched || {}).type === 'demand') {
      return m && m.x > 0 ? { st: 'done', qty: +m.x, demand: true } : { st: 'none', qty: 0, demand: true };
    }
    if (!isScheduled(c, it, day)) return m && m.s === 'extra' ? { st: 'extra', qty: +(m.x || 1) } : { st: 'none', qty: 0 };
    const st = (m && m.s) || 'done';
    const q = +it.qty || 0;
    const qty = st === 'done' ? q : st === 'half' ? q / 2 : st === 'skip' ? 0 : q + +(m.x || 1);
    return { st, qty };
  }
  // The whole house for one day: amt is the money charged; st sums up all its items.
  function dayInfo(c, day) {
    const ls = lines(c).map((it) => ({ it, i: lineInfo(c, it, day) }));
    const amt = ls.reduce((a, x) => a + x.i.qty * rateOf(x.it), 0);
    if (ls.length === 1) return Object.assign({}, ls[0].i, { amt });
    const sts = ls.map((x) => x.i.st).filter((v) => v !== 'none');
    let st = 'done';
    if (sts.includes('away')) st = 'away';
    else if (!sts.length) st = 'none';
    else if (sts.every((v) => v === 'skip')) st = 'skip';
    else if (sts.includes('extra')) st = 'extra';
    else if (sts.includes('half') || sts.includes('skip')) st = 'half';
    return { st, qty: ls.reduce((a, x) => a + x.i.qty, 0), amt, till: (ls[0].i || {}).till };
  }
  function setMark(key, day, mark) {
    S.marks[day] = S.marks[day] || {};
    if (mark) S.marks[day][key] = mark; else delete S.marks[day][key];
    if (!Object.keys(S.marks[day]).length) delete S.marks[day];
  }
  function chargedBetween(c, from, to) {
    let amt = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) amt += dayInfo(c, d).amt;
    return amt;
  }
  const paidBetween = (c, from, to) => S.payments.filter((p) => p.cid === c.id && p.date >= from && p.date <= to).reduce((a, p) => a + +p.amt, 0);
  function balance(c, upTo) {
    const from = c.start || upTo;
    return (+c.opening || 0) + chargedBetween(c, from, upTo) - S.payments.filter((p) => p.cid === c.id && p.date <= upTo).reduce((a, p) => a + +p.amt, 0);
  }
  function monthBill(c, ym) {
    const first = monthStart(ym), today = todayStr();
    const last = monthEnd(ym) < today ? monthEnd(ym) : today;
    const old = balance(c, addDays(first, -1));
    const from = first < (c.start || first) ? c.start : first;
    const ls = lines(c).map((it) => {
      let qty = 0;
      for (let d = from; d <= last; d = addDays(d, 1)) qty += lineInfo(c, it, d).qty;
      return { it, p: prod(it.productId), qty, rate: rateOf(it), amount: qty * rateOf(it) };
    });
    const amount = ls.reduce((a, x) => a + x.amount, 0);
    const paid = paidBetween(c, first, monthEnd(ym));
    return { old, lines: ls, qty: ls[0].qty, amount, paid, due: old + amount - paid };
  }
  const active = () => S.customers.filter((c) => !c.deleted);
  // Houses the vendor arranged (Route order) come first in that order; the rest follow by area and flat.
  const ordOf = (c) => (c.order == null ? 1e9 : c.order);
  function sortRoute(list) {
    return list.slice().sort((a, b) => ordOf(a) - ordOf(b) || (a.sector || '').localeCompare(b.sector || '') || (a.flat || '').localeCompare(b.flat || '', undefined, { numeric: true }) || a.name.localeCompare(b.name));
  }

  S.customers.forEach(lines);

  // ---------- UI state ----------
  const ui = { day: todayStr(), sector: '', q: '', stockDay: 'today', filter: '', edit: null };
  const LOOK = {
    done: { cls: 's-done', sym: '✓', w: 'given' }, half: { cls: 's-half', sym: '½', w: 'half' },
    skip: { cls: 's-skip', sym: '✕', w: 'skip' }, extra: { cls: 's-extra', sym: '+', w: 'extra' },
    away: { cls: 's-away', sym: '॥', w: 'away' }, none: { cls: 's-none', sym: '', w: 'none' }
  };
  const NEXT = { done: 'half', half: 'skip', skip: 'extra', extra: 'done' };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, undo) {
    const el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" data-act="undo">' + esc(t('undo')) + '</button>' : '');
    el.hidden = false;
    toast.undo = undo || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; toast.undo = null; }, undo ? 6000 : 3000);
  }

  // ---------- shared bits ----------
  const heroImg = 'milkman.webp';
  const MARK = '<span class="logo"><img src="logo-mark.webp" alt="LocalWaala"></span>';
  // Big logo with the wordmark, for the welcome, sign-in and loading screens.
  const brand = (hi, sub) => '<div class="brand"><img src="logo.webp" alt="LocalWaala" width="220" height="203">' + (hi ? '<b>' + esc(hi) + '</b>' : '') + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  const other = (k) => (window.STRINGS[S.vendor.lang === 'hi' ? 'en' : 'hi'] || {})[k] || '';
  const bi = (k) => esc(t(k)) + '<small>' + esc(other(k)) + '</small>';
  const fill = (k, o) => t(k).replace(/\{(\w+)\}/g, (_, x) => o[x]);
  const dshort = (day) => parse(day).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const langBtn = () => '<button class="iconbtn" data-act="lang" aria-label="Change language">' + (S.vendor.lang === 'hi' ? 'A' : 'अ') + '</button>';
  function live() {
    if (!navigator.onLine || !saveOk) return '<span class="live off">' + esc(t('offlineShort')) + '</span>';
    if (acct && sync.state === 'busy') return '<span class="live busy">' + esc(t('syncing')) + '</span>';
    if (acct && sync.state === 'error') return '<span class="live off">' + esc(t('notSynced')) + '</span>';
    return '<span class="live">' + esc(t('saved')) + '</span>';
  }
  function appHead() {
    return '<header class="apphead">' + MARK + '<div class="t"><b>' + esc(S.vendor.name) + '</b><span>' + live() + '</span></div>' +
      langBtn() + '<a class="iconbtn" href="#/settings" aria-label="' + esc(t('settings')) + '">' + ic('gear', 'sm') + '</a></header>';
  }
  function pageHead(title, sub, back) {
    return '<header class="pagehead">' + (back ? '<a class="iconbtn plain" href="' + back + '" aria-label="' + esc(t('back')) + '">' + ic('back') + '</a>' : MARK) +
      '<div class="grow"><h1>' + esc(title) + '</h1>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' + langBtn() + '</header>';
  }
  function dayLabel(day) {
    const s = parse(day).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    if (day === todayStr()) return t('today') + ' · ' + s;
    if (day === addDays(todayStr(), 1)) return t('tomorrow') + ' · ' + s;
    return s;
  }
  const monthLabel = (ym) => parse(monthStart(ym)).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  function lineText(it) {
    const p = prod(it.productId);
    if ((it.sched || {}).type === 'demand') return p.name + ' · ' + t('onCall');
    return fq(it.qty) + ' ' + p.unit + ' ' + p.name;
  }
  const qtyText = (c) => lines(c).map(lineText).join(' + ');
  const schedLabel = (it) => t({ daily: 'daily', alt: 'alternate', days: 'pickDays', demand: 'onCall' }[(it.sched || {}).type] || 'daily');
  // One unit for the route totals when every item uses the same one (litres for a dairy); otherwise totals count houses.
  function mainUnit() {
    const units = [...new Set(active().flatMap((c) => lines(c).map((it) => prod(it.productId).unit)))];
    return units.length === 1 ? units[0] : '';
  }
  const stepOf = (unit) => (unit === 'L' ? 0.5 : 1);
  // A scheduled item stays "pending" on the route until the vendor confirms it. Bills still count it as delivered.
  function houseState(c, day) {
    const h = dayInfo(c, day);
    h.ls = lines(c).map((it) => {
      const i = lineInfo(c, it, day);
      i.pending = !(S.marks[day] || {})[lkey(c, it)] && !i.demand && i.st === 'done' && day >= todayStr();
      return { it, i };
    });
    h.pending = h.ls.some((x) => x.i.pending);
    return h;
  }
  const rowKind = (i) => (i.pending ? 'pending' : i.st === 'skip' || i.st === 'away' ? 'skip' : i.st === 'none' ? 'call' : 'done');
  const WD = () => (S.vendor.lang === 'hi' ? ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']);

  // ---------- addresses & route map ----------
  // A place is a GPS pin {lat, lng} or a typed address; Google Maps understands both.
  const hasGeo = (o) => !!(o && o.geo && isFinite(o.geo.lat) && isFinite(o.geo.lng));
  const placeOf = (o) => (hasGeo(o) ? o.geo.lat.toFixed(6) + ',' + o.geo.lng.toFixed(6) : String((o && o.addr) || '').trim());
  const gpsPin = (pos) => ({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), q: 'gps' });
  // Asks the phone where it is. fn gets a pin, or nothing when the location is not available.
  function getGps(fn) {
    if (!navigator.geolocation) { toast(t('gpsFail')); return; }
    toast(t('gettingGps'));
    navigator.geolocation.getCurrentPosition((pos) => { fn(gpsPin(pos)); toast(t('pinned')); }, () => toast(t('gpsFail')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  const geoNote = (o) => (hasGeo(o) && o.geo.q === 'gps' ? '<span class="tag ok">' + ic('check', 'xs') + esc(t('pinned')) + '</span>' : '');
  const customOrder = () => active().some((c) => c.order != null);
  const setOrder = (list) => list.forEach((c, i) => { c.order = i; });
  // Google Maps link with turn-by-turn directions. Phones accept up to 9 stops in between, so it covers the next 10 houses.
  function dirUrl(stops, from) {
    const pts = stops.map(placeOf).filter(Boolean).slice(0, 10);
    if (!pts.length) return '';
    const q = ['api=1', 'travelmode=driving', 'destination=' + encodeURIComponent(pts[pts.length - 1])];
    if (from) q.push('origin=' + encodeURIComponent(from));
    if (pts.length > 1) q.push('waypoints=' + encodeURIComponent(pts.slice(0, -1).join('|')));
    return 'https://www.google.com/maps/dir/?' + q.join('&');
  }
  function km(a, b) {
    const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  // Shortest-looking order over pinned houses: visit the nearest house next, then undo any crossings (2-opt).
  // Houses without a pin keep their order at the end. Returns null when fewer than two houses are pinned.
  function bestOrder(list, start) {
    const pinned = list.filter(hasGeo), rest = list.filter((c) => !hasGeo(c));
    if (pinned.length < 2) return null;
    let cur = start || pinned[0].geo;
    const left = pinned.slice(), out = [];
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((c, i) => { const d = km(cur, c.geo); if (d < bd) { bd = d; bi = i; } });
      cur = left[bi].geo; out.push(left.splice(bi, 1)[0]);
    }
    const P = [start || out[0].geo].concat(out.map((c) => c.geo));
    const n = P.length - 1;
    for (let pass = 0, better = true; better && pass < 50; pass++) {
      better = false;
      for (let i = 1; i < n; i++) {
        for (let j = i + 1; j <= n; j++) {
          const before = km(P[i - 1], P[i]) + (j < n ? km(P[j], P[j + 1]) : 0);
          const after = km(P[i - 1], P[j]) + (j < n ? km(P[i], P[j + 1]) : 0);
          if (after < before - 1e-9) {
            P.splice(i, j - i + 1, ...P.slice(i, j + 1).reverse());
            out.splice(i - 1, j - i + 1, ...out.slice(i - 1, j).reverse());
            better = true;
          }
        }
      }
    }
    return out.concat(rest);
  }
  // Houses the vendor visits on a day, in route order.
  const mapStops = (rows) => rows.filter((r) => { const k = rowKind(r.i); return k === 'pending' || k === 'done' || (k === 'call' && r.i.qty); });

  // Google map on the Route screen. It needs a Maps key from the server (GOOGLE_MAPS_API_KEY); without one the
  // Route screen draws a straight-line sketch of the pinned houses and still opens directions in Google Maps.
  const gm = { state: '', el: null, map: null, svc: null, geo: null, sig: '', pos: null, lines: [], marks: [], stops: [] };
  const mapsKey = () => (auth.cfg && auth.cfg.mapsKey) || '';
  const mapsOn = () => gm.state === 'ready';
  function loadMaps() {
    if (gm.state || !mapsKey() || !navigator.onLine) return;
    if (window.google && window.google.maps && window.google.maps.Map) { gm.state = 'ready'; return; }
    gm.state = 'loading';
    window.__lwMaps = () => { gm.state = 'ready'; render(); };
    window.gm_authFailure = () => { gm.state = 'failed'; gm.sig = ''; render(); };
    loadScript('https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(mapsKey()) + '&v=weekly&loading=async&callback=__lwMaps')
      .catch(() => { gm.state = 'failed'; render(); });
  }
  const gLoc = (o) => (hasGeo(o) ? { lat: o.geo.lat, lng: o.geo.lng } : placeOf(o));
  const STOPCOL = { pending: '#2E3336', done: '#1E8A3C', call: '#1E8A3C' };
  function dot(color, scale) {
    return { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 };
  }
  function placeMarks() {
    gm.marks.forEach((m) => m.setMap(null));
    gm.marks = [];
    if (!gm.pos) return;
    const next = gm.stops.findIndex((s) => s.kind === 'pending');
    gm.pos.forEach((p, i) => {
      if (!p) return;
      if (i === 0 && gm.hasStart) { gm.marks.push(new google.maps.Marker({ map: gm.map, position: p, icon: dot('#C9BDB1', 12), title: t('startAddr'), zIndex: 1 })); return; }
      const k = gm.hasStart ? i - 1 : i, s = gm.stops[k];
      gm.marks.push(new google.maps.Marker({
        map: gm.map, position: p, title: s.name, zIndex: 10 + (k === next ? 100 : 0),
        icon: dot(k === next ? '#C47F00' : STOPCOL[s.kind] || '#2E3336', k === next ? 14 : 11),
        label: { text: String(k + 1), color: '#fff', fontSize: '12px', fontWeight: '700' }
      }));
    });
  }
  // Draws the road route through every stop in order. The route is only fetched again when the stops or their order
  // change, so marking houses on the way does not cost another Directions request.
  async function drawMap(slot) {
    if (!gm.el) {
      gm.el = document.createElement('div'); gm.el.className = 'gmap';
      gm.map = new google.maps.Map(gm.el, { disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false });
      gm.svc = new google.maps.DirectionsService();
    }
    slot.appendChild(gm.el);
    const start = placeOf(S.vendor);
    const pts = (start ? [S.vendor] : []).concat(gm.stops.map((s) => s.c));
    const sig = JSON.stringify(pts.map(placeOf));
    if (sig === gm.sig) { placeMarks(); return; }
    gm.sig = sig; gm.hasStart = !!start;
    gm.lines.forEach((r) => r.setMap(null)); gm.lines = [];
    gm.pos = pts.map((o) => (hasGeo(o) ? { lat: o.geo.lat, lng: o.geo.lng } : null));
    let missed = false;
    // One request covers up to 25 stops in between; longer rounds are drawn in pieces.
    for (let a = 0; a < pts.length - 1; a += 26) {
      const b = Math.min(a + 26, pts.length - 1);
      try {
        const res = await gm.svc.route({ origin: gLoc(pts[a]), destination: gLoc(pts[b]), waypoints: pts.slice(a + 1, b).map((o) => ({ location: gLoc(o), stopover: true })), travelMode: google.maps.TravelMode.DRIVING });
        if (gm.sig !== sig) return;
        gm.lines.push(new google.maps.DirectionsRenderer({ map: gm.map, directions: res, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: '#2E3336', strokeOpacity: 0.75, strokeWeight: 5 } }));
        const legs = res.routes[0].legs;
        gm.pos[a] = gm.pos[a] || legs[0].start_location.toJSON();
        legs.forEach((l, i) => { gm.pos[a + 1 + i] = gm.pos[a + 1 + i] || l.end_location.toJSON(); });
      } catch (e) { missed = true; }
    }
    if (gm.sig !== sig) return;
    const bounds = new google.maps.LatLngBounds();
    gm.pos.forEach((p) => p && bounds.extend(p));
    if (!bounds.isEmpty()) { gm.map.fitBounds(bounds, 36); if (gm.pos.filter(Boolean).length === 1) gm.map.setZoom(16); }
    placeMarks();
    if (missed) toast(t('addrNotFound'));
  }
  // Without a Maps key: the pinned houses joined by straight lines, numbered in route order.
  function sketch(stops) {
    const pts = (hasGeo(S.vendor) ? [{ g: S.vendor.geo, home: true }] : []).concat(stops.map((s, i) => ({ g: hasGeo(s.c) ? s.c.geo : null, n: i + 1, kind: s.kind, next: s.next })).filter((p) => p.g));
    if (pts.length < 2) return '';
    const W = 340, H = 200, pad = 38;
    const lat0 = pts[0].g.lat * Math.PI / 180;
    const xy = pts.map((p) => [p.g.lng * Math.cos(lat0), -p.g.lat]);
    const xs = xy.map((v) => v[0]), ys = xy.map((v) => v[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const sc = Math.min((W - 2 * pad) / ((Math.max(...xs) - x0) || 1e-9), (H - 2 * pad) / ((Math.max(...ys) - y0) || 1e-9));
    const ox = (W - (Math.max(...xs) - x0) * sc) / 2, oy = (H - (Math.max(...ys) - y0) * sc) / 2;
    const P = xy.map((v) => [ox + (v[0] - x0) * sc, oy + (v[1] - y0) * sc]);
    // Flats in one building share a spot; spread them in a small ring so every number stays readable.
    const groups = [];
    P.forEach((q, i) => { const g = groups.find((x) => Math.hypot(x.c[0] - q[0], x.c[1] - q[1]) < 16); if (g) g.m.push(i); else groups.push({ c: q.slice(), m: [i] }); });
    groups.forEach((g) => {
      if (g.m.length < 2) return;
      const r = Math.max(14, g.m.length * 4.5);
      g.m.forEach((i, k) => { const a = 2 * Math.PI * k / g.m.length - Math.PI / 2; P[i] = [g.c[0] + r * Math.cos(a), g.c[1] + r * Math.sin(a)]; });
    });
    P.forEach((q) => { q[0] = +q[0].toFixed(1); q[1] = +q[1].toFixed(1); });
    let svg = '<svg class="sketch" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t('routeMap')) + '"><defs><pattern id="sg" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#E5E0D9" stroke-width="1"/></pattern></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#sg)"/><polyline points="' + P.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="#2E3336" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 7" opacity=".75"/>';
    pts.forEach((p, i) => {
      const [x, y] = P[i];
      if (p.home) svg += '<g transform="translate(' + (x - 11) + ' ' + (y - 11) + ')"><rect width="22" height="22" rx="6" fill="#C9BDB1" stroke="#fff" stroke-width="2"/><path d="M6 11.5 11 7l5 4.5V16H6z" fill="#2E3336"/></g>';
      else svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (p.next ? 12 : 10) + '" fill="' + (p.next ? '#C47F00' : STOPCOL[p.kind] || '#2E3336') + '" stroke="#fff" stroke-width="2"/><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + p.n + '</text>';
    });
    return svg + '</svg>';
  }
  function mapCard(rows) {
    const stops = mapStops(rows);
    const nextI = stops.findIndex((r) => r.i.pending);
    gm.stops = stops.map((r, i) => ({ c: r.c, name: r.c.name, kind: rowKind(r.i), next: i === nextI }));
    const located = stops.filter((r) => placeOf(r.c)).length;
    const missing = stops.length - located;
    const start = placeOf(S.vendor);
    loadMaps();
    let box;
    if (mapsOn() && located) box = '<div id="mapslot" class="mapbox"></div>';
    else box = sketch(gm.stops) || '<div class="mapempty">' + ic('pin') + '<span>' + esc(t('mapHint')) + '</span></div>';
    const todo = stops.filter((r) => r.i.pending && placeOf(r.c)).map((r) => r.c);
    // Directions start from wherever the phone is, through the next houses still to visit.
    const nav = dirUrl(todo, '');
    return '<div class="card mapcard"><div class="ctitle">' + ic('route') + '<h2 class="grow">' + esc(t('routeMap')) + '<small>' + stops.length + ' ' + esc(t('stopsN')) +
      (missing ? ' · ' + missing + ' ' + esc(t('noAddrN')) : '') + '</small></h2><a class="tag lav" href="#/order">' + ic('sort', 'xs') + esc(t('changeOrder')) + '</a></div>' + box +
      (!start ? '<a class="rowlink" href="#/settings">' + ic('home', 'sm') + '<span class="grow">' + esc(t('noStart')) + '</span>' + ic('next', 'sm') + '</a>' : '') +
      (nav ? '<a class="btn block" style="margin-top:12px" target="_blank" rel="noopener" href="' + esc(nav) + '">' + ic('nav') + esc(t('startNav')) + '</a>' +
        '<div class="muted mapnote">' + esc(fill('navNote', { n: Math.min(10, todo.length) })) + '</div>' : '') + '</div>';
  }
  function afterRender() {
    const slot = $('#mapslot');
    if (slot && mapsOn()) drawMap(slot).catch(() => {});
  }
  // With a Maps key, typed addresses get map coordinates once (kept with the customer) so "Best order" can use them.
  async function geocodeAll(list) {
    if (!mapsOn()) return;
    gm.geo = gm.geo || new google.maps.Geocoder();
    let changed = false;
    for (const o of list) {
      const a = String(o.addr || '').trim();
      if (!a || hasGeo(o)) continue;
      try {
        const r = await gm.geo.geocode({ address: a, region: 'in' });
        const L = r.results[0] && r.results[0].geometry.location;
        if (L) { o.geo = { lat: +L.lat().toFixed(6), lng: +L.lng().toFixed(6), q: a }; changed = true; }
      } catch (e) { /* not found: stays at the end */ }
    }
    if (changed) save();
  }
  // Road-distance order from Google for up to 25 houses; otherwise straight-line distance over the pinned houses.
  async function optimise(list) {
    const start = placeOf(S.vendor);
    if (mapsOn() && start && list.length <= 25 && list.every((c) => placeOf(c))) {
      try {
        const res = await new google.maps.DirectionsService().route({ origin: gLoc(S.vendor), destination: gLoc(S.vendor), waypoints: list.map((c) => ({ location: gLoc(c), stopover: true })), optimizeWaypoints: true, travelMode: google.maps.TravelMode.DRIVING });
        const ord = res.routes[0].waypoint_order;
        if (ord && ord.length === list.length) return ord.map((i) => list[i]);
      } catch (e) { /* fall back to straight lines */ }
    }
    await geocodeAll([S.vendor].concat(list));
    return bestOrder(list, hasGeo(S.vendor) ? S.vendor.geo : null);
  }
  function viewOrder() {
    const list = sortRoute(active());
    const start = placeOf(S.vendor);
    let html = pageHead(t('routeOrder'), other('routeOrder'), '#/home') +
      '<div class="card"><a class="rowlink soft" style="margin:0" href="#/settings"><span class="ordhome">' + ic('home', 'sm') + '</span><span class="grow col"><b>' + esc(t('startAddr')) + '</b><span class="muted" style="font-size:14px;font-weight:600">' +
      esc(S.vendor.addr || (hasGeo(S.vendor) ? t('pinned') : t('noStart'))) + '</span></span>' + ic('next', 'sm') + '</a>' +
      '<div class="btns"><button class="btn" data-act="bestorder"' + (ui.busy ? ' disabled' : '') + '>' + esc(t('bestOrder')) + '</button><button class="btn soft" data-act="areaorder">' + esc(t('areaOrder')) + '</button></div>' +
      '<p class="muted" style="font-size:14px;font-weight:600;margin:12px 2px 0">' + esc(t('orderHint')) + '</p></div>';
    html += '<div class="ordlist">' + list.map((c, i) => {
      const where = c.addr || (hasGeo(c) ? t('pinned') : '');
      return '<div class="ordrow"><span class="num">' + (i + 1) + '</span><span class="flat">' + esc(c.flat || initials(c.name)) + '</span><span class="grow col"><b>' + esc(c.name) + '</b>' +
        '<small class="' + (where ? '' : 'warn') + '">' + (hasGeo(c) && c.geo.q === 'gps' ? ic('pin', 'xs') : '') + esc(where || t('noAddr')) + '</small></span>' +
        '<button class="iconbtn" data-act="move" data-id="' + c.id + '" data-n="-1" aria-label="' + esc(t('moveUp')) + '"' + (i ? '' : ' disabled') + '>' + ic('up', 'sm') + '</button>' +
        '<button class="iconbtn" data-act="move" data-id="' + c.id + '" data-n="1" aria-label="' + esc(t('moveDown')) + '"' + (i < list.length - 1 ? '' : ' disabled') + '>' + ic('down', 'sm') + '</button></div>';
    }).join('') + '</div>';
    return html;
  }

  // ---------- views ----------
  function viewWelcome() {
    const types = ['milk', 'paper', 'water', 'laundry', 'other'];
    return '<div class="welcome"><header class="apphead bare">' + langBtn() + '</header>' + brand(t('welcome'), t('tagline')) +
      '<div class="card"><div class="field"><label for="w-name">' + esc(t('vendorName')) + '</label><div class="inp">' + ic('user', 'sm') + '<input id="w-name" autocomplete="organization" placeholder="Ramesh Dairy" value="' + esc(acct ? acct.name : '') + '"></div></div>' +
      '<div class="field"><span class="lab">' + esc(t('whatSell')) + '</span><div class="pills" id="w-type">' +
      types.map((k, i) => '<button type="button" class="pill' + (i === 0 ? ' on' : '') + '" data-act="pick" data-val="' + k + '">' + esc(t(k)) + '</button>').join('') + '</div></div></div>' +
      '<div class="stack"><button class="btn big block" data-act="start">' + ic('check') + esc(t('start')) + '</button>' +
      '<button class="btn line block" data-act="sample">' + esc(t('sample')) + '</button></div></div>';
  }

  function viewRoute() {
    const day = ui.day, today = todayStr();
    const all = sortRoute(active());
    const sectors = [...new Set(all.map((c) => c.sector || '').filter(Boolean))];
    if (ui.sector && !sectors.includes(ui.sector)) ui.sector = '';
    const rows = all.filter((c) => !ui.sector || c.sector === ui.sector).map((c) => ({ c, i: houseState(c, day) })).filter((r) => r.i.st !== 'none' || r.i.ls.some((x) => x.i.demand));
    const cnt = { pending: 0, done: 0, skip: 0, call: 0 };
    rows.forEach((r) => cnt[rowKind(r.i)]++);
    const u = mainUnit();
    let total = 0, done = 0;
    rows.forEach((r) => r.i.ls.forEach((x) => { total += x.i.qty; if (!x.i.pending) done += x.i.qty; }));
    const houses = cnt.done + cnt.pending;
    const pct = houses ? Math.round(100 * cnt.done / houses) : 0;
    const val = (q, h) => (u ? fq(q) + '<small>' + esc(u) + '</small>' : h + '<small>' + esc(t('houses')) + '</small>');
    const name = S.vendor.name.split(' ')[0] || S.vendor.name;

    let html = appHead() +
      '<div class="greet"><img src="' + heroImg + '" alt=""><span class="hi">' + esc(t('namaste')) + '</span><b>' + esc(name) + '</b><span class="d">' + esc(parse(today).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' })) + '</span></div>' +
      '<div class="rtitle"><span class="grow"><h1>' + bi('route') + '</h1></span>' +
      (sectors.length > 1 ? '<button class="secchip" data-act="sector">' + ic('pin', 'xs') + esc(ui.sector || t('allSectors')) + '</button>' : '') + '</div>' +
      '<div class="daypills">' + [-1, 0, 1].map((n) => {
        const d = addDays(day, n);
        const lab = d === today ? t('today') + ', ' + dshort(d) : parse(d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
        return '<button class="daypill' + (n === 0 ? ' on' : '') + '"' + (n ? ' data-act="day" data-n="' + n + '"' : ' aria-current="date"') + '>' + esc(lab) + '</button>';
      }).join('') + '</div>';

    if (!active().length) {
      return html + '<div class="card empty">' + esc(t('noCustomers')) + '<div class="stack"><a class="btn block" href="#/edit/new">' + ic('plus') + esc(t('addFirst')) + '</a>' +
        '<button class="btn line block" data-act="sample">' + esc(t('sample')) + '</button></div></div>';
    }

    html += '<div class="stats"><div class="tri">' +
      '<div class="stat"><span class="k">' + ic('can', 'xs') + esc(t('total')) + '</span><div class="v">' + val(total, houses) + '</div><span class="s">' + houses + ' ' + esc(t('houses')) + '</span></div>' +
      '<div class="stat"><span class="k">' + ic('check', 'xs') + esc(t('doneW')) + '</span><div class="v">' + val(done, cnt.done) + '</div><span class="s">' + cnt.done + ' ' + esc(t('houses')) + ' (' + pct + '%)</span></div>' +
      '<div class="stat"><span class="k">' + ic('clock', 'xs') + esc(t('left')) + '</span><div class="v">' + val(total - done, cnt.pending) + '</div><span class="s">' + cnt.pending + ' ' + esc(t('remaining')) + '</span></div></div>' +
      '<div class="pbar"><span style="width:' + pct + '%"></span></div><div class="pnote"><span>' + esc(cnt.pending ? t('progress') : t('allDone')) + '</span><b>' + pct + '%</b></div></div>' +
      mapCard(rows);

    const F = [['', 'all', '', rows.length], ['pending', 'pending', 'var(--muted)', cnt.pending], ['done', 'delivered', 'var(--given)', cnt.done], ['skip', 'skipped', 'var(--skip)', cnt.skip]];
    html += '<div class="chips">' + F.map(([k, lab, dot, n]) => '<button class="chip' + (ui.filter === k ? ' on' : '') + '" data-act="filter" data-val="' + k + '">' +
      (dot ? '<span class="dotc" style="background:' + dot + '"></span>' : '') + esc(t(lab)) + '<span class="n">' + n + '</span></button>').join('') + '</div>';

    const shown = rows.filter((r) => !ui.filter || rowKind(r.i) === ui.filter || (ui.filter === 'done' && rowKind(r.i) === 'call' && r.i.qty));
    const next = rows.find((r) => r.i.pending);
    let lastSector = null;
    const byArea = !customOrder();
    shown.forEach((r) => {
      if (byArea && sectors.length > 1 && !ui.sector && (r.c.sector || '') !== lastSector) {
        lastSector = r.c.sector || '';
        html += '<div class="secline">' + ic('pin', 'xs') + esc(lastSector || '—') + '</div>';
      }
      html += routeRow(r.c, r.i, next && next.c === r.c);
    });
    if (!shown.length) html += '<div class="empty">—</div>';
    html += '<div class="stack" style="margin-top:22px"><button class="btn red block" data-act="closed">' + ic('pause') + esc(t('shopClosed')) + '</button></div>';

    const leftQ = total - done;
    html += '<div class="runbar"><div class="in"><span class="ico">' + ic('truck') + '</span><div class="txt"><b>' +
      (cnt.pending ? cnt.pending + ' ' + esc(t('housesLeft')) : esc(t('allDone'))) + '</b><span>' + (cnt.pending && u ? fq(leftQ) + ' ' + esc(u) + ' ' + esc(t('toDeliver')) : esc(dayLabel(day))) + '</span></div>' +
      '<button class="mic" data-act="voice" aria-label="' + esc(t('speak')) + '">' + ic('mic') + '</button>' +
      (cnt.pending ? '<button class="end" data-act="endrun">' + ic('check', 'sm') + esc(t('endRun')) + '</button>' : '<span class="end done">' + ic('check', 'sm') + '</span>') + '</div></div>';
    return html;
  }

  function statusPill(i) {
    if (i.st === 'half') return '<span class="spill half">½ ' + esc(t('half')) + '</span>';
    if (i.st === 'skip') return '<span class="spill skip">' + ic('close', 'xs') + esc(t('skipped')) + '</span>';
    if (i.st === 'extra') return '<span class="spill extra">' + ic('plus', 'xs') + esc(t('extra')) + '</span>';
    return '<span class="spill done">' + ic('check', 'xs') + esc(t('delivered')) + '</span>';
  }
  function rowNote(it, i, p) {
    if (i.st === 'skip') return t('notGiven');
    if (i.st === 'half') return t('half') + ' · ' + fq(i.qty) + ' ' + p.unit;
    if (i.st === 'extra') return t('delivered') + ' ' + fq(i.qty) + ' ' + p.unit + ' (+' + fq(i.qty - (+it.qty || 0)) + ' ' + t('extra') + ')';
    return t('delivered') + ' ' + fq(i.qty) + ' ' + p.unit;
  }
  function rowActions(it, p, d) {
    const step = stepOf(p.unit);
    return '<div class="acts"><button class="deliver" data-act="mark" data-s="done"' + d + '><span class="q">' + ic('check') + fq(it.qty) + ' ' + esc(p.unit) + '</span><small>' + esc(t('delivered')) + '</small></button>' +
      '<button class="xtra" data-act="mark" data-s="extra"' + d + '>+' + fq(step) + ' ' + esc(p.unit) + '<small>' + esc(t('extra')) + '</small></button>' +
      '<button class="half" data-act="mark" data-s="half"' + d + '>½<small>' + esc(t('half')) + '</small></button>' +
      '<button class="skipc" data-act="mark" data-s="skip"' + d + '>' + ic('ban') + '<small>' + esc(t('skip')) + '</small></button></div>';
  }
  const itemChip = (it, p, demand) => '<span class="item">' + ic(p.unit === 'L' ? 'drop' : 'can', 'xs') + esc(p.name) + (demand ? '' : ' • ' + fq(it.qty) + ' ' + esc(p.unit)) + '</span>';
  // Buttons for one item of a house; a house with several items shows one block per item.
  function lineBody(c, it, i, multi) {
    const p = prod(it.productId);
    const open = ui.edit === lkey(c, it);
    const d = ' data-id="' + c.id + '" data-line="' + it.id + '"';
    let pill, body;
    if (i.demand) {
      pill = i.qty ? '<span class="spill done">' + ic('check', 'xs') + fq(i.qty) + ' ' + esc(p.unit) + '</span>' : '<span class="spill pending">' + ic('phone', 'xs') + esc(t('onCall')) + '</span>';
      body = '<div class="acts"><button class="deliver" data-act="give"' + d + '><span class="q">' + ic('plus') + '1 ' + esc(p.unit) + '</span><small>' + esc(t('given')) + '</small></button>' +
        (i.qty ? '<button class="skipc" data-act="clear"' + d + ' aria-label="' + esc(t('undo')) + '">' + ic('close') + '<small>' + esc(t('undo')) + '</small></button>' : '') + '</div>';
    } else if (i.pending) {
      pill = '<span class="spill pending">' + ic('clock', 'xs') + esc(t('pending')) + '</span>';
      body = rowActions(it, p, d);
    } else {
      pill = statusPill(i);
      body = (open ? rowActions(it, p, d) : '') + '<div class="rnote">' + ic('info', 'sm') + '<span class="grow">' + esc(rowNote(it, i, p)) + '</span><button class="linkbtn" data-act="change"' + d + '>' + esc(open ? t('close') : t('change')) + '</button></div>';
    }
    return multi ? '<div class="line"><div class="lhead">' + itemChip(it, p, i.demand) + pill + '</div>' + body + '</div>' : { pill, body };
  }
  function routeRow(c, h, isNext) {
    const bal = balance(c, todayStr());
    const multi = lines(c).length > 1;
    const vis = h.ls.filter((x) => x.i.st !== 'none' || x.i.demand);
    let pill, body;
    if (h.st === 'away') {
      pill = '<span class="spill away">' + ic('pause', 'xs') + esc(t('onVacation')) + '</span>';
      body = '<div class="rnote amber">' + ic('info', 'sm') + '<span class="grow">' + esc(fill('pausedUntil', { d: dshort(h.till) })) + '</span><button class="linkbtn" data-act="resume" data-id="' + c.id + '">' + esc(t('resumeToday')) + '</button></div>';
    } else if (!multi) {
      const r = lineBody(c, vis[0].it, vis[0].i, false);
      pill = r.pill; body = r.body;
    } else {
      pill = h.pending ? '<span class="spill pending">' + ic('clock', 'xs') + esc(t('pending')) + '</span>' : h.st === 'none' ? '' : statusPill(h);
      body = vis.map((x) => lineBody(c, x.it, x.i, true)).join('');
    }
    const go = isNext ? dirUrl([c], '') : '';
    if (isNext && (c.phone || go)) {
      body += '<div class="rnote"><span class="grow">' + esc(c.addr || [c.flat, c.sector].filter(Boolean).join(', ')) + '</span>' +
        (go ? '<a class="callbtn" target="_blank" rel="noopener" href="' + esc(go) + '">' + ic('nav', 'sm') + esc(t('directions')) + '</a>' : '') +
        (c.phone ? '<a class="callbtn" href="tel:' + esc(digits(c.phone)) + '">' + ic('phone', 'sm') + esc(t('call')) + '</a>' : '') + '</div>';
    }
    const chips = multi ? '<span class="item">' + ic('can', 'xs') + lines(c).length + ' ' + esc(t('itemsN')) + '</span>' : itemChip(vis[0].it, prod(vis[0].it.productId), vis[0].i.demand);
    return '<div class="rcard ' + h.st + (isNext ? ' next' : '') + '"><div class="rtop"><a class="flat" href="#/c/' + c.id + '">' + esc(c.flat || initials(c.name)) + '</a>' +
      '<a class="who" href="#/c/' + c.id + '"><span class="nm"><span>' + esc(c.name) + '</span>' + (isNext ? '<span class="tag amber">' + esc(t('upNext')) + '</span>' : '') + '</span>' +
      '<span class="meta">' + chips + (bal > 0.5 ? '<span class="duechip">+' + rupees(bal) + ' ' + esc(t('due')) + '</span>' : '') + '</span></a>' + pill + '</div>' + body + '</div>';
  }

  function viewCustomers() {
    const q = ui.q.trim().toLowerCase();
    const list = sortRoute(active()).filter((c) => !q || (c.name + ' ' + (c.flat || '') + ' ' + (c.sector || '')).toLowerCase().includes(q));
    const day = todayStr();
    const limit = +S.vendor.limit || 1e12;
    let html = appHead() + '<div class="rtitle"><span class="grow"><h1>' + bi('customers') + '</h1></span><span class="tag pri">' + active().length + '</span></div>' +
      '<label class="search">' + ic('users', 'sm') + '<input id="search" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(ui.q) + '" aria-label="' + esc(t('search')) + '"></label>';
    if (!list.length) html += '<div class="empty">' + esc(t('noCustomers')) + '<div class="stack"><a class="btn block" href="#/edit/new">' + ic('plus') + esc(t('addCustomer')) + '</a></div></div>';
    list.forEach((c) => {
      const b = balance(c, day);
      const away = pauseOn(c, day);
      html += '<a class="ccard" href="#/c/' + c.id + '"><span class="flat">' + esc(c.flat || initials(c.name)) + '</span><span class="col grow"><span class="nm">' + esc(c.name) + '</span>' +
        '<span class="sub">' + esc(qtyText(c)) + (c.sector ? ' · ' + esc(c.sector) : '') + '</span>' + (away ? '<span><span class="tag err">' + esc(t('onVacation')) + '</span></span>' : '') + '</span>' +
        '<span class="amt' + (b > limit ? ' red' : '') + '">' + (b > 0.5 ? rupees(b) : '<span class="tag ok">' + ic('check', 'xs') + '</span>') + '</span></a>';
    });
    return html;
  }

  function estimate(items) {
    let total = 0, known = false;
    items.forEach((x) => {
      const per = { daily: 30, alt: 15, days: x.days.length * 30 / 7 }[x.type];
      if (!per) return;
      known = true;
      total += per * x.qty * (x.rate === '' || x.rate == null ? +prod(x.pid).rate : +x.rate);
    });
    return known ? rupees(total) + ' ' + t('perMonth') : '—';
  }
  const formItem = (it) => ({ id: it.id || '', pid: it.productId || (S.products[0] || {}).id, qty: +it.qty || 1, type: (it.sched || {}).type || 'daily', days: ((it.sched || {}).days || [1, 3, 5]).slice(), rate: it.rate == null ? '' : it.rate });
  function formFrom(id) {
    const c = id === 'new' ? null : cust(id);
    const preset = PRESETS[S.vendor.type] || PRESETS.milk;
    return {
      key: id,
      f: c ? { name: c.name, phone: c.phone, flat: c.flat, sector: c.sector, addr: c.addr || '', geo: c.geo || null, opening: c.opening, start: c.start }
        : { name: '', phone: '', flat: '', sector: ui.sector || '', addr: '', geo: null, opening: '', start: todayStr() },
      items: c ? lines(c).map(formItem) : [formItem({ productId: (S.products[0] || {}).id, qty: preset.qty, sched: { type: preset.sched, days: [1, 3, 5] } })]
    };
  }
  // Keeps typed text when the form re-draws after a button tap.
  function snapForm() {
    const F = ui.form; if (!F || !$('#f-name')) return;
    ['name', 'phone', 'flat', 'sector', 'addr', 'opening', 'start'].forEach((k) => { const el = $('#f-' + k); if (el) F.f[k] = el.value; });
    F.items.forEach((x, n) => { const el = $('#f-rate-' + n); if (el) x.rate = el.value; });
  }
  const fld = (icon, fid, lab, val, attrs) => '<div class="field"><label for="' + fid + '">' + lab + '</label><div class="inp">' + ic(icon, 'sm') + '<input id="' + fid + '" value="' + esc(val == null ? '' : val) + '" ' + (attrs || 'autocomplete="off"') + '></div></div>';
  function itemCard(x, n, count) {
    const p = prod(x.pid);
    const d = ' data-i="' + n + '"';
    const types = [['daily', 'daily'], ['alt', 'alternate'], ['days', 'pickDays'], ['demand', 'onCall']];
    const presets = p.unit === 'L' ? [0.5, 1, 1.5, 2, 3] : [1, 2, 3, 4, 5];
    return '<div class="itemcard"><div class="head">' + ic(p.unit === 'L' ? 'drop' : 'can', 'sm') + '<span class="grow">' + esc(t('itemN')) + ' ' + (n + 1) + '</span>' +
      (count > 1 ? '<button class="iconbtn" data-act="delitem"' + d + ' aria-label="' + esc(t('delete')) + '">' + ic('close', 'sm') + '</button>' : '') + '</div>' +
      '<div class="field"><div class="pills">' + S.products.map((y) => '<button type="button" class="pill' + (y.id === x.pid ? ' on' : '') + '" data-act="fprod"' + d + ' data-val="' + y.id + '">' + esc(y.name) + ' (₹' + esc(y.rate) + '/' + esc(y.unit) + ')</button>').join('') + '</div></div>' +
      '<div class="field"><span class="lab">' + esc(t('schedule')) + '</span><div class="seg">' + types.map(([k, lab]) => '<button type="button" class="' + (x.type === k ? 'on' : '') + '" data-act="sched"' + d + ' data-val="' + k + '">' + esc(t(lab)) + '</button>').join('') + '</div>' +
      (x.type === 'days' ? '<div class="days7">' + WD().map((w, i) => '<button type="button" class="' + (x.days.includes(i) ? 'on' : '') + '" data-act="wday"' + d + ' data-val="' + i + '" aria-pressed="' + x.days.includes(i) + '">' + w + '</button>').join('') + '</div>' : '') + '</div>' +
      (x.type === 'demand' ? '' : '<div class="field"><span class="lab">' + esc(t('qty')) + '</span><div class="qtybox"><div class="stepper"><button type="button" data-act="qty"' + d + ' data-n="-1" aria-label="Less">−</button>' +
        '<div class="val"><output>' + fq(x.qty) + '</output><small>' + esc(p.unit) + '</small></div><button type="button" class="plus" data-act="qty"' + d + ' data-n="1" aria-label="More">+</button></div>' +
        '<div class="presets">' + presets.map((v) => '<button type="button" class="' + (v === x.qty ? 'on' : '') + '" data-act="qtyset"' + d + ' data-val="' + v + '">' + fq(v) + ' ' + esc(p.unit) + '</button>').join('') + '</div></div></div>') +
      fld('rupee', 'f-rate-' + n, esc(t('rate')), x.rate, 'type="number" inputmode="decimal" data-rate="' + n + '" placeholder="' + esc(p.rate) + '"') + '</div>';
  }
  function viewEdit(id) {
    const isNew = id === 'new';
    if (!isNew && !cust(id)) return viewNotFound();
    if (!ui.form || ui.form.key !== id) ui.form = formFrom(id);
    const F = ui.form, f = F.f;
    const sectors = [...new Set(active().map((x) => x.sector).filter(Boolean))];
    const opt = ' <small>' + esc(t('optional')) + '</small>';
    return pageHead(isNew ? t('addCustomer') : t('editCustomer'), isNew ? other('addCustomer') : f.name, isNew ? '#/home' : '#/c/' + id) +
      '<div class="card"><div class="ctitle">' + ic('user') + '<h2>' + esc(t('details')) + '</h2></div>' +
      fld('user', 'f-name', esc(t('name')), f.name) +
      fld('phone', 'f-phone', esc(t('phone')) + opt, f.phone, 'type="tel" inputmode="tel"') +
      '<div class="row" style="gap:10px;align-items:flex-end"><div class="grow">' + fld('building', 'f-flat', esc(t('flat')), f.flat) + '</div>' +
      '<div class="grow">' + fld('pin', 'f-sector', esc(t('area')), f.sector, 'list="sectors" autocomplete="off"') + '</div></div>' +
      '<datalist id="sectors">' + sectors.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
      fld('pin', 'f-addr', esc(t('address')) + opt, f.addr, 'autocomplete="street-address" placeholder="' + esc(t('addrPh')) + '"') +
      '<div class="pinrow">' + (f.geo && f.geo.q === 'gps' ? geoNote({ geo: f.geo }) + '<button type="button" class="linkbtn" data-act="unpincust">' + esc(t('removePin')) + '</button>'
        : '<button type="button" class="btn soft" data-act="gpscust">' + ic('target', 'sm') + esc(t('pinHere')) + '</button>') + '</div>' +
      (isNew ? fld('cal', 'f-start', esc(t('firstDay')), f.start, 'type="date"') : '') +
      fld('wallet', 'f-opening', esc(t('oldDue')), f.opening, 'type="number" inputmode="decimal" placeholder="0"') + '</div>' +
      '<div class="card"><div class="ctitle">' + ic('truck') + '<h2>' + esc(t('deliverySetup')) + '</h2></div>' +
      F.items.map((x, n) => itemCard(x, n, F.items.length)).join('') +
      '<button class="btn line block" style="margin-top:14px" data-act="additem">' + ic('plus') + esc(t('addAnother')) + '</button></div>' +
      '<div class="est"><span>' + esc(t('estMonthly')) + '</span><b id="f-est">' + esc(estimate(F.items)) + '</b></div>' +
      '<button class="btn big block" data-act="savecust" data-id="' + (isNew ? '' : id) + '">' + ic('check') + esc(t('save')) + '</button>' +
      (isNew ? '' : '<div class="stack"><button class="btn red block" data-act="delcust" data-id="' + id + '">' + esc(t('delete')) + '</button></div>');
  }

  function calendarHtml(cells, interactive) {
    return '<div class="cal"><div class="wd">' + WD().map((w) => '<span>' + w + '</span>').join('') + '</div><div class="grid">' +
      cells.map((x) => {
        if (!x) return '<span class="cell"></span>';
        const inner = '<span class="n">' + x.n + '</span><span class="d ' + (x.future ? 'future' : LOOK[x.st].cls) + '">' + (x.future ? '' : (x.label != null ? x.label : LOOK[x.st].sym)) + '</span>';
        return interactive
          ? '<button class="cell' + (x.today ? ' today' : '') + '" data-act="cycleday" data-day="' + x.day + '" aria-label="' + x.n + ': ' + esc(t(LOOK[x.st].w)) + '">' + inner + '</button>'
          : '<span class="cell' + (x.today ? ' today' : '') + '">' + inner + '</span>';
      }).join('') + '</div></div>';
  }
  function legendHtml(counts) {
    return '<div class="lgd">' + ['done', 'extra', 'half', 'skip', 'away'].map((k) =>
      '<div><span class="d ' + LOOK[k].cls + '">' + LOOK[k].sym + '</span><b>' + counts[k] + '</b><small>' + esc(t(LOOK[k].w)) + '</small></div>').join('') + '</div>';
  }
  function monthCells(c, ym) {
    const first = parse(monthStart(ym)), lastDay = +monthEnd(ym).slice(8), today = todayStr();
    const cells = Array(first.getDay()).fill(null);
    const counts = { done: 0, extra: 0, half: 0, skip: 0, away: 0, none: 0 };
    const codes = [];
    for (let d = 1; d <= lastDay; d++) {
      const day = ym + '-' + pad(d);
      const i = dayInfo(c, day);
      const future = day > today && i.st !== 'away';
      if (!future) counts[i.st]++;
      const label = i.demand && i.qty ? fq(i.qty) : null;
      cells.push({ n: d, day, st: i.st, future, today: day === today, label });
      codes.push(future ? '-' : ({ done: 'd', half: 'h', skip: 's', extra: 'e', away: 'a', none: 'n' })[i.st] + (i.demand && i.qty ? fq(i.qty) : ''));
    }
    return { cells, counts, codes };
  }
  const LOGTAG = { done: 'ok', extra: 'blue', half: 'amber', skip: 'err', away: 'err', none: '' };

  function viewCustomer(id, ym) {
    const c = cust(id);
    if (!c) return viewNotFound();
    ym = ym || monthOf(todayStr());
    ui.month = ym;
    const today = todayStr();
    const ls = lines(c);
    const single = ls.length === 1 ? prod(ls[0].productId) : null;
    const { cells, counts } = monthCells(c, ym);
    const b = monthBill(c, ym);
    const pz = (c.pauses || []).filter((x) => x.to >= today).sort((a, z) => a.from.localeCompare(z.from))[0];
    const pays = S.payments.filter((x) => x.cid === c.id).sort((a, z) => z.date.localeCompare(a.date)).slice(0, 3);
    let html = pageHead(t('khata'), S.vendor.name, '#/customers') +
      '<div class="card"><div class="profile"><span class="av big">' + esc(initials(c.name)) + '</span><div class="grow"><h2>' + esc(c.name) + '</h2>' +
      '<div class="sub">' + esc([c.flat, c.sector].filter(Boolean).join(' · ')) + '</div>' + (c.addr ? '<div class="sub row" style="gap:5px">' + ic('pin', 'xs') + esc(c.addr) + '</div>' : '') + (c.phone ? '<div class="sub row" style="gap:5px">' + ic('phone', 'xs') + esc(c.phone) + '</div>' : '') + '</div>' +
      '<a class="iconbtn" href="#/edit/' + c.id + '" aria-label="' + esc(t('editCustomer')) + '">' + ic('edit', 'sm') + '</a></div>' +
      (c.phone || placeOf(c) ? '<div class="btns">' + (c.phone ? '<a class="btn soft" href="tel:' + esc(digits(c.phone)) + '">' + ic('phone', 'sm') + esc(t('call')) + '</a><a class="btn lav" target="_blank" rel="noopener" href="https://wa.me/' + esc(waPhone(c.phone)) + '">' + ic('chat', 'sm') + 'WhatsApp</a>' : '') +
        (placeOf(c) ? '<a class="btn soft" target="_blank" rel="noopener" href="' + esc(dirUrl([c], '')) + '">' + ic('nav', 'sm') + esc(t('directions')) + '</a>' : '') + '</div>' : '') + '</div>' +
      '<div class="hero"><div class="lab">' + esc(t('totalOutstanding')) + ' · ' + esc(other('totalOutstanding')) + '</div><div class="big">' + rupees(Math.max(0, b.due)) + '<small>' + esc(b.due < -0.5 ? rupees(-b.due) + ' ' + t('advance') : t('toPay')) + '</small></div>' +
      '<div class="brk">' + b.lines.map((x) => '<div><span>' + esc((ls.length > 1 ? x.p.name : monthLabel(ym)) + ' · ' + fq(x.qty) + ' ' + x.p.unit + ' × ₹' + fq(x.rate)) + '</span><b>' + rupees(x.amount) + '</b></div>').join('') +
      '<div><span>' + esc(t('oldDueShort')) + '</span><b>' + (b.old < 0 ? '− ' + rupees(-b.old) : rupees(b.old)) + '</b></div><div><span>' + esc(t('paid')) + '</span><b>− ' + rupees(b.paid) + '</b></div></div>' +
      '<div class="stack"><button class="btn white" data-act="pay" data-id="' + c.id + '">' + ic('wallet') + esc(t('collect')) + '</button>' +
      '<a class="btn lav" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, billText(c, ym))) + '">' + ic('chat') + esc(t('sendWhatsApp')) + '</a></div></div>';

    html += '<div class="card"><div class="ctitle">' + ic('can') + '<h2 class="grow">' + esc(t('subscription')) + '<small>' + esc(other('subscription')) + '</small></h2><a class="tag lav" href="#/edit/' + c.id + '">' + ic('plus', 'xs') + esc(t('addItem')) + '</a></div>';
    ls.forEach((it, n) => {
      const p = prod(it.productId); const s = it.sched || { type: 'daily' };
      html += '<div class="sub-item"' + (n ? ' style="margin-top:10px"' : '') + '><span class="ic">' + ic(p.unit === 'L' ? 'drop' : 'can') + '</span><div class="grow"><b style="font-size:17px">' + esc(p.name) + '</b><div class="muted" style="font-size:14px;font-weight:600">₹' + fq(rateOf(it)) + ' / ' + esc(p.unit) + '</div></div>' +
        '<div class="q">' + (s.type === 'demand' ? '—' : fq(it.qty) + ' ' + esc(p.unit)) + '<small>' + esc(schedLabel(it)) + '</small></div></div>';
      if (s.type === 'days') html += '<div class="wk" style="margin-top:8px">' + [1, 2, 3, 4, 5, 6, 0].map((d) => '<span class="' + ((s.days || []).includes(d) ? 'on' : '') + '">' + WD()[d] + '</span>').join('') + '</div>';
    });
    html += '<button class="rowlink" data-act="pausesheet" data-id="' + c.id + '">' + ic('pause') + '<span class="grow">' + esc(pz ? dshort(pz.from) + ' – ' + dshort(pz.to) + ' · ' + t('onVacation') : t('pauseDelivery')) + '</span>' + ic('next', 'sm') + '</button></div>';

    html += '<div class="card"><div class="ctitle"><h2 class="grow">' + esc(t('dailyLog')) + '<small>' + esc(other('dailyLog')) + '</small></h2></div><div class="log">';
    for (let k = 0; k < 5; k++) {
      const day = addDays(today, -k);
      if (c.start && day < c.start) break;
      const i = dayInfo(c, day);
      const tag = i.st === 'none' ? t('noDelivery') : t(LOOK[i.st].w);
      html += '<button class="logrow ' + i.st + (k === 0 ? ' today' : '') + '" data-act="cycleday" data-day="' + day + '"><span class="dn">' + +day.slice(8) + '</span>' +
        '<span class="grow col"><span class="dt">' + esc(parse(day).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })) + '</span><span><span class="tag ' + LOGTAG[i.st] + '">' + esc(tag) + '</span></span></span>' +
        '<span class="qq">' + (single ? fq(i.qty) + ' ' + esc(single.unit) : rupees(i.amt)) + '<small>' + (single ? rupees(i.amt) : '') + '</small></span></button>';
    }
    html += '</div></div>';

    html += '<div class="card"><div class="monthnav"><a class="iconbtn round" href="#/c/' + c.id + '/' + shiftMonth(ym, -1) + '" aria-label="Previous month">' + ic('back') + '</a><div class="t"><b>' + esc(monthLabel(ym)) + '</b><span>' + esc(t('tapDay')) + '</span></div>' +
      '<a class="iconbtn round" href="#/c/' + c.id + '/' + shiftMonth(ym, 1) + '" aria-label="Next month">' + ic('next') + '</a></div>' + calendarHtml(cells, true) + legendHtml(counts) + '</div>';

    html += '<div class="card"><div class="ctitle"><h2 class="grow">' + esc(t('recentPay')) + '<small>' + esc(other('recentPay')) + '</small></h2></div><div class="log">' +
      (pays.length ? pays.map((x) => '<div class="payrow"><span class="ic">' + ic(x.mode === 'cash' ? 'wallet' : 'qr', 'sm') + '</span><div class="grow"><b>' + rupees(x.amt) + '</b> <span class="tag pri">' + esc(t(x.mode)) + '</span><div class="muted" style="font-size:13px;font-weight:600">' + esc(dshort(x.date)) + '</div></div></div>').join('')
        : '<div class="muted" style="font-weight:600">' + esc(t('noPayments')) + '</div>') + '</div></div>' +
      '<div class="stack"><button class="btn line block" data-act="copylink" data-id="' + c.id + '">' + ic('link') + esc(t('custLink')) + '</button></div>';
    return html;
  }

  function viewBilling() {
    const today = todayStr();
    const ym = ui.bym || monthOf(today);
    const limit = +S.vendor.limit || 0;
    const list = active();
    const bills = list.map((c) => ({ c, b: monthBill(c, ym) }));
    const billed = bills.reduce((a, x) => a + x.b.amount, 0);
    const collected = bills.reduce((a, x) => a + x.b.paid, 0);
    const pending = bills.reduce((a, x) => a + Math.max(0, x.b.due), 0);
    const pendN = bills.filter((x) => x.b.due > 0.5).length;
    const pct = collected + pending ? Math.round(100 * collected / (collected + pending)) : 100;
    const todays = S.payments.filter((x) => x.date === today);
    const cash = todays.filter((x) => x.mode === 'cash').reduce((a, x) => a + +x.amt, 0);
    const got = todays.reduce((a, x) => a + +x.amt, 0);
    const rows = list.map((c) => ({ c, b: balance(c, today) })).filter((x) => x.b > 0.5).sort((a, z) => z.b - a.b);
    let html = appHead() +
      '<div class="card"><div class="monthnav"><button class="iconbtn round" data-act="bmonth" data-n="-1" aria-label="Previous month">' + ic('back') + '</button><div class="t"><b>' + esc(monthLabel(ym)) + '</b><span>' + esc(dshort(monthStart(ym)) + ' – ' + dshort(monthEnd(ym))) + '</span></div>' +
      '<button class="iconbtn round" data-act="bmonth" data-n="1" aria-label="Next month">' + ic('next') + '</button></div></div>' +
      '<div class="hero"><div class="lab">' + esc(other('totalBilling')) + '</div><h2 style="font-size:24px;font-weight:800;position:relative;z-index:1">' + esc(t('totalBilling')) + '</h2>' +
      '<div class="big">' + rupees(billed) + '<small>/ ' + list.length + ' ' + esc(t('accounts')) + '</small></div>' +
      '<div class="brk"><div><span>' + esc(t('recovery')) + '</span><b>' + pct + '% ' + esc(t('collected')) + '</b></div><div class="pbar" style="margin:8px 0 4px;background:rgba(255,255,255,.18)"><span style="width:' + pct + '%;background:var(--lav)"></span></div></div></div>' +
      '<div class="duo"><div class="card"><div class="k">' + esc(t('doneK')) + '<span class="tag ok">' + ic('check', 'xs') + '</span></div><div class="v" style="color:var(--ok)">' + rupees(collected) + '</div><div class="s">' + (list.length - pendN) + ' ' + esc(t('paidUp')) + '</div></div>' +
      '<div class="card"><div class="k">' + esc(t('pendingK')) + '<span class="tag err">' + ic('clock', 'xs') + '</span></div><div class="v" style="color:var(--err)">' + rupees(pending) + '</div><div class="s">' + pendN + ' ' + esc(t('accountsDue')) + '</div></div></div>' +
      '<div class="sectionh"><h2>' + esc(t('billingOps')) + '</h2></div><div class="ops">' +
      '<button class="op pri" data-act="duesheet">' + ic('chat') + '<span>' + esc(t('sendDues')) + '<small>' + rows.length + ' ' + esc(t('payLinks')) + '</small></span></button>' +
      '<div class="op">' + ic('wallet') + '<span>' + rupees(got) + ' ' + esc(t('collectedToday')) + '<small>' + rupees(cash) + ' ' + esc(t('cash')) + ' · ' + rupees(got - cash) + ' UPI</small></span></div>' +
      '<a class="op" href="#/stock">' + ic('can') + '<span>' + esc(t('stock')) + '<small>' + esc(t('stockSub')) + '</small></span></a></div>';

    html += '<div class="sectionh"><h2>' + esc(t('overdue')) + ' <span class="tag err">' + rows.length + '</span></h2><small>' + esc(other('overdue')) + '</small></div>';
    if (!rows.length) html += '<div class="card empty">' + esc(t('nobodyOwes')) + '</div>';
    rows.forEach(({ c, b }) => {
      const over = limit && b > limit;
      const lp = S.payments.filter((x) => x.cid === c.id).sort((a, z) => z.date.localeCompare(a.date))[0];
      const since = diffDays(lp ? lp.date : (c.start || today), today);
      html += '<div class="odcard"><div class="top"><a class="av' + (over ? ' red' : '') + '" href="#/c/' + c.id + '">' + esc(initials(c.name)) + '</a>' +
        '<a class="grow col" href="#/c/' + c.id + '"><b style="font-size:17px">' + esc(c.name) + '</b><span class="muted" style="font-size:14px;font-weight:600">' + esc([c.flat, qtyText(c)].filter(Boolean).join(' • ')) + '</span></a>' +
        '<div class="amtcol"><button class="amt red" data-act="pay" data-id="' + c.id + '">' + rupees(b) + '</button><span class="tag ' + (over ? 'err' : 'amber') + '">' + esc(over ? t('overLimit') : since + ' ' + t('daysSince')) + '</span></div></div>' +
        '<div class="foot">' + ic('clock', 'xs') + '<span class="grow">' + esc(lp ? t('lastPaid') + ': ' + dshort(lp.date) + ' (' + rupees(lp.amt) + ')' : t('noPayments')) + '</span>' +
        '<a class="ping" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, billText(c, monthOf(today)))) + '">' + ic('chat', 'sm') + esc(t('ping')) + '</a></div></div>';
    });

    html += '<div class="sectionh"><div><h2>' + esc(t('rates')) + '</h2><small>' + esc(other('rates')) + '</small></div><button class="iconbtn round" data-act="addprod" aria-label="' + esc(t('addItem')) + '">' + ic('plus') + '</button></div>';
    S.products.forEach((x) => {
      const homes = list.filter((c) => lines(c).some((it) => it.productId === x.id)).length;
      html += '<div class="prow"><span class="ic">' + ic(x.unit === 'L' ? 'drop' : 'can') + '</span><div class="grow"><b>' + esc(x.name) + '</b><div class="muted" style="font-size:13px;font-weight:600">' + homes + ' ' + esc(t('activeHomes')) + '</div>' +
        '<div class="r">₹' + esc(x.rate) + ' / ' + esc(x.unit) + '</div></div><button class="editrate" data-act="ratesheet" data-id="' + x.id + '">' + ic('edit', 'xs') + esc(t('editRate')) + '</button></div>';
    });
    html += '<div class="stack" style="margin-top:20px"><button class="btn big block" data-act="paypick">' + ic('rupee') + esc(t('recordPayment')) + '</button></div>';
    return html;
  }

  function stockFor(day) {
    const per = {};
    let extra = 0, away = 0, awayHouses = 0, extraHouses = 0;
    active().forEach((c) => {
      let ex = false, aw = false;
      lines(c).forEach((it) => {
        const i = lineInfo(c, it, day);
        const p = prod(it.productId);
        const k = p.id || p.name;
        per[k] = per[k] || { p, qty: 0 };
        per[k].qty += i.qty;
        if (i.st === 'extra') { extra += i.qty - (isScheduled(c, it, day) ? +it.qty : 0); ex = true; }
        if (i.st === 'away' && (it.sched || {}).type !== 'demand' && isScheduled(c, it, day)) { away += +it.qty; aw = true; }
      });
      if (ex) extraHouses++;
      if (aw) awayHouses++;
    });
    return { items: Object.values(per).filter((x) => x.qty > 0), extra, away, awayHouses, extraHouses };
  }
  function canSvg(f) {
    const h = Math.round(26 * f);
    return '<svg width="34" height="46" viewBox="0 0 34 46" fill="none" aria-hidden="true"><rect x="11" y="1" width="12" height="5" rx="1.5" fill="#7D8286"/><path d="M12 6v4l-7 5v27a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V15l-7-5V6" stroke="#7D8286" stroke-width="2.2" stroke-linejoin="round"/><rect x="7.5" y="' + (41 - h) + '" width="19" height="' + h + '" rx="2" fill="#2E3336"/></svg>';
  }
  function viewStock() {
    const day = ui.stockDay === 'tomorrow' ? addDays(todayStr(), 1) : todayStr();
    const s = stockFor(day);
    const litres = s.items.filter((x) => x.p.unit === 'L').reduce((a, x) => a + x.qty, 0);
    let html = appHead() + '<div class="rtitle"><span class="grow"><h1>' + bi('stock') + '</h1></span></div>' +
      '<div class="seg"><button class="' + (ui.stockDay === 'today' ? 'on' : '') + '" data-act="stockday" data-val="today">' + esc(t('today')) + '</button><button class="' + (ui.stockDay === 'tomorrow' ? 'on' : '') + '" data-act="stockday" data-val="tomorrow">' + esc(t('tomorrow')) + '</button></div>' +
      '<div class="hero"><div class="stockhero"><div class="grow"><div class="lab">' + esc(t('totalMilk')) + ' · ' + esc(dayLabel(day)) + '</div><div class="big">' +
      (litres ? fq(litres) + ' L' : s.items.length ? fq(s.items[0].qty) + ' ' + esc(s.items[0].p.unit) : '0') + '</div></div>' +
      '<button class="listen" data-act="speakstock" aria-label="' + esc(t('readAloud')) + '">' + ic('speaker') + esc(t('readAloud')) + '</button></div></div>';
    s.items.forEach((x) => {
      let cans = '';
      if (x.p.unit === 'L') {
        let left = x.qty; const arr = [];
        while (left >= 40) { arr.push(1); left -= 40; }
        if (left > 0) arr.push(left / 40);
        const full = arr.filter((f) => f === 1).length;
        cans = '<div class="cans">' + arr.map(canSvg).join('') + '<span class="muted" style="font-weight:600;margin-left:6px">' + [full ? full + ' ' + (full === 1 ? t('can') : t('cans')) : '', left > 0 ? fq(left) + ' L' : ''].filter(Boolean).map(esc).join(' + ') + (full ? ' · 40 L ' + esc(t('cans')) : '') + '</span></div>';
      }
      html += '<div class="prow" style="flex-wrap:wrap"><span class="ic">' + ic(x.p.unit === 'L' ? 'drop' : 'can') + '</span><b class="grow">' + esc(x.p.name) + '</b><span style="font-size:28px;font-weight:800;color:var(--pri)">' + fq(x.qty) + ' ' + esc(x.p.unit) + '</span>' + (cans ? '<div style="flex-basis:100%">' + cans + '</div>' : '') + '</div>';
    });
    if (!s.items.length) html += '<div class="card empty">0</div>';
    if (s.extra) html += '<div class="noteline"><span class="d s-extra">+</span>' + fq(s.extra) + ' ' + esc(t('extraAsked')) + ' · ' + s.extraHouses + ' ' + esc(s.extraHouses === 1 ? t('house') : t('houses')) + '</div>';
    if (s.away) html += '<div class="noteline"><span class="d s-away">॥</span>' + fq(s.away) + ' ' + esc(t('lessAway')) + ' · ' + s.awayHouses + ' ' + esc(s.awayHouses === 1 ? t('house') : t('houses')) + '</div>';
    html += '<div class="stack"><a class="btn green block" target="_blank" rel="noopener" href="' + esc(waLink('', S.vendor.name + ' · ' + dayLabel(day) + '\n' + s.items.map((x) => x.p.name + ': ' + fq(x.qty) + ' ' + x.p.unit).join('\n'))) + '">' + ic('chat') + esc(t('sendDairy')) + '</a></div>';
    return html;
  }

  const startPin = () => (hasGeo(S.vendor) && S.vendor.geo.q === 'gps' ? geoNote(S.vendor) + '<button type="button" class="linkbtn" data-act="unpinstart">' + esc(t('removePin')) + '</button>'
    : '<button type="button" class="btn soft" data-act="gpsstart">' + ic('target', 'sm') + esc(t('useGps')) + '</button>');
  function viewSettings() {
    const v = S.vendor;
    const fld = (icon, fid, lab, val, attrs) => '<div class="field"><label for="' + fid + '">' + esc(lab) + '</label><div class="inp">' + ic(icon, 'sm') + '<input id="' + fid + '" value="' + esc(val) + '" ' + (attrs || '') + '></div></div>';
    return pageHead(t('settings'), other('settings'), '#/home') +
      (acct ? '<div class="card"><div class="profile"><span class="av big">' + esc(initials(acct.name || acct.email || S.vendor.name)) + '</span><div class="grow"><div class="lbl" style="margin:0">' + esc(t('account')) + '</div>' +
        '<b style="font-size:17px;word-break:break-all">' + esc(acct.email || acct.phone || acct.name) + '</b><div class="sub">' + live() + '</div></div></div>' +
        '<div class="stack"><button class="btn soft block" data-act="logout">' + esc(t('logout')) + '</button></div></div>' : '') +
      '<div class="card">' + fld('user', 's-name', t('vendorName'), v.name) + fld('phone', 's-phone', t('yourPhone'), v.phone, 'type="tel" inputmode="tel"') +
      fld('qr', 's-upi', t('upiId'), v.upi, 'autocapitalize="off"') + fld('alert', 's-limit', t('limit'), v.limit, 'type="number" inputmode="numeric"') + '</div>' +
      '<div class="card"><div class="ctitle">' + ic('home') + '<h2 class="grow">' + esc(t('startAddr')) + '<small>' + esc(other('startAddr')) + '</small></h2></div>' +
      fld('pin', 's-addr', t('address'), v.addr || '', 'autocomplete="street-address" placeholder="' + esc(t('startAddrPh')) + '"') +
      '<div class="pinrow" id="s-geo">' + startPin() + '</div></div><div class="card">' +
      '<div class="field"><span class="lab">' + esc(t('language')) + '</span><div class="seg"><button type="button" class="' + (v.lang === 'en' ? 'on' : '') + '" data-act="setlang" data-val="en">English</button><button type="button" class="' + (v.lang === 'hi' ? 'on' : '') + '" data-act="setlang" data-val="hi">हिंदी</button></div></div></div>' +
      '<div class="card"><div class="ctitle">' + ic('can') + '<h2 class="grow">' + esc(t('items')) + '</h2><button class="iconbtn round" data-act="addprod" aria-label="' + esc(t('addItem')) + '">' + ic('plus') + '</button></div>' +
      S.products.map((p) => '<div class="prodedit"><input data-prod="' + p.id + '" data-k="name" value="' + esc(p.name) + '" aria-label="' + esc(t('product')) + '">' +
        '<input data-prod="' + p.id + '" data-k="unit" value="' + esc(p.unit) + '" aria-label="' + esc(t('unit')) + '">' +
        '<input type="number" inputmode="decimal" data-prod="' + p.id + '" data-k="rate" value="' + esc(p.rate) + '" aria-label="' + esc(t('rate')) + '"></div>').join('') + '</div>' +
      '<div class="stack"><button class="btn big block" data-act="savesettings">' + ic('check') + esc(t('save')) + '</button>' +
      '<button class="btn line block" data-act="backup">' + esc(t('backup')) + '</button>' +
      '<label class="btn line block">' + esc(t('restore')) + '<input type="file" accept="application/json" id="restore" hidden></label>' +
      '<button class="btn line block" data-act="sample">' + esc(t('sample')) + '</button>' +
      '<button class="btn red block" data-act="reset">' + esc(t('resetAll')) + '</button></div>';
  }

  // Customer-facing page: everything it needs travels inside the link, so it opens without an account or server.
  function viewPublic(payload) {
    let d;
    try { d = JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return viewNotFound(); }
    const ym = d.m;
    const first = parse(monthStart(ym));
    const cells = Array(first.getDay()).fill(null);
    const counts = { done: 0, extra: 0, half: 0, skip: 0, away: 0, none: 0 };
    const MAP = { d: 'done', h: 'half', s: 'skip', e: 'extra', a: 'away', n: 'none' };
    (d.d || []).forEach((code, i) => {
      const future = code === '-';
      const st = future ? 'none' : MAP[code[0]] || 'none';
      if (!future) counts[st]++;
      cells.push({ n: i + 1, st, future, label: code.length > 1 ? code.slice(1) : null });
    });
    const upi = d.u ? 'upi://pay?pa=' + encodeURIComponent(d.u) + '&pn=' + encodeURIComponent(d.v) + '&am=' + Math.max(0, Math.round(d.due)) + '&cu=INR&tn=' + encodeURIComponent(d.n + ' ' + monthLabel(ym)) : '';
    const ask = (txt) => 'https://wa.me/' + waPhone(d.vp) + '?text=' + encodeURIComponent(txt);
    document.title = d.v + ' · ' + d.n;
    const rows = d.l || [[d.p, d.un, d.q, d.r, d.a]];
    return '<div class="pub"><header class="apphead">' + MARK + '<div class="t"><b>' + esc(d.v) + '</b><span>LocalWaala · ' + esc(t('noApp')) + '</span></div>' + langBtn() + '</header>' +
      '<div class="card"><div class="profile"><span class="av big">' + esc(initials(d.n)) + '</span><div class="grow"><h2>' + esc(d.n) + '</h2><div class="sub">' + esc([d.f, rows.map((x) => x[0]).join(', ')].filter(Boolean).join(' · ')) + '</div></div></div></div>' +
      '<div class="hero"><div class="lab">' + esc(t('toPay')) + ' · ' + esc(monthLabel(ym)) + '</div><div class="big">' + rupees(Math.max(0, d.due)) + '</div>' +
      '<div class="brk">' + rows.map((x) => '<div><span>' + esc((rows.length > 1 ? x[0] + ' · ' : '') + fq(x[2]) + ' ' + x[1] + ' × ₹' + fq(x[3])) + '</span><b>' + rupees(x[4]) + '</b></div>').join('') + '<div><span>' + esc(t('oldDueShort')) + '</span><b>' + rupees(d.o) + '</b></div><div><span>' + esc(t('paid')) + '</span><b>− ' + rupees(d.pd) + '</b></div></div>' +
      (upi && d.due > 0 ? '<div class="stack"><a class="btn white" href="' + esc(upi) + '">' + ic('qr') + esc(t('payUpi')) + ' ' + rupees(d.due) + '</a></div>' : '') + '</div>' +
      '<div class="card"><div class="monthnav"><div class="t"><b>' + esc(monthLabel(ym)) + '</b></div></div>' + calendarHtml(cells, false) + legendHtml(counts) + '</div>' +
      (d.vp ? '<div class="btns"><a class="btn line" href="' + esc(ask('Please pause delivery for ' + d.n + ' (' + (d.f || '') + ') from __ to __')) + '">' + ic('pause', 'sm') + esc(t('askPause')) + '</a>' +
        '<a class="btn line" href="' + esc(ask('Please send extra for ' + d.n + ' (' + (d.f || '') + '): ')) + '">' + ic('plus', 'sm') + esc(t('askExtra')) + '</a></div>' : '') + '</div>';
  }

  const viewNotFound = () => '<div class="empty" style="padding-top:80px">Not found.<div class="stack"><a class="btn block" href="#/home">' + esc(t('back')) + '</a></div></div>';

  // ---------- links & sharing ----------
  function publicLink(c, ym) {
    const b = monthBill(c, ym);
    const { codes } = monthCells(c, ym);
    const data = { v: S.vendor.name, vp: S.vendor.phone, u: S.vendor.upi, n: c.name, f: c.flat, m: ym, d: codes, o: Math.round(b.old), a: Math.round(b.amount), pd: Math.round(b.paid), due: Math.round(b.due),
      l: b.lines.map((x) => [x.p.name, x.p.unit, +fq(x.qty), x.rate, Math.round(x.amount)]) };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#/s/' + enc;
  }
  function billText(c, ym) {
    const b = monthBill(c, ym);
    const out = [
      'Namaste ' + c.name + ',',
      S.vendor.name + ' · ' + monthLabel(ym),
      ...b.lines.map((x) => x.p.name + ': ' + fq(x.qty) + ' ' + x.p.unit + ' × ₹' + fq(x.rate) + ' = ' + rupees(x.amount)),
      t('oldDueShort') + ': ' + rupees(b.old),
      t('paid') + ': ' + rupees(b.paid),
      t('toPay') + ': *' + rupees(Math.max(0, b.due)) + '*'
    ];
    if (S.vendor.upi) out.push('UPI: ' + S.vendor.upi);
    out.push('', publicLink(c, ym));
    return out.join('\n');
  }
  const waLink = (phone, text) => 'https://wa.me/' + (phone ? waPhone(phone) : '') + '?text=' + encodeURIComponent(text);

  // ---------- sheets ----------
  function sheet(html) { $('#sheet-root').innerHTML = '<div class="scrim" data-act="closesheet"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>'; }
  const closeSheet = () => { $('#sheet-root').innerHTML = ''; };
  const sheetHead = (title) => '<div class="row" style="margin-bottom:8px"><h2 class="grow">' + esc(title) + '</h2><button class="iconbtn" data-act="closesheet" aria-label="' + esc(t('cancel')) + '">' + ic('close') + '</button></div>';
  // In-app confirm: browser confirm() boxes are blocked in some app views and scary for new users.
  function askThen(msg, fn) {
    ui.pending = fn;
    sheet('<h2>' + esc(msg) + '</h2><div class="btns" style="margin-top:18px"><button class="btn soft" data-act="closesheet">' + esc(t('cancel')) + '</button><button class="btn" data-act="yes">' + ic('check') + esc(t('yesDo')) + '</button></div>');
  }
  function linkSheet(link) {
    sheet(sheetHead(t('custLink')) + '<textarea id="linkbox" readonly rows="4">' + esc(link) + '</textarea>' +
      '<div class="btns"><button class="btn" data-act="copytext">' + ic('link') + esc(t('copy')) + '</button><a class="btn line" target="_blank" rel="noopener" href="' + esc(link) + '">' + esc(t('open')) + '</a></div>');
  }
  function paySheet(cid) {
    const c = cust(cid);
    const b = Math.max(0, Math.round(balance(c, todayStr())));
    ui.pay = { cid, amt: '', mode: 'cash', due: b };
    sheet(sheetHead(c.name) + '<div class="muted" style="font-weight:600">' + esc(t('due')) + ': ' + rupees(b) + '</div>' +
      '<div class="amountshow" id="amt">₹0</div>' +
      '<div class="seg">' + ['cash', 'upi', 'cheque', 'bank'].map((m) => '<button type="button" class="' + (m === 'cash' ? 'on' : '') + '" data-act="paymode" data-val="' + m + '">' + esc(t(m)) + '</button>').join('') + '</div>' +
      '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'full', '0', 'del'].map((k) =>
        '<button type="button" data-act="key" data-val="' + k + '"' + (k === 'del' ? ' aria-label="Delete"' : '') + '>' + (k === 'del' ? '⌫' : k === 'full' ? '<span style="font-size:16px">' + rupees(b) + '</span>' : k) + '</button>').join('') + '</div>' +
      '<div class="stack"><button class="btn green big block" data-act="savepay">' + ic('check') + esc(t('received')) + '</button></div>');
  }
  function payPickSheet() {
    const today = todayStr();
    const list = sortRoute(active()).map((c) => ({ c, b: balance(c, today) })).sort((a, z) => z.b - a.b);
    sheet(sheetHead(t('pickCustomer')) + list.map(({ c, b }) => '<button class="pick" data-act="pay" data-id="' + c.id + '"><span class="flat">' + esc(c.flat || initials(c.name)) + '</span><b class="grow">' + esc(c.name) + '</b><span class="amt' + (b > 0.5 ? ' red' : '') + '">' + (b > 0.5 ? rupees(b) : '') + '</span></button>').join(''));
  }
  function dueSheet() {
    const today = todayStr();
    const rows = active().map((c) => ({ c, b: balance(c, today) })).filter((x) => x.b > 0.5).sort((a, z) => z.b - a.b);
    sheet(sheetHead(t('sendDues')) + (rows.length ? rows.map(({ c, b }) => '<a class="pick" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, billText(c, monthOf(today)))) + '"><span class="av">' + esc(initials(c.name)) + '</span><b class="grow">' + esc(c.name) + '<br><span class="amt red">' + rupees(b) + '</span></b><span class="ping">' + ic('chat', 'sm') + esc(t('ping')) + '</span></a>').join('') : '<div class="empty">' + esc(t('nobodyOwes')) + '</div>'));
  }
  function rateSheet(pid) {
    const p = S.products.find((x) => x.id === pid);
    if (!p) return;
    sheet(sheetHead(t('editRate')) + '<div class="field"><label for="r-name">' + esc(t('product')) + '</label><div class="inp"><input id="r-name" value="' + esc(p.name) + '"></div></div>' +
      '<div class="row" style="gap:10px"><div class="field grow"><label for="r-rate">' + esc(t('rate')) + '</label><div class="inp">' + ic('rupee', 'sm') + '<input id="r-rate" type="number" inputmode="decimal" value="' + esc(p.rate) + '"></div></div>' +
      '<div class="field" style="width:110px"><label for="r-unit">' + esc(t('unit')) + '</label><div class="inp"><input id="r-unit" value="' + esc(p.unit) + '"></div></div></div>' +
      '<div class="stack"><button class="btn big block" data-act="saverate" data-id="' + p.id + '">' + ic('check') + esc(t('save')) + '</button></div>');
  }
  function pauseSheet(cid) {
    const c = cust(cid);
    const tm = addDays(todayStr(), 1);
    sheet(sheetHead(t('pauseDates')) + '<div class="muted" style="font-weight:600">' + esc(c.name) + '</div>' +
      '<div class="row" style="gap:10px;margin-top:6px"><div class="field grow"><label for="p-from">' + esc(t('from')) + '</label><div class="inp"><input type="date" id="p-from" value="' + tm + '"></div></div>' +
      '<div class="field grow"><label for="p-to">' + esc(t('to')) + '</label><div class="inp"><input type="date" id="p-to" value="' + addDays(tm, 4) + '"></div></div></div>' +
      '<div class="stack"><button class="btn big block" data-act="savepause" data-id="' + c.id + '">' + ic('pause') + esc(t('pause')) + '</button></div>' +
      (c.pauses || []).filter((p) => p.to >= todayStr()).map((p) => '<div class="card row" style="margin:12px 0 0"><span class="grow" style="font-weight:700">' +
        esc(dshort(p.from)) + ' – ' + esc(dshort(p.to)) + '</span><button class="btn soft" style="min-height:44px" data-act="delpause" data-id="' + c.id + '" data-from="' + p.from + '">' + esc(t('resume')) + '</button></div>').join(''));
  }

  // ---------- voice ----------
  function voice(btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast(t('noVoice')); return; }
    const r = new SR();
    r.lang = S.vendor.lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false; r.maxAlternatives = 3;
    btn.classList.add('on'); toast(t('listening'));
    r.onresult = (e) => {
      const alts = Array.from(e.results[0]).map((a) => a.transcript);
      for (const a of alts) { if (applyVoice(a)) return; }
      toast(t('heard') + ': "' + alts[0] + '". ' + t('didntGet'));
    };
    r.onerror = () => toast(t('noVoice'));
    r.onend = () => btn.classList.remove('on');
    r.start();
  }
  // "skip 302", "302 nahi", "2 extra 302", "302 aadha", "flat 302 do litre zyada"
  function applyVoice(text) {
    const r = location.hash.split('/')[1] || '';
    const day = r === '' || r === 'home' || r === 'today' ? ui.day : todayStr();
    const raw = text.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d))).toLowerCase();
    const numWords = { one: 1, two: 2, three: 3, four: 4, five: 5, ek: 1, do: 2, teen: 3, char: 4, paanch: 5, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5 };
    const tokens = raw.split(/[\s,.]+/).filter(Boolean);
    const c = active().find((x) => x.flat && tokens.includes(String(x.flat).toLowerCase())) ||
      active().find((x) => raw.includes(x.name.toLowerCase().split(' ')[0]));
    if (!c) return false;
    let st = 'done';
    if (/skip|nahi|nahin|नहीं|नही|मत|band|बंद|no /.test(raw + ' ')) st = 'skip';
    else if (/half|aadha|adha|आधा/.test(raw)) st = 'half';
    else if (/extra|zyada|jyada|ज़्यादा|ज्यादा|और|aur|more|add/.test(raw)) st = 'extra';
    const it = lines(c).find((y) => raw.includes(prod(y.productId).name.toLowerCase().split(' ')[0])) || lines(c).find((y) => lineInfo(c, y, day).st !== 'none') || lines(c)[0];
    const key = lkey(c, it);
    let x = 1;
    for (const tk of tokens) {
      if (tk === String(c.flat).toLowerCase()) continue;
      if (/^\d+(\.\d+)?$/.test(tk)) { x = +tk; break; }
      if (numWords[tk]) { x = numWords[tk]; break; }
    }
    const prev = (S.marks[day] || {})[key];
    if ((it.sched || {}).type === 'demand') setMark(key, day, st === 'skip' ? null : { s: 'extra', x });
    else setMark(key, day, st === 'extra' ? { s: 'extra', x } : { s: st });
    save(); render();
    const i = lineInfo(c, it, day);
    toast(t('heard') + ': ' + (c.flat || '') + ' ' + c.name + ' · ' + prod(it.productId).name + ' → ' + t(LOOK[i.st].w) + (i.st === 'extra' ? ' +' + fq(x) : ''), () => { setMark(key, day, prev || null); save(); render(); });
    return true;
  }

  // ---------- sample data ----------
  function loadSample() {
    const today = todayStr();
    const start = monthStart(shiftMonth(monthOf(today), -2));
    const fc = { id: uid(), name: 'Full Cream', unit: 'L', rate: 68 }, tn = { id: uid(), name: 'Toned', unit: 'L', rate: 56 };
    const pn = { id: uid(), name: 'Paneer', unit: 'kg', rate: 340 }, dh = { id: uid(), name: 'Curd', unit: 'pouch', rate: 40 };
    S = blank();
    Object.assign(S.vendor, { name: 'Ramesh Dairy', phone: '', upi: 'rameshdairy@upi', lang: S.vendor.lang || 'en', type: 'milk', limit: 5000 });
    S.products = [fc, tn, pn, dh];
    const people = [
      ['301', 'Sharma ji', 'Tower B', fc, 1, 'daily'], ['302', 'Mehta family', 'Tower B', tn, 2, 'daily'], ['303', 'Iqbal bhai', 'Tower B', fc, 1, 'daily'],
      ['304', 'Rao madam', 'Tower B', tn, 1, 'alt'], ['305', 'Fernandes', 'Tower B', fc, 1, 'daily'], ['306', 'Gupta ji', 'Tower B', fc, 1, 'daily'],
      ['12', 'Verma ji', 'Gali 1', fc, 1.5, 'daily'], ['14', 'Khan sahab', 'Gali 1', tn, 1, 'days'], ['17', 'Pillai', 'Gali 1', fc, 0.5, 'daily'],
      ['21', 'Joshi ji', 'Gali 1', tn, 2, 'daily'], ['S-4', 'Chai stall', 'Market', fc, 5, 'daily'], ['S-9', 'Sweet shop', 'Market', fc, 10, 'daily']
    ];
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    people.forEach(([flat, name, sector, p, qty, type]) => {
      const id = uid();
      const c = { id, flat, name, sector, phone: '', items: [{ id, productId: p.id, qty, sched: { type, days: [1, 3, 5] }, rate: '' }], opening: rnd() < 0.3 ? 200 : 0, start, pauses: [] };
      S.customers.push(c);
    });
    // Sample addresses and pins around one neighbourhood, so the route map has something to show.
    Object.assign(S.vendor, { addr: 'Ramesh Dairy, Paud Road, Kothrud, Pune', geo: { lat: 18.5046, lng: 73.8075, q: 'gps' } });
    const AREA = { 'Tower B': [18.5081, 73.8122, 'Tower B, Mayur Colony, Kothrud'], 'Gali 1': [18.5019, 73.8128, 'Gali 1, Karve Nagar'], Market: [18.5060, 73.8031, 'Kothrud Market'] };
    S.customers.forEach((c, i) => {
      if (c.name === 'Pillai') return;
      const [lat, lng, where] = AREA[c.sector];
      const k = c.sector === 'Gali 1' ? (i - 6) * 0.0005 : (i % 6) * 0.00004;
      c.addr = (c.sector === 'Market' ? 'Shop ' : c.sector === 'Tower B' ? 'Flat ' : 'House ') + c.flat + ', ' + where;
      c.geo = { lat: +(lat + (c.sector === 'Gali 1' ? k * 0.3 : k)).toFixed(6), lng: +(lng + (c.sector === 'Gali 1' ? k : -k)).toFixed(6), q: 'gps' };
    });
    S.customers[1].items.push({ id: uid(), productId: pn.id, qty: 0.5, sched: { type: 'days', days: [0, 6] }, rate: '' });
    S.customers[1].items.push({ id: uid(), productId: dh.id, qty: 1, sched: { type: 'demand', days: [] }, rate: '' });
    S.customers[11].items.push({ id: uid(), productId: pn.id, qty: 2, sched: { type: 'daily', days: [] }, rate: '' });
    S.customers[5].pauses.push({ from: addDays(today, -1), to: addDays(today, 5) });
    S.customers[1].pauses.push({ from: addDays(today, -40), to: addDays(today, -35) });
    for (let d = start; d <= today; d = addDays(d, 1)) {
      S.customers.forEach((c) => {
        const r = rnd();
        if (r < 0.05) setMark(c.id, d, { s: 'skip' });
        else if (r < 0.08) setMark(c.id, d, { s: 'half' });
        else if (r < 0.13) setMark(c.id, d, { s: 'extra', x: 1 });
      });
    }
    S.customers.forEach((c) => {
      for (let m = 2; m >= 1; m--) {
        const ym = shiftMonth(monthOf(today), -m);
        if (rnd() < 0.8) {
          const amt = Math.round(monthBill(c, ym).amount * (rnd() < 0.7 ? 1 : 0.5) / 10) * 10;
          S.payments.push({ id: uid(), cid: c.id, date: shiftMonth(ym, 1) + '-0' + (2 + Math.floor(rnd() * 6)), amt, mode: rnd() < 0.5 ? 'cash' : 'upi' });
        }
      }
    });
    S.payments = S.payments.filter((p) => p.date <= today);
    save();
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'closesheet' && el.classList.contains('scrim') && e.target !== el) return;
    const id = el.dataset.id;
    const H = handlers[act];
    if (H) { e.preventDefault(); H(el, id); }
  });
  const onlyOn = (el) => el.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
  function markToast(c, it, day, prev) {
    const i = lineInfo(c, it, day);
    const p = prod(it.productId);
    const what = i.demand ? fq(i.qty) + ' ' + p.unit : t(LOOK[i.st].w) + (i.st === 'none' ? '' : ' · ' + fq(i.qty) + ' ' + p.unit);
    toast((c.flat ? c.flat + ' ' : '') + c.name + ': ' + what, () => { setMark(lkey(c, it), day, prev || null); save(); render(); });
  }
  // Redraws the edit form after a tap, keeping what was typed.
  function formTap(fn) { snapForm(); fn(ui.form); render(); }
  const formIdx = (el) => ui.form.items[+el.dataset.i];
  function daySheet(c, day) {
    ui.sheetDay = { cid: c.id, day };
    const opts = [['done', 'given'], ['half', 'half'], ['skip', 'skip'], ['extra', 'extra']];
    sheet(sheetHead(parse(day).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })) + '<div class="muted" style="font-weight:600">' + esc(c.name) + '</div>' +
      lines(c).map((it) => {
        const i = lineInfo(c, it, day); const p = prod(it.productId);
        const d = ' data-id="' + c.id + '" data-line="' + it.id + '"';
        const pick = i.demand
          ? '<div class="seg"><button type="button" data-act="setline" data-s="minus"' + d + '>−</button><button type="button" class="on">' + fq(i.qty) + ' ' + esc(p.unit) + '</button><button type="button" data-act="setline" data-s="plus"' + d + '>+</button></div>'
          : '<div class="seg">' + opts.map(([k, w]) => '<button type="button" class="' + (i.st === k ? 'on' : '') + '" data-act="setline" data-s="' + k + '"' + d + '>' + esc(t(w)) + '</button>').join('') + '</div>';
        return '<div class="card soft"><div class="row" style="margin-bottom:8px"><b class="grow">' + esc(lineText(it)) + '</b><span class="muted" style="font-weight:700">' + fq(i.qty) + ' ' + esc(p.unit) + '</span></div>' + pick + '</div>';
      }).join(''));
  }
  const handlers = {
    undo() { const u = toast.undo; $('#toast').hidden = true; if (u) u(); },
    lang() { S.vendor.lang = S.vendor.lang === 'hi' ? 'en' : 'hi'; save(); render(); },
    setlang(el) { S.vendor.lang = el.dataset.val; save(); render(); },
    pick(el) { onlyOn(el); },
    start() {
      const name = $('#w-name').value.trim();
      if (!name) { $('#w-name').focus(); return; }
      const type = ($('#w-type .on') || {}).dataset.val || 'milk';
      S.vendor.name = name; S.vendor.type = type;
      S.products = (PRESETS[type] || PRESETS.milk).products.map((p) => ({ id: uid(), ...p }));
      save(); location.hash = '#/home'; render();
    },
    sample() { const go = () => { loadSample(); location.hash = '#/home'; render(); }; if (S.customers.length) askThen(t('resetAsk'), go); else go(); },
    reset() { askThen(t('resetAsk'), () => { const lang = S.vendor.lang; S = blank(); S.vendor.lang = lang; save(); location.hash = '#/home'; render(); }); },
    yes() { const fn = ui.pending; ui.pending = null; closeSheet(); if (fn) fn(); },
    day(el) { ui.day = addDays(ui.day, +el.dataset.n); ui.edit = null; render(); },
    sector() {
      const sectors = [...new Set(sortRoute(active()).map((c) => c.sector || '').filter(Boolean))];
      const all = [''].concat(sectors);
      ui.sector = all[(all.indexOf(ui.sector) + 1) % all.length];
      render();
    },
    filter(el) { ui.filter = el.dataset.val; render(); },
    mark(el, id) {
      const c = cust(id); const it = lineOf(c, el.dataset.line); const key = lkey(c, it); const day = ui.day; const s = el.dataset.s;
      const prev = (S.marks[day] || {})[key];
      if (s === 'extra') {
        const step = stepOf(prod(it.productId).unit);
        setMark(key, day, { s: 'extra', x: prev && prev.s === 'extra' ? +prev.x + step : step });
        ui.edit = key;
      } else { setMark(key, day, { s }); ui.edit = null; }
      save(); render(); markToast(c, it, day, prev);
    },
    give(el, id) {
      const c = cust(id); const it = lineOf(c, el.dataset.line); const key = lkey(c, it); const day = ui.day; const prev = (S.marks[day] || {})[key];
      setMark(key, day, { s: 'extra', x: ((prev && +prev.x) || 0) + 1 });
      save(); render(); markToast(c, it, day, prev);
    },
    clear(el, id) {
      const c = cust(id); const it = lineOf(c, el.dataset.line); const key = lkey(c, it); const day = ui.day; const prev = (S.marks[day] || {})[key];
      setMark(key, day, null); save(); render(); markToast(c, it, day, prev);
    },
    change(el, id) { const key = lkey(cust(id), lineOf(cust(id), el.dataset.line)); ui.edit = ui.edit === key ? null : key; render(); },
    resume(el, id) {
      const c = cust(id); const day = ui.day;
      const before = JSON.parse(JSON.stringify(c.pauses || []));
      c.pauses = (c.pauses || []).map((p) => (p.from <= day && day <= p.to ? (p.from >= day ? null : { from: p.from, to: addDays(day, -1) }) : p)).filter(Boolean);
      save(); render();
      toast(c.name + ': ' + t('resumeToday'), () => { c.pauses = before; save(); render(); });
    },
    endrun() {
      const day = ui.day;
      const list = active().filter((c) => !ui.sector || c.sector === ui.sector).map((c) => ({ c, h: houseState(c, day) })).filter((x) => x.h.pending);
      if (!list.length) return;
      askThen(fill('endRunAsk', { n: list.length }), () => {
        const before = JSON.parse(JSON.stringify(S.marks[day] || {}));
        list.forEach(({ c, h }) => h.ls.forEach((x) => { if (x.i.pending) setMark(lkey(c, x.it), day, { s: 'done' }); }));
        save(); render();
        toast(t('allDone'), () => { S.marks[day] = before; if (!Object.keys(before).length) delete S.marks[day]; save(); render(); });
      });
    },
    cycleday(el) {
      const c = cust(ui.cid); const day = el.dataset.day;
      const cur = dayInfo(c, day);
      if (cur.st === 'away') { toast(fill('pausedUntil', { d: dshort(cur.till) })); return; }
      if (lines(c).length > 1) { daySheet(c, day); return; }
      const key = c.id; const prev = (S.marks[day] || {})[key];
      if (cur.demand) { const x = ((prev && prev.x) || 0) + 1; setMark(key, day, x > 9 ? null : { s: 'extra', x }); }
      else if (cur.st === 'none') setMark(key, day, prev ? null : { s: 'extra', x: 1 });
      else { const nx = NEXT[cur.st]; setMark(key, day, nx === 'extra' ? { s: 'extra', x: 1 } : { s: nx }); }
      save(); render();
      toast(dshort(day) + ': ' + t(LOOK[dayInfo(c, day).st].w), () => { setMark(key, day, prev || null); save(); render(); });
    },
    setline(el, id) {
      const c = cust(id); const it = lineOf(c, el.dataset.line); const key = lkey(c, it); const day = ui.sheetDay.day; const s = el.dataset.s;
      const prev = (S.marks[day] || {})[key];
      if (s === 'plus' || s === 'minus') { const x = ((prev && +prev.x) || 0) + (s === 'plus' ? 1 : -1); setMark(key, day, x > 0 ? { s: 'extra', x } : null); }
      else if (s === 'extra') setMark(key, day, { s: 'extra', x: prev && prev.s === 'extra' ? +prev.x + stepOf(prod(it.productId).unit) : stepOf(prod(it.productId).unit) });
      else setMark(key, day, { s });
      save(); render(); daySheet(c, day);
    },
    closed() {
      askThen(t('shopClosedAsk'), () => {
        const day = ui.day; const before = JSON.parse(JSON.stringify(S.marks[day] || {}));
        active().forEach((c) => lines(c).forEach((it) => { const st = lineInfo(c, it, day).st; if ((it.sched || {}).type !== 'demand' && st !== 'none' && st !== 'away') setMark(lkey(c, it), day, { s: 'skip' }); }));
        save(); render();
        toast(t('shopClosed'), () => { S.marks[day] = before; if (!Object.keys(before).length) delete S.marks[day]; save(); render(); });
      });
    },
    voice(el) { voice(el); },
    sched(el) { formTap(() => { formIdx(el).type = el.dataset.val; }); },
    wday(el) { formTap(() => { const a = formIdx(el).days; const d = +el.dataset.val; const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); else a.push(d); }); },
    fprod(el) { formTap(() => { const x = formIdx(el); x.pid = el.dataset.val; const st = stepOf(prod(x.pid).unit); x.qty = Math.max(st, Math.round(x.qty / st) * st); }); },
    qty(el) { formTap(() => { const x = formIdx(el); const st = stepOf(prod(x.pid).unit); x.qty = Math.max(st, Math.round((x.qty + st * +el.dataset.n) / st) * st); }); },
    qtyset(el) { formTap(() => { formIdx(el).qty = +el.dataset.val; }); },
    additem() {
      formTap((F) => {
        const used = F.items.map((x) => x.pid);
        const p = S.products.find((x) => !used.includes(x.id)) || S.products[0] || {};
        F.items.push(formItem({ productId: p.id, qty: 1, sched: { type: 'daily', days: [1, 3, 5] } }));
      });
    },
    delitem(el) { formTap((F) => { F.items.splice(+el.dataset.i, 1); }); },
    savecust(el) {
      snapForm();
      const F = ui.form, f = F.f;
      const name = (f.name || '').trim();
      if (!name) { $('#f-name').focus(); return; }
      let c = el.dataset.id ? cust(el.dataset.id) : null;
      if (!c) { c = { id: uid(), start: f.start || todayStr(), pauses: [] }; S.customers.push(c); }
      Object.assign(c, {
        name, flat: (f.flat || '').trim(), sector: (f.sector || '').trim(), phone: (f.phone || '').trim(), addr: (f.addr || '').trim(),
        // A GPS pin stays; map coordinates found for an old address are dropped when the address changes.
        geo: f.geo && (f.geo.q === 'gps' || f.geo.q === (f.addr || '').trim()) ? f.geo : null, opening: f.opening === '' || f.opening == null ? '' : +f.opening,
        items: F.items.map((x, n) => ({ id: x.id || (n === 0 && !c.items ? c.id : uid()), productId: x.pid, qty: x.qty, sched: { type: x.type, days: x.days.slice().sort() }, rate: x.rate === '' || x.rate == null ? '' : +x.rate }))
      });
      ui.form = null;
      save(); location.hash = '#/c/' + c.id; toast(t('saved'));
    },
    delcust(el, id) {
      askThen(t('deleteAsk'), () => {
        S.customers = S.customers.filter((c) => c.id !== id);
        S.payments = S.payments.filter((p) => p.cid !== id);
        Object.keys(S.marks).forEach((d) => { Object.keys(S.marks[d]).forEach((k) => { if (k === id || k.startsWith(id + '.')) delete S.marks[d][k]; }); if (!Object.keys(S.marks[d]).length) delete S.marks[d]; });
        save(); location.hash = '#/customers';
      });
    },
    pay(el, id) { paySheet(id); },
    paypick() { payPickSheet(); },
    duesheet() { dueSheet(); },
    bmonth(el) { ui.bym = shiftMonth(ui.bym || monthOf(todayStr()), +el.dataset.n); render(); },
    ratesheet(el, id) { rateSheet(id); },
    saverate(el, id) {
      const p = S.products.find((x) => x.id === id);
      p.name = $('#r-name').value.trim() || p.name; p.unit = $('#r-unit').value.trim() || p.unit; p.rate = +$('#r-rate').value || 0;
      save(); closeSheet(); render(); toast(t('saved'));
    },
    paymode(el) { ui.pay.mode = el.dataset.val; onlyOn(el); },
    key(el) {
      const k = el.dataset.val; let a = ui.pay.amt;
      if (k === 'del') a = a.slice(0, -1); else if (k === 'full') a = String(ui.pay.due); else if (a.length < 7) a = (a + k).replace(/^0+/, '');
      ui.pay.amt = a; $('#amt').textContent = '₹' + (+a || 0).toLocaleString('en-IN');
    },
    savepay() {
      const amt = +ui.pay.amt;
      if (!amt) return;
      const p = { id: uid(), cid: ui.pay.cid, date: todayStr(), amt, mode: ui.pay.mode };
      S.payments.push(p); save(); closeSheet(); render();
      toast(t('received') + ' ' + rupees(amt), () => { S.payments = S.payments.filter((x) => x.id !== p.id); save(); render(); });
    },
    closesheet() { closeSheet(); },
    pausesheet(el, id) { pauseSheet(id); },
    savepause(el, id) {
      const from = $('#p-from').value, to = $('#p-to').value;
      if (!from || !to || to < from) return;
      const c = cust(id); c.pauses = c.pauses || []; c.pauses.push({ from, to });
      save(); closeSheet(); render(); toast(t('pause') + ': ' + dshort(from) + ' – ' + dshort(to));
    },
    delpause(el, id) { const c = cust(id); c.pauses = c.pauses.filter((p) => p.from !== el.dataset.from); save(); closeSheet(); render(); },
    copylink(el, id) {
      const link = publicLink(cust(id), ui.month || monthOf(todayStr()));
      if (navigator.share) navigator.share({ title: S.vendor.name, url: link }).catch(() => linkSheet(link));
      else linkSheet(link);
    },
    stockday(el) { ui.stockDay = el.dataset.val; render(); },
    speakstock() {
      if (!window.speechSynthesis) { toast(t('noVoice')); return; }
      const day = ui.stockDay === 'tomorrow' ? addDays(todayStr(), 1) : todayStr();
      const s = stockFor(day);
      const words = s.items.map((x) => x.p.name + ', ' + fq(x.qty) + ' ' + (x.p.unit === 'L' ? (S.vendor.lang === 'hi' ? 'लीटर' : 'litres') : x.p.unit)).join('. ');
      const u = new SpeechSynthesisUtterance((S.vendor.lang === 'hi' ? 'आज का स्टॉक. ' : 'Stock. ') + words);
      u.lang = locale(); speechSynthesis.cancel(); speechSynthesis.speak(u);
    },
    copytext() {
      const box = $('#linkbox'); box.select();
      if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(() => toast(t('copied')), () => {});
    },
    addprod() { const p = { id: uid(), name: 'Item', unit: 'unit', rate: 10 }; S.products.push(p); save(); render(); rateSheet(p.id); },
    gpsstart() { getGps((g) => { S.vendor.geo = g; save(); $('#s-geo') ? ($('#s-geo').innerHTML = startPin()) : render(); }); },
    unpinstart() { S.vendor.geo = null; save(); $('#s-geo').innerHTML = startPin(); },
    gpscust() { getGps((g) => { if (ui.form) formTap((F) => { F.f.geo = g; }); }); },
    unpincust() { formTap((F) => { F.f.geo = null; }); },
    move(el, id) {
      const list = sortRoute(active());
      const i = list.findIndex((c) => c.id === id), j = i + +el.dataset.n;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setOrder(list); save(); render();
    },
    async bestorder() {
      ui.busy = true; render();
      const out = await optimise(sortRoute(active())).catch(() => null);
      ui.busy = false;
      if (!out) { render(); toast(t('needPins')); return; }
      setOrder(out); save(); render(); toast(t('orderSaved'));
    },
    areaorder() {
      const list = active();
      list.forEach((c) => { delete c.order; });
      save(); render(); toast(t('orderSaved'));
    },
    savesettings() {
      const v = S.vendor;
      v.name = $('#s-name').value.trim() || v.name; v.phone = $('#s-phone').value.trim(); v.upi = $('#s-upi').value.trim(); v.limit = +$('#s-limit').value || 0;
      v.addr = $('#s-addr').value.trim();
      if (v.geo && v.geo.q !== 'gps' && v.geo.q !== v.addr) v.geo = null;
      document.querySelectorAll('[data-prod]').forEach((inp) => { const p = S.products.find((x) => x.id === inp.dataset.prod); if (p) p[inp.dataset.k] = inp.dataset.k === 'rate' ? +inp.value || 0 : inp.value.trim(); });
      save(); toast(t('saved')); location.hash = '#/home';
    },
    backup() {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'localwaala-backup-' + todayStr() + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search') { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); }
    if (e.target.dataset && e.target.dataset.rate != null && ui.form) { ui.form.items[+e.target.dataset.rate].rate = e.target.value; $('#f-est').textContent = estimate(ui.form.items); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'restore' || !e.target.files[0]) return;
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.vendor || !Array.isArray(d.customers)) throw 0; S = d; S.customers.forEach(lines); save(); location.hash = '#/home'; render(); toast(t('saved')); } catch (err) { toast('Wrong file'); } };
    r.readAsText(e.target.files[0]);
  });
  window.addEventListener('online', () => render());
  window.addEventListener('offline', () => render());

  // ---------- accounts & sync ----------
  // When a LocalWaala server answers api/config, vendors sign in (Firebase) and each khata syncs to that server.
  // Without a server (GitHub Pages, the preview) the app keeps working on this phone only, as before.
  var acct = null; // { uid, email, phone, name } of the signed-in vendor
  const auth = { mode: 'local', ready: false, loading: false, dev: false, fb: null, cfg: null };
  let meta = { version: 0, dirty: false };
  const sync = { state: 'idle', timer: null };
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full: the khata save reports it */ } };
  const metaKey = () => 'localwaallah.m.' + acct.uid;

  function useAccount(u) {
    const lang = S.vendor.lang;
    acct = u;
    lsSet('lw.account', u);
    KEY = 'localwaallah.u.' + u.uid;
    S = lsGet(KEY) || blank();
    if (!S.vendor.name) S.vendor.lang = lang;
    S.customers.forEach(lines);
    meta = lsGet(metaKey()) || { version: 0, dirty: false };
  }
  function afterSave() {
    if (!acct) return;
    meta.dirty = true; lsSet(metaKey(), meta);
    clearTimeout(sync.timer); sync.timer = setTimeout(push, 1500);
  }
  async function idToken() {
    if (auth.dev) return 'dev:' + acct.uid.replace(/^dev-/, '');
    const u = auth.fb && auth.fb.auth().currentUser;
    if (!u) throw new Error('signed out');
    return u.getIdToken();
  }
  async function api(method, body) {
    const res = await fetch('api/ledger', { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await idToken() }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  // Two phones changed the same khata: keep everything from both, and this phone's copy where both changed one thing.
  function merge(remote, local) {
    if (!remote) return local;
    const byId = (a, b) => { const m = new Map(); (a || []).forEach((x) => m.set(x.id, x)); (b || []).forEach((x) => m.set(x.id, x)); return [...m.values()]; };
    const marks = JSON.parse(JSON.stringify(remote.marks || {}));
    Object.keys(local.marks || {}).forEach((d) => { marks[d] = Object.assign(marks[d] || {}, local.marks[d]); });
    return { vendor: Object.assign({}, remote.vendor, local.vendor), products: byId(remote.products, local.products), customers: byId(remote.customers, local.customers), marks, payments: byId(remote.payments, local.payments) };
  }
  function setSync(st) {
    sync.state = st;
    document.querySelectorAll('.live').forEach((el) => { el.outerHTML = live(); });
  }
  async function push(retried) {
    if (!acct || !navigator.onLine || !meta.dirty || sync.state === 'busy') return;
    setSync('busy');
    try {
      const r = await api('PUT', { data: S, baseVersion: meta.version });
      if (r.status === 409 && !retried) {
        S = merge(r.data.data, S); S.customers.forEach(lines);
        meta.version = r.data.version || 0; localSave(); lsSet(metaKey(), meta);
        setSync('idle'); render();
        return push(true);
      }
      if (r.status !== 200) throw new Error('sync ' + r.status);
      meta = { version: r.data.version, dirty: false }; lsSet(metaKey(), meta);
      setSync('idle');
    } catch (e) { setSync('error'); }
  }
  async function pull() {
    if (!acct || !navigator.onLine) return;
    setSync('busy');
    try {
      const r = await api('GET');
      if (r.status !== 200) throw new Error('sync ' + r.status);
      const remote = r.data;
      if (!remote.version) {
        // First sign-in: bring along a khata this phone kept before accounts existed.
        const legacy = lsGet(LEGACY_KEY);
        if (!S.vendor.name && legacy && legacy.vendor && legacy.vendor.name) {
          S = legacy; S.customers.forEach(lines);
          localStorage.removeItem(LEGACY_KEY);
        }
        meta.version = 0;
        if (S.vendor.name) meta.dirty = true;
      } else if (remote.version !== meta.version) {
        S = meta.dirty ? merge(remote.data, S) : remote.data;
        S.customers.forEach(lines);
        meta.version = remote.version;
      }
      localSave(); lsSet(metaKey(), meta);
      setSync('idle'); render();
      if (meta.dirty) push();
    } catch (e) { setSync('error'); }
  }
  async function signedIn(u) {
    const fresh = !acct || acct.uid !== u.uid;
    if (fresh) useAccount(u); else { acct = Object.assign(acct, u); lsSet('lw.account', acct); }
    ui.login = null;
    if (fresh && !S.vendor.name && navigator.onLine) { auth.loading = true; render(); await pull(); auth.loading = false; render(); }
    else { render(); pull(); }
  }
  function signedOut() {
    const lang = S.vendor.lang;
    acct = null; localStorage.removeItem('lw.account');
    KEY = LEGACY_KEY; S = blank(); S.vendor.lang = lang;
    location.hash = '#/home'; render();
  }
  function loadScript(src) {
    return new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
  }
  async function boot() {
    let cfg = null;
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 5000);
      const r = await fetch('api/config', { signal: ctl.signal, cache: 'no-store' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) cfg = await r.json();
    } catch (e) { /* no server or no signal */ }
    if (cfg && (cfg.firebase || cfg.devLogin)) lsSet('lw.cfg', cfg); else cfg = navigator.onLine ? null : lsGet('lw.cfg');
    const cached = lsGet('lw.account');
    if (!cfg) { auth.ready = true; render(); return; }
    auth.mode = 'server'; auth.cfg = cfg; auth.dev = !cfg.firebase && !!cfg.devLogin;
    if (cached) { useAccount(cached); auth.ready = true; render(); }
    if (auth.dev) { auth.ready = true; render(); if (cached) pull(); return; }
    try {
      const v = 'https://www.gstatic.com/firebasejs/10.14.1/';
      if (!window.firebase) {
        await loadScript(v + 'firebase-app-compat.js');
        await loadScript(v + 'firebase-auth-compat.js');
      }
      auth.fb = window.firebase;
      auth.fb.initializeApp(cfg.firebase);
    } catch (e) {
      auth.ready = true; render();
      if (!cached) toast(t('needNet'));
      return;
    }
    const fa = auth.fb.auth();
    fa.languageCode = S.vendor.lang === 'hi' ? 'hi' : 'en';
    fa.getRedirectResult().catch((e) => toast(authError(e)));
    fa.onAuthStateChanged((u) => {
      auth.ready = true;
      if (u) signedIn({ uid: u.uid, email: u.email || '', phone: u.phoneNumber || '', name: u.displayName || '' });
      else if (navigator.onLine || !cached) { if (acct) signedOut(); else render(); }
      else render();
    });
  }
  function authError(e) {
    const c = (e && e.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return t('badLogin');
    if (/email-already-in-use/.test(c)) return t('emailUsed');
    if (/weak-password/.test(c)) return t('weakPw');
    if (/too-many-requests|quota-exceeded/.test(c)) return t('tooMany');
    if (/network-request-failed/.test(c)) return t('needNet');
    if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return '';
    return (e && e.message) || 'Error';
  }
  const failed = (e) => { ui.busy = false; render(); const m = authError(e); if (m) toast(m); };
  const fbAuth = () => auth.fb.auth();
  const standalone = () => window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

  const viewSplash = () => '<div class="splash">' + brand() + '<span class="muted">' + esc(t('loading')) + '</span></div>';
  const GOOGLE = '<svg class="i" viewBox="0 0 48 48" aria-hidden="true" style="stroke:none"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  function viewLogin() {
    const L = ui.login || (ui.login = { email: '', signup: false });
    const dis = ui.busy ? ' disabled' : '';
    let box;
    if (auth.dev) {
      box = '<div class="field"><label for="l-dev">' + esc(t('devLogin')) + '</label><div class="inp">' + ic('user', 'sm') + '<input id="l-dev" placeholder="ramesh" autocomplete="off"></div></div>' +
        '<div class="stack"><button class="btn big block" data-act="devlogin">' + ic('check') + esc(t('signInBtn')) + '</button></div>';
    } else {
      box = '<div class="field"><label for="l-email">' + esc(t('email')) + '</label><div class="inp">' + ic('mail', 'sm') + '<input id="l-email" type="email" autocomplete="email" value="' + esc(L.email) + '"></div></div>' +
        '<div class="field"><label for="l-pass">' + esc(t('password')) + '</label><div class="inp">' + ic('lock', 'sm') + '<input id="l-pass" type="password" autocomplete="' + (L.signup ? 'new-password' : 'current-password') + '"></div></div>' +
        '<div class="stack"><button class="btn big block" data-act="emailgo"' + dis + '>' + ic('check') + esc(L.signup ? t('createAcct') : t('signInBtn')) + '</button>' +
        '<button class="linkbtn" data-act="signupflip">' + esc(L.signup ? t('haveAcct') : t('newHere')) + '</button>' +
        (L.signup ? '' : '<button class="linkbtn" data-act="resetpw">' + esc(t('forgot')) + '</button>') + '</div>';
    }
    return '<div class="welcome"><header class="apphead bare">' + langBtn() + '</header>' + brand(t('welcome'), t('tagline')) +
      '<div class="card"><h2 style="font-size:20px">' + esc(t('signIn')) + '</h2><div class="muted" style="font-size:14px;font-weight:600;margin-bottom:14px">' + esc(other('signIn')) + '</div>' +
      (auth.dev ? '' : '<button class="btn white block gbtn" data-act="google"' + dis + '>' + GOOGLE + esc(t('google')) + '</button><div class="or"><span>' + esc(t('or')) + '</span></div>') +
      box + '</div><p class="muted" style="text-align:center;font-size:13px;font-weight:600;margin:16px 8px">' + esc(t('loginNote')) + '</p></div>';
  }
  const snapLogin = () => {
    const L = ui.login; if (!L) return;
    if ($('#l-email')) L.email = $('#l-email').value.trim();
  };
  const authHandlers = {
    signupflip() { snapLogin(); ui.login.signup = !ui.login.signup; render(); },
    google() {
      const fb = auth.fb; const p = new fb.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      (standalone() ? fbAuth().signInWithRedirect(p) : fbAuth().signInWithPopup(p)).catch(failed);
    },
    emailgo() {
      snapLogin();
      const L = ui.login; const pw = $('#l-pass').value;
      if (!L.email || !pw) { toast(t('badLogin')); return; }
      ui.busy = true; render();
      (L.signup ? fbAuth().createUserWithEmailAndPassword(L.email, pw) : fbAuth().signInWithEmailAndPassword(L.email, pw))
        .then(() => { ui.busy = false; }).catch(failed);
    },
    resetpw() {
      snapLogin();
      if (!ui.login.email) { toast(t('email') + '?'); $('#l-email').focus(); return; }
      fbAuth().sendPasswordResetEmail(ui.login.email).then(() => toast(t('resetSent')), failed);
    },
    devlogin() {
      const n = $('#l-dev').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!n) { $('#l-dev').focus(); return; }
      auth.ready = true; signedIn({ uid: 'dev-' + n, email: '', phone: '', name: n });
    },
    logout() {
      askThen(t('logoutAsk'), async () => {
        if (meta.dirty) await push();
        if (auth.fb) await fbAuth().signOut().catch(() => {});
        signedOut();
      });
    }
  };

  Object.assign(handlers, authHandlers);

  // ---------- router ----------
  const isRoute = (r) => r === '' || r === 'home' || r === 'today';
  function tabBar(cur) {
    const tabs = [['home', 'truck', 'tabRoute'], ['customers', 'users', 'tabCustomers'], ['edit/new', 'plus', 'tabAdd'], ['money', 'receipt', 'tabBilling'], ['stock', 'can', 'tabStock']];
    return '<nav class="tabbar" aria-label="Main"><div class="in">' + tabs.map(([r, icon, lab]) => {
      const on = r === cur;
      return '<a class="tab' + (on ? ' on' : '') + (r === 'edit/new' ? ' fab' : '') + '" href="#/' + r + '"' + (on ? ' aria-current="page"' : '') + '><span class="pip">' + ic(icon) + '</span>' + esc(t(lab)) + '</a>';
    }).join('') + '</div></nav>';
  }
  function render() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, a, b] = h.split('/');
    document.documentElement.lang = S.vendor.lang === 'hi' ? 'hi' : 'en';
    let html;
    const r = route || '';
    if (r === 's') html = viewPublic(a || '');
    else if (!auth.ready || auth.loading) html = viewSplash();
    else if (auth.mode === 'server' && !acct) html = viewLogin();
    else if (!S.vendor.name) html = viewWelcome();
    else if (isRoute(r)) html = viewRoute();
    else if (r === 'customers') html = viewCustomers();
    else if (r === 'edit') html = viewEdit(a);
    else if (r === 'c') { ui.cid = a; html = viewCustomer(a, b); }
    else if (r === 'money') html = viewBilling();
    else if (r === 'stock') html = viewStock();
    else if (r === 'settings') html = viewSettings();
    else if (r === 'order') html = viewOrder();
    else html = viewRoute();
    const tabbed = r !== 's' && auth.ready && !auth.loading && (auth.mode === 'local' || !!acct) && !!S.vendor.name && (isRoute(r) || ['customers', 'money', 'stock'].includes(r) || (r === 'edit' && a === 'new'));
    const cur = isRoute(r) ? 'home' : r === 'edit' ? 'edit/new' : r;
    document.body.classList.toggle('has-nav', tabbed);
    document.body.classList.toggle('has-run', tabbed && isRoute(r) && active().length > 0);
    $('#app').innerHTML = html + (tabbed ? tabBar(cur) : '');
    afterRender();
  }
  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    const r = location.hash.split('/')[1] || '';
    if (isRoute(r) && !isRoute(lastRoute)) { ui.day = todayStr(); ui.edit = null; }
    lastRoute = r; ui.form = null; closeSheet(); $('#toast').hidden = true; render(); window.scrollTo(0, 0);
  });
  lastRoute = location.hash.split('/')[1] || '';
  render();
  boot();
  window.addEventListener('online', () => { if (acct) pull(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.LW = { get state() { return S; }, get account() { return acct; }, get sync() { return { state: sync.state, version: meta.version, dirty: meta.dirty }; }, dayInfo, balance, monthBill, publicLink, applyVoice, merge };
})();
