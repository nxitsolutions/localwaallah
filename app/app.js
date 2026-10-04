/* LocalWaallah v1: offline-first delivery ledger. Everything is stored on the phone (localStorage). */
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
  const KEY = 'localwaallah.v1';
  const blank = () => ({
    vendor: { name: '', phone: '', upi: '', lang: 'en', limit: 1000, type: 'milk' },
    products: [], customers: [], marks: {}, payments: []
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch (e) { S = blank(); }
  let saveOk = true;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); saveOk = true; } catch (e) { saveOk = false; toast('Phone storage is full. Save a backup file.'); }
  }

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
    close: '<path d="M6 6l12 12M18 6 6 18"/>', link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'
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
  const rateOf = (c) => (c.rate != null && c.rate !== '' ? +c.rate : +prod(c.productId).rate || 0);
  const pauseOn = (c, day) => (c.pauses || []).find((p) => p.from <= day && day <= p.to);
  function isScheduled(c, day) {
    const s = c.sched || { type: 'daily' };
    if (s.type === 'daily') return true;
    if (s.type === 'alt') return ((diffDays(c.start || day, day) % 2) + 2) % 2 === 0;
    if (s.type === 'days') return (s.days || []).includes(parse(day).getDay());
    return false;
  }
  // st: done | half | skip | extra | away | none ; qty in product units
  function dayInfo(c, day) {
    if (c.start && day < c.start) return { st: 'none', qty: 0 };
    const p = pauseOn(c, day);
    if (p) return { st: 'away', qty: 0, till: p.to };
    const m = (S.marks[day] || {})[c.id];
    if ((c.sched || {}).type === 'demand') {
      return m && m.x > 0 ? { st: 'done', qty: +m.x, demand: true } : { st: 'none', qty: 0, demand: true };
    }
    if (!isScheduled(c, day)) return m && m.s === 'extra' ? { st: 'extra', qty: +(m.x || 1) } : { st: 'none', qty: 0 };
    const st = (m && m.s) || 'done';
    const q = +c.qty || 0;
    const qty = st === 'done' ? q : st === 'half' ? q / 2 : st === 'skip' ? 0 : q + +(m.x || 1);
    return { st, qty };
  }
  function setMark(cid, day, mark) {
    S.marks[day] = S.marks[day] || {};
    if (mark) S.marks[day][cid] = mark; else delete S.marks[day][cid];
    if (!Object.keys(S.marks[day]).length) delete S.marks[day];
  }
  function usedBetween(c, from, to) {
    let qty = 0;
    if (from > to) return 0;
    for (let d = from; d <= to; d = addDays(d, 1)) qty += dayInfo(c, d).qty;
    return qty;
  }
  const paidBetween = (c, from, to) => S.payments.filter((p) => p.cid === c.id && p.date >= from && p.date <= to).reduce((a, p) => a + +p.amt, 0);
  function balance(c, upTo) {
    const from = c.start || upTo;
    return (+c.opening || 0) + usedBetween(c, from, upTo) * rateOf(c) - S.payments.filter((p) => p.cid === c.id && p.date <= upTo).reduce((a, p) => a + +p.amt, 0);
  }
  function monthBill(c, ym) {
    const first = monthStart(ym), today = todayStr();
    const last = monthEnd(ym) < today ? monthEnd(ym) : today;
    const old = balance(c, addDays(first, -1));
    const qty = usedBetween(c, first < (c.start || first) ? c.start : first, last);
    const amount = qty * rateOf(c);
    const paid = paidBetween(c, first, monthEnd(ym));
    return { old, qty, amount, paid, due: old + amount - paid };
  }
  const active = () => S.customers.filter((c) => !c.deleted);
  function sortRoute(list) {
    return list.slice().sort((a, b) => (a.sector || '').localeCompare(b.sector || '') || (a.flat || '').localeCompare(b.flat || '', undefined, { numeric: true }) || a.name.localeCompare(b.name));
  }

  // ---------- UI state ----------
  const ui = { day: todayStr(), sector: '', q: '', stockDay: 'today' };
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
  const brandHtml = () => '<span class="brand"><span class="mark">' + ic('can') + '</span><span>Local<em>Waallah</em></span></span>';
  const langBtn = () => '<button class="iconbtn" data-act="lang" aria-label="Change language">' + (S.vendor.lang === 'hi' ? 'A' : 'अ') + '</button>';
  const syncPill = () => navigator.onLine && saveOk
    ? '<span class="pill" role="img" aria-label="' + esc(t('saved')) + '" style="color:var(--given)">' + ic('cloud', 'sm') + '</span>'
    : '<span class="pill off" role="img" aria-label="' + esc(t('offline')) + '">' + ic('nosig', 'sm') + '</span>';
  const heroImg = 'milkman.webp';
  function dayLabel(day) {
    const d = parse(day);
    const s = d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    if (day === todayStr()) return t('today') + ' · ' + s;
    if (day === addDays(todayStr(), 1)) return t('tomorrow') + ' · ' + s;
    return s;
  }
  const monthLabel = (ym) => parse(monthStart(ym)).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  function qtyText(c) {
    const p = prod(c.productId);
    if ((c.sched || {}).type === 'demand') return p.name + ' · ' + t('onCall');
    return fq(c.qty) + ' ' + p.unit + ' ' + p.name;
  }
  function todayCounts(day) {
    const n = { done: 0, half: 0, skip: 0, extra: 0, away: 0, none: 0, houses: 0 };
    active().forEach((c) => { const i = dayInfo(c, day); n[i.st]++; if (i.st !== 'none' && i.st !== 'away') n.houses++; });
    return n;
  }

  // ---------- views ----------
  function viewWelcome() {
    const types = ['milk', 'paper', 'water', 'laundry', 'other'];
    return '<div class="topbar">' + brandHtml() + langBtn() + '</div>' +
      '<div class="hero"><div class="sun"></div><img src="' + heroImg + '" alt=""><div class="hello"><span class="hi">' + esc(t('welcome')) + '</span><b style="font-size:24px">LocalWaallah</b></div></div>' +
      '<div class="form">' +
      '<div class="field"><label for="w-name">' + esc(t('vendorName')) + '</label><input id="w-name" autocomplete="organization" placeholder="Ramesh Dairy"></div>' +
      '<div class="field"><span class="lab">' + esc(t('whatSell')) + '</span><div class="opts" id="w-type">' +
      types.map((k, i) => '<button type="button" class="opt' + (i === 0 ? ' on' : '') + '" data-act="pick" data-group="w-type" data-val="' + k + '">' + esc(t(k)) + '</button>').join('') +
      '</div></div>' +
      '<div class="btnrow"><button class="bigbtn" data-act="start">' + esc(t('start')) + '</button></div>' +
      '<div class="btnrow"><button class="bigbtn line" data-act="sample">' + esc(t('sample')) + '</button></div>' +
      '</div>';
  }

  function viewHome() {
    const day = todayStr();
    const n = todayCounts(day);
    const total = n.done + n.half + n.skip + n.extra + n.away || 1;
    const seg = (k, color) => n[k] ? '<span style="width:' + (100 * n[k] / total) + '%;background:' + color + '"></span>' : '';
    let due = 0, dueN = 0;
    active().forEach((c) => { const b = balance(c, day); if (b > 0.5) { due += b; dueN++; } });
    const name = S.vendor.name.split(' ')[0] || S.vendor.name;
    return '<div class="topbar">' + brandHtml() + '<div class="row">' + syncPill() + langBtn() +
      '<a class="iconbtn" href="#/settings" aria-label="' + esc(t('settings')) + '">' + ic('gear', 'sm') + '</a></div></div>' +
      '<div class="hero"><svg class="squiggle" width="150" height="70" viewBox="0 0 150 70" fill="none" aria-hidden="true"><path d="M2 40c30-26 52-30 58-12 6 16-14 22-16 8-2-16 30-24 52-6 12 10 30 12 50 0" stroke="#14213D" stroke-width="2" stroke-dasharray="5 6" stroke-linecap="round"/></svg>' +
      '<div class="sun"></div><img src="' + heroImg + '" alt="">' +
      '<div class="hello"><span class="hi">' + esc(t('namaste')) + '</span><b>' + esc(name) + '</b><span class="date">' + esc(parse(day).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })) + '</span></div>' +
      '<div class="prog"><span class="num">' + n.houses + '</span><span class="lab">' + esc(t('houses')) + ' · ' + esc(t('today')) + '</span>' +
      '<div class="bar">' + seg('done', 'var(--given)') + seg('extra', 'var(--extra)') + seg('half', 'var(--half)') + seg('skip', 'var(--skip)') + seg('away', 'var(--away)') + '</div></div></div>' +
      '<svg class="flow" viewBox="0 0 390 44" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M292 0 C292 22 112 14 112 40" stroke="#1D4E9E" stroke-width="2.5" stroke-dasharray="6 6" stroke-linecap="round"/><path d="M292 0 C292 18 290 26 290 40" stroke="#1D4E9E" stroke-width="2.5" stroke-dasharray="6 6" stroke-linecap="round"/><circle cx="292" cy="3" r="5" fill="#1D4E9E"/><circle cx="112" cy="40" r="4" fill="#1D4E9E"/><circle cx="290" cy="40" r="4" fill="#1D4E9E"/></svg>' +
      '<div class="tiles">' +
      '<a class="tile main" href="#/today"><span class="ic">' + ic('list', 'lg') + '</span><span class="badge">' + n.houses + '</span><span><b>Deliver today</b><small>आज की डिलीवरी</small></span></a>' +
      '<a class="tile t-amber" href="#/stock"><span class="ic">' + ic('can', 'lg') + '</span><span><b>Morning stock</b><small>सुबह का स्टॉक</small></span></a>' +
      '<a class="tile t-violet" href="#/customers"><span class="ic">' + ic('users', 'lg') + '</span><span><b>Customers</b><small>ग्राहक · ' + active().length + '</small></span></a>' +
      '<a class="tile t-green" href="#/money"><span class="ic">' + ic('rupee', 'lg') + '</span><span><b>Collect money</b><small>पैसे लें</small></span></a>' +
      '</div>' +
      '<div class="duebar"><a class="duecard' + (dueN ? '' : ' ok') + '" href="#/money"><span class="dot" style="background:var(--' + (dueN ? 'skip' : 'given') + ')">' + ic(dueN ? 'alert' : 'check') + '</span>' +
      '<span class="col"><span class="head" style="font-size:21px;font-weight:800">' + (dueN ? rupees(due) + ' ' + esc(t('due')) : esc(t('nobodyOwes'))) + '</span>' +
      (dueN ? '<span class="muted" style="font-size:14px;font-weight:600">' + dueN + ' ' + esc(t('dueHouses')) + '</span>' : '') + '</span><span class="chev">' + ic('next') + '</span></a>' + micBtn('mic') + '</div>';
  }
  const fabs = (inner) => '<div class="fabs"><div class="in">' + inner + '</div></div>';
  function tabBar(cur) {
    const tabs = [['home', 'home', 'tabHome'], ['today', 'list', 'tabDeliver'], ['customers', 'users', 'tabCustomers'], ['money', 'rupee', 'tabMoney'], ['stock', 'can', 'tabStock']];
    return '<nav class="tabbar" aria-label="Main"><div class="in">' + tabs.map(([r, icon, lab]) =>
      '<a class="tab' + (r === cur ? ' on' : '') + '" href="#/' + r + '"' + (r === cur ? ' aria-current="page"' : '') + '><span class="pip">' + ic(icon) + '</span>' + esc(t(lab)) + '</a>').join('') + '</div></nav>';
  }
  const micBtn = (cls) => '<button class="' + cls + '" data-act="voice" aria-label="Speak a change">' + ic('mic') + '<span>' + esc(t('speak')) + '</span></button>';

  function viewToday() {
    const day = ui.day;
    const all = sortRoute(active());
    const sectors = [...new Set(all.map((c) => c.sector || '').filter(Boolean))];
    if (ui.sector && !sectors.includes(ui.sector)) ui.sector = '';
    const shown = all.filter((c) => (!ui.sector || c.sector === ui.sector) && dayInfo(c, day).st !== 'none' || ((c.sched || {}).type === 'demand' && (!ui.sector || c.sector === ui.sector)));
    const n = todayCounts(day);
    let html = '<div class="phead"><div class="row">' +
      '<div class="col grow"><h1>' + esc(t('todayDelivery')) + '</h1><span class="sub">' + esc(dayLabel(day)) + '</span></div>' +
      '<div class="col"><span class="big">' + n.houses + '</span><span class="sub" style="font-size:13px;text-align:right">' + esc(t('houses')) + '</span></div></div>' +
      '<div class="row" style="gap:8px"><button class="iconbtn ghost" data-act="day" data-n="-1" aria-label="Previous day">' + ic('back') + '</button>' +
      '<div class="note grow">' + (navigator.onLine ? ic('cloud', 'sm') + esc(t('saved')) : ic('nosig', 'sm') + esc(t('offline'))) + '</div>' +
      '<button class="iconbtn ghost" data-act="day" data-n="1" aria-label="Next day">' + ic('next') + '</button></div></div>';
    if (sectors.length > 1) {
      html += '<div class="chips"><button class="chip' + (ui.sector ? '' : ' on') + '" data-act="sector" data-val="">' + esc(t('all')) + ' · ' + all.length + '</button>' +
        sectors.map((s) => '<button class="chip' + (ui.sector === s ? ' on' : '') + '" data-act="sector" data-val="' + esc(s) + '">' + esc(s) + ' · ' + all.filter((c) => c.sector === s).length + '</button>').join('') + '</div>';
    }
    html += '<div class="legend"><span>' + esc(t('tap')) + '</span><span class="g">✓ ' + esc(t('given')) + '</span>›<span class="h">½ ' + esc(t('half')) + '</span>›<span class="s">✕ ' + esc(t('skip')) + '</span>›<span class="e">+ ' + esc(t('extra')) + '</span></div>';
    if (!active().length) {
      html += '<div class="empty">' + esc(t('noCustomers')) + '<div class="btnrow"><a class="bigbtn" href="#/edit/new">' + ic('plus') + esc(t('addFirst')) + '</a></div></div>';
    }
    let lastSector = null;
    html += '<div class="list">';
    shown.forEach((c) => {
      if ((c.sector || '') !== lastSector) {
        lastSector = c.sector || '';
        html += '</div><div class="section">' + ic('building', 'sm') + esc(lastSector || '—') + '</div><div class="list">';
      }
      html += deliveryRow(c, day);
    });
    html += '</div>';
    if (active().length) html += '<div class="pad" style="margin-top:20px"><button class="bigbtn red" style="width:100%;min-height:54px;font-size:16px" data-act="closed">' + ic('pause') + esc(t('shopClosed')) + '</button></div>';
    html += fabs(micBtn('mic'));
    return html;
  }

  function deliveryRow(c, day) {
    const i = dayInfo(c, day);
    const p = prod(c.productId);
    let btn;
    if (i.st === 'away') {
      btn = '<button class="sbtn small s-away" data-act="awayinfo" data-id="' + c.id + '"><span>' + esc(t('away')) + '</span><span style="font-size:12px;font-weight:600">' + esc(t('till')) + ' ' + esc(parse(i.till).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) + '</span></button>';
    } else if (i.demand) {
      btn = '<button class="sbtn ' + (i.qty ? 's-done' : 's-none') + '" data-act="cycle" data-id="' + c.id + '" aria-label="' + esc(c.name) + ': ' + fq(i.qty) + ' ' + esc(p.unit) + '"><span class="sym">' + (i.qty ? fq(i.qty) : '+') + '</span><span>' + esc(i.qty ? p.unit : '') + '</span></button>';
    } else {
      const lk = LOOK[i.st];
      const extra = i.st === 'extra' ? '+' + fq(i.qty - c.qty) : lk.sym;
      btn = '<button class="sbtn ' + lk.cls + '" data-act="cycle" data-id="' + c.id + '" aria-label="' + esc(c.name) + ': ' + esc(t(lk.w)) + '"><span class="sym">' + extra + '</span><span>' + esc(t(lk.w)) + '</span></button>';
    }
    return '<div class="drow b-' + i.st + (i.st === 'away' ? ' dim' : '') + '"><a class="flatb" href="#/c/' + c.id + '" style="text-decoration:none;color:inherit">' + esc(c.flat || '•') + '</a>' +
      '<a class="col grow" href="#/c/' + c.id + '" style="text-decoration:none;color:inherit"><span class="nm">' + esc(c.name) + '</span><span class="q">' + esc(qtyText(c)) + '</span></a>' + btn + '</div>';
  }

  function viewCustomers() {
    const q = ui.q.trim().toLowerCase();
    const list = sortRoute(active()).filter((c) => !q || (c.name + ' ' + (c.flat || '') + ' ' + (c.sector || '')).toLowerCase().includes(q));
    const day = todayStr();
    let html = '<div class="phead"><div class="row"><div class="col grow"><h1>' + esc(t('customers')) + '</h1><span class="sub">ग्राहक · ' + active().length + '</span></div></div></div>' +
      '<div class="searchbox"><input id="search" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(ui.q) + '" aria-label="' + esc(t('search')) + '"></div><div class="list" style="margin-top:8px">';
    if (!list.length) html += '<div class="empty">' + esc(t('noCustomers')) + '</div>';
    list.forEach((c) => {
      const b = balance(c, day);
      html += '<a class="crow" href="#/c/' + c.id + '"><span class="flatb">' + esc(c.flat || '•') + '</span><span class="col grow"><span class="head" style="font-size:20px;font-weight:700">' + esc(c.name) + '</span><span class="muted" style="font-size:15px;font-weight:600">' + esc(qtyText(c)) + (c.sector ? ' · ' + esc(c.sector) : '') + '</span></span>' +
        '<span class="amt' + (b > (+S.vendor.limit || 1e12) ? ' red' : '') + '">' + (b > 0.5 ? rupees(b) : '') + '</span></a>';
    });
    html += '</div>' + fabs('<a class="bigbtn" href="#/edit/new">' + ic('plus') + esc(t('addCustomer')) + '</a>');
    return html;
  }

  function viewEdit(id) {
    const isNew = id === 'new';
    const preset = PRESETS[S.vendor.type] || PRESETS.milk;
    const c = isNew ? { name: '', flat: '', sector: ui.sector || '', phone: '', productId: (S.products[0] || {}).id, qty: preset.qty, sched: { type: preset.sched, days: [1, 3, 5] }, rate: '', opening: '' } : cust(id);
    if (!c) return viewNotFound();
    ui.form = { type: c.sched.type, days: (c.sched.days || []).slice(), qty: +c.qty || 1 };
    const sectors = [...new Set(active().map((x) => x.sector).filter(Boolean))];
    const wd = S.vendor.lang === 'hi' ? ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const types = [['daily', 'daily'], ['alt', 'alternate'], ['days', 'pickDays'], ['demand', 'onCall']];
    return '<div class="phead"><div class="row"><a class="iconbtn ghost" href="' + (isNew ? '#/customers' : '#/c/' + c.id) + '" aria-label="' + esc(t('back')) + '">' + ic('back') + '</a><div class="col grow"><h1>' + esc(isNew ? t('addCustomer') : t('editCustomer')) + '</h1></div></div></div>' +
      '<div class="form">' +
      '<div class="field"><label for="f-name">' + esc(t('name')) + '</label><input id="f-name" value="' + esc(c.name) + '" autocomplete="off"></div>' +
      '<div class="row" style="gap:10px;align-items:flex-end"><div class="field grow"><label for="f-flat">' + esc(t('flat')) + '</label><input id="f-flat" value="' + esc(c.flat) + '" autocomplete="off"></div>' +
      '<div class="field grow"><label for="f-sector">' + esc(t('area')) + '</label><input id="f-sector" list="sectors" value="' + esc(c.sector) + '" autocomplete="off"><datalist id="sectors">' + sectors.map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist></div></div>' +
      '<div class="field"><label for="f-phone">' + esc(t('phone')) + '</label><input id="f-phone" type="tel" inputmode="tel" value="' + esc(c.phone) + '"></div>' +
      '<div class="field"><label for="f-prod">' + esc(t('product')) + '</label><select id="f-prod">' + S.products.map((p) => '<option value="' + p.id + '"' + (p.id === c.productId ? ' selected' : '') + '>' + esc(p.name) + ' (₹' + esc(p.rate) + '/' + esc(p.unit) + ')</option>').join('') + '</select></div>' +
      '<div class="field"><span class="lab">' + esc(t('schedule')) + '</span><div class="opts">' + types.map(([k, lab]) => '<button type="button" class="opt' + (ui.form.type === k ? ' on' : '') + '" data-act="sched" data-val="' + k + '">' + esc(t(lab)) + '</button>').join('') + '</div></div>' +
      '<div class="field' + (ui.form.type === 'days' ? '' : ' hidden') + '" id="daysbox"><div class="days">' + wd.map((w, i) => '<button type="button" class="opt' + (ui.form.days.includes(i) ? ' on' : '') + '" data-act="wday" data-val="' + i + '" aria-pressed="' + ui.form.days.includes(i) + '">' + w + '</button>').join('') + '</div></div>' +
      '<div class="field' + (ui.form.type === 'demand' ? ' hidden' : '') + '" id="qtybox"><span class="lab">' + esc(t('qty')) + '</span><div class="stepper"><button type="button" data-act="qty" data-n="-0.5" aria-label="Less">−</button><output id="f-qty">' + fq(ui.form.qty) + '</output><button type="button" data-act="qty" data-n="0.5" aria-label="More">+</button></div></div>' +
      '<div class="row" style="gap:10px;align-items:flex-start"><div class="field grow"><label for="f-rate">' + esc(t('rate')) + '</label><input id="f-rate" type="number" inputmode="decimal" placeholder="' + esc(prod(c.productId).rate) + '" value="' + esc(c.rate) + '"></div>' +
      '<div class="field grow"><label for="f-open">' + esc(t('oldDue')) + '</label><input id="f-open" type="number" inputmode="decimal" placeholder="0" value="' + esc(c.opening) + '"></div></div>' +
      '<div class="btnrow"><button class="bigbtn" data-act="savecust" data-id="' + (isNew ? '' : c.id) + '">' + ic('check') + esc(t('save')) + '</button></div>' +
      (isNew ? '' : '<div class="btnrow"><button class="bigbtn red" data-act="delcust" data-id="' + c.id + '">' + esc(t('delete')) + '</button></div>') +
      '</div>';
  }

  function calendarHtml(cells, interactive) {
    const wd = S.vendor.lang === 'hi' ? ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return '<div class="cal"><div class="wd">' + wd.map((w) => '<span>' + w + '</span>').join('') + '</div><div class="grid">' +
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
      '<div><span class="row" style="gap:5px"><span class="d ' + LOOK[k].cls + '">' + LOOK[k].sym + '</span><b>' + counts[k] + '</b></span><small>' + esc(t(LOOK[k].w)) + '</small></div>').join('') + '</div>';
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

  function viewCustomer(id, ym) {
    const c = cust(id);
    if (!c) return viewNotFound();
    ym = ym || monthOf(todayStr());
    ui.month = ym;
    const p = prod(c.productId);
    const { cells, counts } = monthCells(c, ym);
    const b = monthBill(c, ym);
    const pays = S.payments.filter((x) => x.cid === c.id && monthOf(x.date) === ym);
    let html = '<div class="minihero withback"><div class="sun"></div><img src="' + heroImg + '" alt=""><a class="iconbtn back" href="#/customers" aria-label="' + esc(t('back')) + '">' + ic('back') + '</a>' +
      '<h1>' + esc(c.name) + '</h1><span class="muted" style="font-weight:600">' + esc([c.flat, c.sector].filter(Boolean).join(' · ')) + '</span><span class="muted" style="font-weight:600">' + esc(qtyText(c)) + '</span></div>' +
      '<div class="monthnav"><a class="iconbtn" href="#/c/' + c.id + '/' + shiftMonth(ym, -1) + '" aria-label="Previous month">' + ic('back') + '</a><div class="t"><b>' + esc(monthLabel(ym)) + '</b><span class="muted" style="font-size:14px;font-weight:600">' + esc(t('tapDay')) + '</span></div>' +
      '<a class="iconbtn" href="#/c/' + c.id + '/' + shiftMonth(ym, 1) + '" aria-label="Next month">' + ic('next') + '</a></div>' +
      calendarHtml(cells, true) + legendHtml(counts) +
      '<div class="card"><div class="kv"><span>' + fq(b.qty) + ' ' + esc(p.unit) + ' × ₹' + fq(rateOf(c)) + '</span><span>' + rupees(b.amount) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('oldDueShort')) + '</span><span>' + (b.old < 0 ? '− ' + rupees(-b.old) : '+ ' + rupees(b.old)) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('paid')) + '</span><span style="color:var(--given)">− ' + rupees(b.paid) + '</span></div>' +
      '<div class="total"><b>' + esc(t('toPay')) + '</b><strong>' + rupees(Math.max(0, b.due)) + '</strong></div>' +
      (pays.length ? '<div class="muted" style="font-size:14px;margin-top:6px">' + pays.map((x) => esc(parse(x.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) + ': ' + rupees(x.amt) + ' ' + esc(t(x.mode))).join(' · ') + '</div>' : '') +
      '</div>' +
      '<div class="navrow"><button class="bigbtn" data-act="pay" data-id="' + c.id + '">' + ic('rupee') + esc(t('recordPayment')) + '</button></div>' +
      '<div class="navrow"><a class="bigbtn green" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, billText(c, ym))) + '">' + ic('chat') + esc(t('sendWhatsApp')) + '</a></div>' +
      '<div class="navrow"><button class="bigbtn line" data-act="pausesheet" data-id="' + c.id + '">' + ic('pause') + esc(t('pause')) + '</button><a class="bigbtn line" href="#/edit/' + c.id + '">' + ic('edit') + esc(t('editCustomer')) + '</a></div>' +
      '<div class="navrow"><button class="bigbtn line" data-act="copylink" data-id="' + c.id + '">' + ic('link') + esc(t('custLink')) + '</button></div>';
    return html;
  }

  function viewMoney() {
    const day = todayStr();
    const limit = +S.vendor.limit || 0;
    const rows = active().map((c) => ({ c, b: balance(c, day) })).filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b);
    const total = rows.reduce((a, x) => a + x.b, 0);
    const todays = S.payments.filter((p) => p.date === day);
    const cash = todays.filter((p) => p.mode === 'cash').reduce((a, p) => a + +p.amt, 0);
    const other = todays.reduce((a, p) => a + +p.amt, 0) - cash;
    let html = '<div class="phead"><div class="row"><div class="col grow"><h1>' + esc(t('money')) + '</h1><span class="sub">' + esc(dayLabel(day)) + '</span></div></div></div>' +
      '<div class="card"><div class="kv"><span>' + esc(t('totalDue')) + '</span><span class="head" style="font-size:26px;color:var(--skip)">' + rupees(total) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('collectedToday')) + '</span><span class="head" style="font-size:22px;color:var(--given)">' + rupees(cash + other) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('cashInHand')) + '</span><span>' + rupees(cash) + ' ' + esc(t('cash')) + ' · ' + rupees(other) + ' UPI/' + esc(t('bank')) + '</span></div></div>' +
      '<div class="section">' + ic('alert', 'sm') + esc(t('due')) + ' · ' + rows.length + ' ' + esc(t('houses')) + '</div><div class="list">';
    if (!rows.length) html += '<div class="empty">' + esc(t('nobodyOwes')) + '</div>';
    rows.forEach(({ c, b }) => {
      const over = limit && b > limit;
      html += '<div class="crow"><a class="flatb" href="#/c/' + c.id + '" style="text-decoration:none;color:inherit">' + esc(c.flat || '•') + '</a>' +
        '<a class="col grow" href="#/c/' + c.id + '" style="text-decoration:none;color:inherit"><span class="head" style="font-size:20px;font-weight:700">' + esc(c.name) + '</span>' +
        (over ? '<span style="align-self:flex-start;margin-top:2px;padding:2px 8px;border-radius:999px;background:var(--tint-rose);color:#B4231A;font-weight:700;font-size:12px">' + esc(t('overLimit')) + '</span>' : '<span class="muted" style="font-size:14px">' + esc(c.sector || '') + '</span>') + '</a>' +
        '<button class="sbtn small s-done" style="width:110px" data-act="pay" data-id="' + c.id + '"><span class="head" style="font-size:19px">' + rupees(b) + '</span><span style="font-size:12px">' + esc(t('received')) + '</span></button></div>';
    });
    return html + '</div>';
  }

  function stockFor(day) {
    const per = {};
    let extra = 0, away = 0, awayHouses = 0, extraHouses = 0;
    active().forEach((c) => {
      const i = dayInfo(c, day);
      const p = prod(c.productId);
      const k = p.id || p.name;
      per[k] = per[k] || { p, qty: 0 };
      per[k].qty += i.qty;
      if (i.st === 'extra') { extra += i.qty - c.qty; extraHouses++; }
      if (i.st === 'away' && (c.sched || {}).type !== 'demand' && isScheduled(c, day)) { away += +c.qty; awayHouses++; }
    });
    return { items: Object.values(per).filter((x) => x.qty > 0), extra, away, awayHouses, extraHouses };
  }
  function canSvg(f) {
    const h = Math.round(26 * f);
    return '<svg width="34" height="46" viewBox="0 0 34 46" fill="none" aria-hidden="true"><rect x="11" y="1" width="12" height="5" rx="1.5" fill="#4B5670"/><path d="M12 6v4l-7 5v27a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V15l-7-5V6" stroke="#4B5670" stroke-width="2.2" stroke-linejoin="round"/><rect x="7.5" y="' + (41 - h) + '" width="19" height="' + h + '" rx="2" fill="#1D4E9E"/></svg>';
  }
  function viewStock() {
    const day = ui.stockDay === 'tomorrow' ? addDays(todayStr(), 1) : todayStr();
    const s = stockFor(day);
    const litres = s.items.filter((x) => x.p.unit === 'L').reduce((a, x) => a + x.qty, 0);
    let html = '<div class="minihero"><div class="sun"></div><img src="' + heroImg + '" alt="">' +
      '<h1>' + esc(t('stock')) + '</h1><span class="muted" style="font-weight:600">' + esc(dayLabel(day)) + '</span></div>' +
      '<div class="chips"><button class="chip' + (ui.stockDay === 'today' ? ' on' : '') + '" data-act="stockday" data-val="today">' + esc(t('today')) + '</button><button class="chip' + (ui.stockDay === 'tomorrow' ? ' on' : '') + '" data-act="stockday" data-val="tomorrow">' + esc(t('tomorrow')) + '</button></div>';
    html += '<div class="totalcard"><div class="col"><span style="font-weight:600;opacity:.9">' + esc(t('totalMilk')) + '</span><strong>' + (litres ? fq(litres) + ' L' : s.items.length ? fq(s.items[0].qty) + ' ' + esc(s.items[0].p.unit) : '0') + '</strong></div>' +
      '<button class="round" data-act="speakstock" aria-label="' + esc(t('readAloud')) + '">' + ic('speaker') + '<span>' + esc(t('readAloud')) + '</span></button></div>';
    html += '<div class="list" style="margin-top:12px">';
    s.items.forEach((x) => {
      let cans = '';
      if (x.p.unit === 'L') {
        let left = x.qty; const arr = [];
        while (left >= 40) { arr.push(1); left -= 40; }
        if (left > 0) arr.push(left / 40);
        const full = arr.filter((f) => f === 1).length;
        cans = '<div class="cans">' + arr.map(canSvg).join('') + '<span class="muted" style="font-weight:600;margin-left:6px">' + [full ? full + ' ' + (full === 1 ? t('can') : t('cans')) : '', left > 0 ? fq(left) + ' L' : ''].filter(Boolean).map(esc).join(' + ') + (full ? ' · 40 L ' + esc(t('cans')) : '') + '</span></div>';
      }
      html += '<div class="card" style="margin:0"><div class="kv" style="align-items:baseline"><span class="head" style="font-size:21px;color:var(--ink)">' + esc(x.p.name) + '</span><span class="head" style="font-size:32px">' + fq(x.qty) + ' ' + esc(x.p.unit) + '</span></div>' + cans + '</div>';
    });
    if (!s.items.length) html += '<div class="empty">0</div>';
    html += '</div><div class="pad" style="margin-top:12px;display:flex;flex-direction:column;gap:6px;font-weight:600">';
    if (s.extra) html += '<div class="row"><span class="d s-extra" style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff">+</span>' + fq(s.extra) + ' ' + esc(t('extraAsked')) + ' · ' + s.extraHouses + ' ' + esc(s.extraHouses === 1 ? t('house') : t('houses')) + '</div>';
    if (s.away) html += '<div class="row"><span class="d s-away" style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff">॥</span>' + fq(s.away) + ' ' + esc(t('lessAway')) + ' · ' + s.awayHouses + ' ' + esc(s.awayHouses === 1 ? t('house') : t('houses')) + '</div>';
    html += '</div><div class="navrow"><a class="bigbtn green" target="_blank" rel="noopener" href="' + esc(waLink('', S.vendor.name + ' · ' + dayLabel(day) + '\n' + s.items.map((x) => x.p.name + ': ' + fq(x.qty) + ' ' + x.p.unit).join('\n'))) + '">' + ic('chat') + esc(t('sendDairy')) + '</a></div>';
    return html;
  }

  function viewSettings() {
    const v = S.vendor;
    return '<div class="phead"><div class="row"><div class="col grow"><h1>' + esc(t('settings')) + '</h1></div></div></div><div class="form">' +
      '<div class="field"><label for="s-name">' + esc(t('vendorName')) + '</label><input id="s-name" value="' + esc(v.name) + '"></div>' +
      '<div class="field"><label for="s-phone">' + esc(t('yourPhone')) + '</label><input id="s-phone" type="tel" inputmode="tel" value="' + esc(v.phone) + '"></div>' +
      '<div class="field"><label for="s-upi">' + esc(t('upiId')) + '</label><input id="s-upi" value="' + esc(v.upi) + '" autocapitalize="off"></div>' +
      '<div class="field"><label for="s-limit">' + esc(t('limit')) + '</label><input id="s-limit" type="number" inputmode="numeric" value="' + esc(v.limit) + '"></div>' +
      '<div class="field"><span class="lab">' + esc(t('language')) + '</span><div class="opts"><button type="button" class="opt' + (v.lang === 'en' ? ' on' : '') + '" data-act="setlang" data-val="en">English</button><button type="button" class="opt' + (v.lang === 'hi' ? ' on' : '') + '" data-act="setlang" data-val="hi">हिंदी</button></div></div>' +
      '<div class="field"><span class="lab">' + esc(t('items')) + '</span>' +
      S.products.map((p) => '<div class="row" style="gap:8px"><input class="grow" style="min-height:52px;border-radius:14px;border:2px solid var(--line);padding:0 12px;font-size:17px" data-prod="' + p.id + '" data-k="name" value="' + esc(p.name) + '" aria-label="' + esc(t('product')) + '">' +
        '<input style="width:70px;min-height:52px;border-radius:14px;border:2px solid var(--line);padding:0 10px;font-size:17px" data-prod="' + p.id + '" data-k="unit" value="' + esc(p.unit) + '" aria-label="' + esc(t('unit')) + '">' +
        '<input style="width:84px;min-height:52px;border-radius:14px;border:2px solid var(--line);padding:0 10px;font-size:17px" type="number" inputmode="decimal" data-prod="' + p.id + '" data-k="rate" value="' + esc(p.rate) + '" aria-label="' + esc(t('rate')) + '"></div>').join('') +
      '<button type="button" class="opt" data-act="addprod">+ ' + esc(t('addItem')) + '</button></div>' +
      '<div class="btnrow"><button class="bigbtn" data-act="savesettings">' + ic('check') + esc(t('save')) + '</button></div>' +
      '<div class="btnrow"><button class="bigbtn line" data-act="backup">' + esc(t('backup')) + '</button></div>' +
      '<div class="btnrow"><label class="bigbtn line" style="cursor:pointer">' + esc(t('restore')) + '<input type="file" accept="application/json" id="restore" hidden></label></div>' +
      '<div class="btnrow"><button class="bigbtn line" data-act="sample">' + esc(t('sample')) + '</button></div>' +
      '<div class="btnrow"><button class="bigbtn red" data-act="reset">' + esc(t('resetAll')) + '</button></div></div>';
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
    return '<div class="pub"><div class="minihero"><div class="sun"></div><img src="' + heroImg + '" alt=""><span class="pill" style="align-self:flex-start;background:#fff">' + ic('link', 'sm') + esc(d.v) + '</span>' +
      '<h1 style="margin-top:8px">' + esc(d.n) + '</h1><span class="muted" style="font-weight:600">' + esc([d.f, d.p].filter(Boolean).join(' · ')) + '</span></div>' +
      '<div class="monthnav" style="justify-content:center"><div class="t"><b>' + esc(monthLabel(ym)) + '</b></div></div>' +
      calendarHtml(cells, false) + legendHtml(counts) +
      '<div class="card"><div class="kv"><span>' + fq(d.q) + ' ' + esc(d.un) + ' × ₹' + fq(d.r) + '</span><span>' + rupees(d.a) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('oldDueShort')) + '</span><span>' + rupees(d.o) + '</span></div>' +
      '<div class="kv"><span>' + esc(t('paid')) + '</span><span style="color:var(--given)">− ' + rupees(d.pd) + '</span></div>' +
      '<div class="total"><b>' + esc(t('toPay')) + '</b><strong>' + rupees(Math.max(0, d.due)) + '</strong></div></div>' +
      (upi && d.due > 0 ? '<div class="navrow"><a class="bigbtn" href="' + esc(upi) + '">' + ic('qr') + esc(t('payUpi')) + ' ' + rupees(d.due) + '</a></div>' : '') +
      (d.vp ? '<div class="navrow"><a class="bigbtn line" href="' + esc(ask('Please pause delivery for ' + d.n + ' (' + (d.f || '') + ') from __ to __')) + '">' + ic('pause') + esc(t('askPause')) + '</a>' +
        '<a class="bigbtn line" href="' + esc(ask('Please send extra for ' + d.n + ' (' + (d.f || '') + '): ')) + '">' + ic('plus') + esc(t('askExtra')) + '</a></div>' : '') +
      '<p class="muted" style="text-align:center;font-size:14px;margin:18px 0 0">LocalWaallah · ' + esc(t('noApp')) + '</p></div>';
  }

  const viewNotFound = () => '<div class="empty" style="padding-top:80px">Not found.<div class="btnrow"><a class="bigbtn" href="#/home">' + esc(t('back')) + '</a></div></div>';

  // ---------- links & sharing ----------
  function publicLink(c, ym) {
    const p = prod(c.productId);
    const b = monthBill(c, ym);
    const { codes } = monthCells(c, ym);
    const data = { v: S.vendor.name, vp: S.vendor.phone, u: S.vendor.upi, n: c.name, f: c.flat, p: p.name, un: p.unit, r: rateOf(c), m: ym, d: codes, o: Math.round(b.old), a: Math.round(b.amount), pd: Math.round(b.paid), due: Math.round(b.due), q: b.qty };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#/s/' + enc;
  }
  function billText(c, ym) {
    const p = prod(c.productId);
    const b = monthBill(c, ym);
    const lines = [
      'Namaste ' + c.name + ',',
      S.vendor.name + ' · ' + monthLabel(ym),
      fq(b.qty) + ' ' + p.unit + ' × ₹' + fq(rateOf(c)) + ' = ' + rupees(b.amount),
      t('oldDueShort') + ': ' + rupees(b.old),
      t('paid') + ': ' + rupees(b.paid),
      t('toPay') + ': *' + rupees(Math.max(0, b.due)) + '*'
    ];
    if (S.vendor.upi) lines.push('UPI: ' + S.vendor.upi);
    lines.push('', publicLink(c, ym));
    return lines.join('\n');
  }
  const waLink = (phone, text) => 'https://wa.me/' + (phone ? waPhone(phone) : '') + '?text=' + encodeURIComponent(text);

  // ---------- sheets ----------
  function sheet(html) { $('#sheet-root').innerHTML = '<div class="scrim" data-act="closesheet"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>'; }
  const closeSheet = () => { $('#sheet-root').innerHTML = ''; };
  // In-app confirm: browser confirm() boxes are blocked in some app views and scary for new users.
  function askThen(msg, fn) {
    ui.pending = fn;
    sheet('<h2>' + esc(msg) + '</h2><div class="btnrow"><button class="bigbtn line" data-act="closesheet">' + esc(t('cancel')) + '</button><button class="bigbtn" style="background:var(--skip)" data-act="yes">' + ic('check') + esc(t('yesDo')) + '</button></div>');
  }
  function linkSheet(link) {
    sheet('<div class="row"><h2 class="grow">' + esc(t('custLink')) + '</h2><button class="iconbtn" data-act="closesheet" aria-label="' + esc(t('cancel')) + '">' + ic('close') + '</button></div>' +
      '<div class="field"><textarea id="linkbox" readonly rows="4" style="width:100%;border-radius:14px;border:2px solid var(--line);padding:10px;font-size:14px;background:var(--surface)">' + esc(link) + '</textarea></div>' +
      '<div class="btnrow"><button class="bigbtn" data-act="copytext">' + ic('link') + esc(t('copy')) + '</button><a class="bigbtn line" target="_blank" rel="noopener" href="' + esc(link) + '">' + esc(t('open')) + '</a></div>');
  }

  function paySheet(cid) {
    const c = cust(cid);
    const b = Math.max(0, Math.round(balance(c, todayStr())));
    ui.pay = { cid, amt: '', mode: 'cash', due: b };
    sheet('<div class="row"><h2 class="grow">' + esc(c.name) + '</h2><button class="iconbtn" data-act="closesheet" aria-label="' + esc(t('cancel')) + '">' + ic('close') + '</button></div>' +
      '<div class="muted" style="font-weight:600">' + esc(t('due')) + ': ' + rupees(b) + '</div>' +
      '<div class="amountshow" id="amt">₹0</div>' +
      '<div class="opts" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:8px">' + ['cash', 'upi', 'cheque', 'bank'].map((m) => '<button type="button" class="opt' + (m === 'cash' ? ' on' : '') + '" data-act="paymode" data-val="' + m + '">' + esc(t(m)) + '</button>').join('') + '</div>' +
      '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'full', '0', 'del'].map((k) =>
        '<button type="button" data-act="key" data-val="' + k + '"' + (k === 'del' ? ' aria-label="Delete"' : '') + '>' + (k === 'del' ? '⌫' : k === 'full' ? '<span style="font-size:16px">' + rupees(b) + '</span>' : k) + '</button>').join('') + '</div>' +
      '<div class="btnrow"><button class="bigbtn green" data-act="savepay">' + ic('check') + esc(t('received')) + '</button></div>');
  }
  function pauseSheet(cid) {
    const c = cust(cid);
    const tm = addDays(todayStr(), 1);
    sheet('<div class="row"><h2 class="grow">' + esc(t('pauseDates')) + '</h2><button class="iconbtn" data-act="closesheet" aria-label="' + esc(t('cancel')) + '">' + ic('close') + '</button></div>' +
      '<div class="muted" style="font-weight:600">' + esc(c.name) + '</div>' +
      '<div class="row" style="gap:10px"><div class="field grow"><label for="p-from">' + esc(t('from')) + '</label><input type="date" id="p-from" value="' + tm + '"></div>' +
      '<div class="field grow"><label for="p-to">' + esc(t('to')) + '</label><input type="date" id="p-to" value="' + addDays(tm, 4) + '"></div></div>' +
      '<div class="btnrow"><button class="bigbtn" data-act="savepause" data-id="' + c.id + '">' + ic('pause') + esc(t('pause')) + '</button></div>' +
      (c.pauses || []).filter((p) => p.to >= todayStr()).map((p, i) => '<div class="card" style="margin:12px 0 0;display:flex;align-items:center;gap:10px"><span class="grow" style="font-weight:700">' +
        esc(parse(p.from).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) + ' – ' + esc(parse(p.to).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) +
        '</span><button class="opt" data-act="delpause" data-id="' + c.id + '" data-from="' + p.from + '">' + esc(t('resume')) + '</button></div>').join(''));
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
    const day = location.hash.startsWith('#/today') ? ui.day : todayStr();
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
    let x = 1;
    for (const tk of tokens) {
      if (tk === String(c.flat).toLowerCase()) continue;
      if (/^\d+(\.\d+)?$/.test(tk)) { x = +tk; break; }
      if (numWords[tk]) { x = numWords[tk]; break; }
    }
    const prev = (S.marks[day] || {})[c.id];
    if ((c.sched || {}).type === 'demand') setMark(c.id, day, st === 'skip' ? null : { s: 'extra', x });
    else setMark(c.id, day, st === 'done' ? null : st === 'extra' ? { s: 'extra', x } : { s: st });
    save(); render();
    const i = dayInfo(c, day);
    toast(t('heard') + ': ' + (c.flat || '') + ' ' + c.name + ' → ' + t(LOOK[i.st].w) + (i.st === 'extra' ? ' +' + fq(x) : ''), () => { setMark(c.id, day, prev || null); save(); render(); });
    return true;
  }

  // ---------- sample data ----------
  function loadSample() {
    const today = todayStr();
    const start = monthStart(shiftMonth(monthOf(today), -2));
    const fc = { id: uid(), name: 'Full Cream', unit: 'L', rate: 68 }, tn = { id: uid(), name: 'Toned', unit: 'L', rate: 56 };
    S = blank();
    Object.assign(S.vendor, { name: 'Ramesh Dairy', phone: '', upi: 'rameshdairy@upi', lang: S.vendor.lang || 'en', type: 'milk' });
    S.products = [fc, tn];
    const people = [
      ['301', 'Sharma ji', 'Tower B', fc, 1, 'daily'], ['302', 'Mehta family', 'Tower B', tn, 2, 'daily'], ['303', 'Iqbal bhai', 'Tower B', fc, 1, 'daily'],
      ['304', 'Rao madam', 'Tower B', tn, 1, 'alt'], ['305', 'Fernandes', 'Tower B', fc, 1, 'daily'], ['306', 'Gupta ji', 'Tower B', fc, 1, 'daily'],
      ['12', 'Verma ji', 'Gali 1', fc, 1.5, 'daily'], ['14', 'Khan sahab', 'Gali 1', tn, 1, 'days'], ['17', 'Pillai', 'Gali 1', fc, 0.5, 'daily'],
      ['21', 'Joshi ji', 'Gali 1', tn, 2, 'daily'], ['S-4', 'Chai stall', 'Market', fc, 5, 'daily'], ['S-9', 'Sweet shop', 'Market', fc, 10, 'daily']
    ];
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    people.forEach(([flat, name, sector, p, qty, type]) => {
      const c = { id: uid(), flat, name, sector, phone: '', productId: p.id, qty, sched: { type, days: [1, 3, 5] }, rate: '', opening: rnd() < 0.3 ? 200 : 0, start, pauses: [] };
      S.customers.push(c);
    });
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
  const handlers = {
    undo() { const u = toast.undo; $('#toast').hidden = true; if (u) u(); },
    lang() { S.vendor.lang = S.vendor.lang === 'hi' ? 'en' : 'hi'; save(); render(); },
    setlang(el) { S.vendor.lang = el.dataset.val; save(); render(); },
    pick(el) { el.parentNode.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); },
    start() {
      const name = $('#w-name').value.trim();
      if (!name) { $('#w-name').focus(); return; }
      const type = ($('#w-type .opt.on') || {}).dataset.val || 'milk';
      S.vendor.name = name; S.vendor.type = type;
      S.products = (PRESETS[type] || PRESETS.milk).products.map((p) => ({ id: uid(), ...p }));
      save(); location.hash = '#/home';
    },
    sample() { const go = () => { loadSample(); location.hash = '#/home'; render(); }; if (S.customers.length) askThen(t('resetAsk'), go); else go(); },
    reset() { askThen(t('resetAsk'), () => { const lang = S.vendor.lang; S = blank(); S.vendor.lang = lang; save(); location.hash = '#/home'; render(); }); },
    yes() { const fn = ui.pending; ui.pending = null; closeSheet(); if (fn) fn(); },
    day(el) { ui.day = addDays(ui.day, +el.dataset.n); render(); },
    sector(el) { ui.sector = el.dataset.val; render(); },
    cycle(el, id) {
      const c = cust(id); const day = ui.day;
      const prev = (S.marks[day] || {})[id];
      if ((c.sched || {}).type === 'demand') {
        const x = ((prev && prev.x) || 0) + 1;
        setMark(id, day, x > 9 ? null : { s: 'extra', x });
      } else {
        const cur = dayInfo(c, day).st;
        const nx = NEXT[cur] || 'done';
        setMark(id, day, nx === 'done' ? null : nx === 'extra' ? { s: 'extra', x: 1 } : { s: nx });
      }
      save(); render();
      const i = dayInfo(c, day);
      toast((c.flat ? c.flat + ' ' : '') + c.name + ': ' + (i.demand ? fq(i.qty) + ' ' + prod(c.productId).unit : t(LOOK[i.st].w)), () => { setMark(id, day, prev || null); save(); render(); });
    },
    cycleday(el) {
      const c = cust(ui.cid); const day = el.dataset.day;
      const prev = (S.marks[day] || {})[c.id];
      const cur = dayInfo(c, day);
      if (cur.st === 'away') { toast(t('away') + ' ' + t('till') + ' ' + cur.till); return; }
      if (cur.demand) { const x = ((prev && prev.x) || 0) + 1; setMark(c.id, day, x > 9 ? null : { s: 'extra', x }); }
      else if (cur.st === 'none') setMark(c.id, day, { s: 'extra', x: 1 });
      else { const nx = NEXT[cur.st]; setMark(c.id, day, nx === 'done' ? null : nx === 'extra' ? { s: 'extra', x: 1 } : { s: nx }); }
      save(); render();
      toast(parse(day).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ': ' + t(LOOK[dayInfo(c, day).st].w), () => { setMark(c.id, day, prev || null); save(); render(); });
    },
    awayinfo(el, id) { const c = cust(id); const p = pauseOn(c, ui.day); toast(c.name + ': ' + t('away') + ' ' + t('till') + ' ' + parse(p.to).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })); },
    closed() {
      askThen(t('shopClosedAsk'), () => {
      const day = ui.day; const before = JSON.parse(JSON.stringify(S.marks[day] || {}));
      active().forEach((c) => { if ((c.sched || {}).type !== 'demand' && dayInfo(c, day).st !== 'none' && dayInfo(c, day).st !== 'away') setMark(c.id, day, { s: 'skip' }); });
      save(); render();
      toast(t('shopClosed'), () => { S.marks[day] = before; if (!Object.keys(before).length) delete S.marks[day]; save(); render(); });
      });
    },
    voice(el) { voice(el); },
    sched(el) {
      ui.form.type = el.dataset.val;
      el.parentNode.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el));
      $('#daysbox').classList.toggle('hidden', ui.form.type !== 'days');
      $('#qtybox').classList.toggle('hidden', ui.form.type === 'demand');
    },
    wday(el) {
      const d = +el.dataset.val; const a = ui.form.days;
      const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); else a.push(d);
      el.classList.toggle('on', i < 0); el.setAttribute('aria-pressed', String(i < 0));
    },
    qty(el) { ui.form.qty = Math.max(0.5, Math.round((ui.form.qty + +el.dataset.n) * 2) / 2); $('#f-qty').textContent = fq(ui.form.qty); },
    savecust(el) {
      const name = $('#f-name').value.trim();
      if (!name) { $('#f-name').focus(); return; }
      let c = el.dataset.id ? cust(el.dataset.id) : null;
      if (!c) { c = { id: uid(), start: todayStr(), pauses: [] }; S.customers.push(c); }
      Object.assign(c, {
        name, flat: $('#f-flat').value.trim(), sector: $('#f-sector').value.trim(), phone: $('#f-phone').value.trim(),
        productId: $('#f-prod').value, qty: ui.form.qty, sched: { type: ui.form.type, days: ui.form.days.slice().sort() },
        rate: $('#f-rate').value === '' ? '' : +$('#f-rate').value, opening: $('#f-open').value === '' ? '' : +$('#f-open').value
      });
      save(); location.hash = '#/c/' + c.id; toast(t('saved'));
    },
    delcust(el, id) {
      askThen(t('deleteAsk'), () => {
      S.customers = S.customers.filter((c) => c.id !== id);
      S.payments = S.payments.filter((p) => p.cid !== id);
      Object.keys(S.marks).forEach((d) => { delete S.marks[d][id]; if (!Object.keys(S.marks[d]).length) delete S.marks[d]; });
      save(); location.hash = '#/customers';
      });
    },
    pay(el, id) { paySheet(id); },
    paymode(el) { ui.pay.mode = el.dataset.val; el.parentNode.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); },
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
      save(); closeSheet(); render(); toast(t('pause') + ': ' + from + ' – ' + to);
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
    addprod() { S.products.push({ id: uid(), name: 'Item', unit: 'unit', rate: 10 }); save(); render(); },
    savesettings() {
      const v = S.vendor;
      v.name = $('#s-name').value.trim() || v.name; v.phone = $('#s-phone').value.trim(); v.upi = $('#s-upi').value.trim(); v.limit = +$('#s-limit').value || 0;
      document.querySelectorAll('[data-prod]').forEach((inp) => { const p = S.products.find((x) => x.id === inp.dataset.prod); if (p) p[inp.dataset.k] = inp.dataset.k === 'rate' ? +inp.value || 0 : inp.value.trim(); });
      save(); toast(t('saved')); location.hash = '#/home';
    },
    backup() {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'localwaallah-backup-' + todayStr() + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search') { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'restore' || !e.target.files[0]) return;
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.vendor || !Array.isArray(d.customers)) throw 0; S = d; save(); location.hash = '#/home'; render(); toast(t('saved')); } catch (err) { toast('Wrong file'); } };
    r.readAsText(e.target.files[0]);
  });
  window.addEventListener('online', () => render());
  window.addEventListener('offline', () => render());

  // ---------- router ----------
  function render() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, a, b] = h.split('/');
    document.documentElement.lang = S.vendor.lang === 'hi' ? 'hi' : 'en';
    let html;
    if (route === 's') html = viewPublic(a || '');
    else if (!S.vendor.name) html = viewWelcome();
    else if (route === 'today') html = viewToday();
    else if (route === 'customers') html = viewCustomers();
    else if (route === 'edit') html = viewEdit(a);
    else if (route === 'c') { ui.cid = a; html = viewCustomer(a, b); }
    else if (route === 'money') html = viewMoney();
    else if (route === 'stock') html = viewStock();
    else if (route === 'settings') html = viewSettings();
    else html = viewHome();
    const tabbed = ['', 'home', 'today', 'customers', 'money', 'stock'].includes(route || '') && route !== 's' && S.vendor.name;
    document.body.classList.toggle('has-nav', !!tabbed);
    $('#app').innerHTML = html + (tabbed ? tabBar(route || 'home') : '');
  }
  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    const r = location.hash.split('/')[1] || '';
    if (r === 'today' && lastRoute !== 'today') ui.day = todayStr();
    lastRoute = r; closeSheet(); $('#toast').hidden = true; render(); window.scrollTo(0, 0);
  });
  lastRoute = location.hash.split('/')[1] || '';
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.LW = { get state() { return S; }, dayInfo, balance, monthBill, publicLink, applyVoice };
})();
