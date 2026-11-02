// Ortak yardımcılar: API, oturum, bildirim, izinler, harita, ikonlar
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const I = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 3 10.2V20a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1v-9.8z"/></svg>',
    homeO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 3 10.2V20a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1v-9.8z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16V7a1 1 0 0 1 1-1h9v10"/><path d="M12 9h4l3 4v3h-2"/><path d="m12 6 8-3"/><circle cx="6" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M8 17h6M2 16h2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    nav: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l7.5 2.9L13.4 21z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    // Hizmet çizimleri
    svc_oto: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 31v-6l4-8h14l6 8h8a4 4 0 0 1 4 4v2"/><path d="M10 25h26"/><circle cx="14" cy="32" r="3.5"/><circle cx="34" cy="32" r="3.5"/><path d="M17.5 32h13M4 38h40" opacity=".5"/><path d="M42 31v-6" /></svg>',
    svc_agir: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 32V14h22v18"/><path d="M26 19h9l7 7v6h-3"/><path d="M30 19v7h12"/><circle cx="11" cy="33" r="3.5"/><circle cx="20" cy="33" r="3.5"/><circle cx="35" cy="33" r="3.5"/><path d="M4 39h40" opacity=".5"/></svg>',
    svc_moto: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="31" r="6"/><circle cx="37" cy="31" r="6"/><path d="M11 31h9l6-9h6l5 9"/><path d="M29 15h5l3 7M17 22h9"/><path d="M4 41h40" opacity=".5"/></svg>',
    svc_yol: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10h14l8 7v20a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/><path d="M17 6h6v4h-6zM16 22l12 12M28 22 16 34"/><path d="M38 14l4-4" /></svg>',
    tow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16V8h8l2 4h6l3 2v2h-2"/><circle cx="6" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M8 17h6M12 12l7-6"/></svg>',
  };

  // ---------- API ----------
  const KEY = document.documentElement.dataset.app || 'yk';
  const auth = {
    get token() { try { return localStorage.getItem(KEY + ':token'); } catch { return null; } },
    set token(v) { try { v ? localStorage.setItem(KEY + ':token', v) : localStorage.removeItem(KEY + ':token'); } catch {} },
    user: null,
  };
  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && auth.token && !opts.noLogout) {
      auth.token = null;
      location.reload();
    }
    if (!res.ok) throw new Error(data.error || 'Bir hata oluştu');
    return data;
  }

  // ---------- Biçimlendirme ----------
  const tl = (n) => new Intl.NumberFormat('tr-TR').format(Math.round(n || 0)) + ' TL';
  const dt = (s) => new Date(s).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const d8 = (s) => new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const phoneFmt = (p) => String(p || '').replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, '0$1 $2 $3 $4');
  const initials = (n) => String(n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const STATUS = {
    searching: ['Çekici aranıyor', 'amber'],
    accepted: ['Çekici yolda', 'green'],
    arrived: ['Çekici geldi', 'green'],
    towing: ['Çekiliyor', 'green'],
    servicing: ['Yardım yapılıyor', 'green'],
    completed: ['Tamamlandı', 'ink'],
    cancelled: ['İptal', 'red'],
    expired: ['Çekici bulunamadı', 'red'],
  };
  const statusBadge = (s) => `<span class="badge ${STATUS[s]?.[1] || ''}">${STATUS[s]?.[0] || s}</span>`;

  // ---------- Toast & modal ----------
  function toast(title, body = '', err = false) {
    let wrap = $('.toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.innerHTML = `<div class="grow"><div class="tt">${h(title)}</div>${body ? `<div class="tb">${h(body)}</div>` : ''}</div>`;
    t.onclick = () => t.remove();
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  const fail = (e) => toast(e.message || String(e), '', true);

  function modal(html, { onClose, dismissable = true } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog"><div class="grab"></div>${html}</div>`;
    const close = () => { back.remove(); onClose && onClose(); };
    if (dismissable) back.addEventListener('click', (e) => e.target === back && close());
    back.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
    document.body.appendChild(back);
    return { el: back.querySelector('.modal'), close };
  }
  function confirmBox(title, text, okText = 'Onayla', danger = false) {
    return new Promise((res) => {
      const m = modal(`<h3>${h(title)}</h3><p class="muted">${h(text)}</p><div class="row" style="margin-top:16px"><button class="btn ghost" data-close>Vazgeç</button><button class="btn ${danger ? 'danger' : ''}" id="cfOk">${h(okText)}</button></div>`, { onClose: () => res(false) });
      m.el.querySelector('#cfOk').onclick = () => { m.el.parentElement.remove(); res(true); };
    });
  }

  // ---------- İzinler ----------
  const perms = {
    async location() {
      if (!navigator.permissions) return 'prompt';
      try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'prompt'; }
    },
    notification() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : Notification.permission === 'granted' ? 'granted' : 'denied';
    },
    call() {
      try { return localStorage.getItem(KEY + ':callPerm') || 'prompt'; } catch { return 'prompt'; }
    },
    setCall(v) { try { localStorage.setItem(KEY + ':callPerm', v); } catch {} },
  };
  function getPosition(opts = {}) {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Cihazınız konum desteklemiyor'));
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading, accuracy: p.coords.accuracy }),
        (e) => rej(new Error(e.code === 1 ? 'Konum izni reddedildi. Tarayıcı ayarlarından izin verin.' : 'Konum alınamadı')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000, ...opts }
      );
    });
  }

  // ---------- Service worker & Web Push ----------
  let swReg = null;
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try { swReg = await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn(e); }
    return swReg;
  }
  function b64ToUint8(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  async function enablePush(vapidKey) {
    if (!('Notification' in window)) throw new Error('Bu tarayıcı bildirim desteklemiyor. iPhone\'da önce "Ana Ekrana Ekle" yapın.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('Bildirim izni verilmedi');
    const reg = swReg || (await registerSW());
    if (reg && 'PushManager' in window && vapidKey && auth.token) {
      const ready = await navigator.serviceWorker.ready;
      let sub = await ready.pushManager.getSubscription();
      if (!sub) sub = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
      await api('/push/subscribe', { body: sub.toJSON() });
    }
    return true;
  }
  async function showLocalNotification(title, body, data = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // uygulama açıkken toast yeterli
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/badge.png', data, vibrate: [200, 100, 200] }); } catch {}
  }

  // ---------- Socket ----------
  function connectSocket() {
    if (!window.io || !auth.token) return null;
    const s = window.io({ auth: { token: auth.token }, transports: ['websocket', 'polling'] });
    s.on('connect_error', (e) => console.warn('socket', e.message));
    return s;
  }

  // ---------- Harita ----------
  const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  function createMap(el, center = [40.9909, 29.0303], zoom = 13) {
    const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
    const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
    L.tileLayer(dark ? TILE_DARK : TILE, { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }).addTo(map);
    return map;
  }
  const truckIcon = (me = false, heading = 0) =>
    L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20], html: `<div class="truck-marker ${me ? 'me' : ''}"><div class="b">${I.tow}</div></div>` });
  const pinIcon = (cls = '') => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 30], html: `<div class="pin-marker ${cls}"></div>` });
  const meIcon = () => L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="me-dot"></div>' });

  async function route(a, b) {
    // Önce gerçek yol rotası (OSRM), olmazsa düz çizgi
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctrl.signal });
      const j = await r.json();
      if (j.routes && j.routes[0]) return { coords: j.routes[0].geometry.coordinates.map(([x, y]) => [y, x]), km: j.routes[0].distance / 1000, min: j.routes[0].duration / 60 };
    } catch {}
    return { coords: [[a.lat, a.lng], [b.lat, b.lng]], km: null, min: null };
  }

  // ---------- Adres arama (OpenStreetMap Nominatim) ----------
  async function geocode(q, near) {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.search = new URLSearchParams({ format: 'jsonv2', q, countrycodes: 'tr', limit: '7', 'accept-language': 'tr', addressdetails: '0' });
    if (near) u.searchParams.set('viewbox', `${near.lng - 0.6},${near.lat + 0.4},${near.lng + 0.6},${near.lat - 0.4}`);
    const r = await fetch(u);
    const j = await r.json();
    return j.map((x) => ({ lat: +x.lat, lng: +x.lon, address: x.display_name.split(',').slice(0, 3).join(','), full: x.display_name }));
  }
  const rgCache = new Map();
  async function reverseGeocode(p) {
    const k = p.lat.toFixed(4) + ',' + p.lng.toFixed(4);
    if (rgCache.has(k)) return rgCache.get(k);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&accept-language=tr`);
      const j = await r.json();
      const a = j.address || {};
      const s = [a.road || a.pedestrian || a.neighbourhood, a.suburb || a.quarter || a.town, a.city_district || a.county || a.province].filter(Boolean).slice(0, 3).join(', ') || j.display_name || 'Seçilen konum';
      rgCache.set(k, s);
      return s;
    } catch {
      return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    }
  }

  // ---------- Ses / titreşim (yeni iş uyarısı) ----------
  let actx;
  function alertSound(times = 3) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = 'square';
        o.frequency.value = i % 2 ? 660 : 880;
        g.gain.setValueAtTime(0.0001, actx.currentTime + i * 0.35);
        g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + i * 0.35 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + i * 0.35 + 0.28);
        o.connect(g).connect(actx.destination);
        o.start(actx.currentTime + i * 0.35);
        o.stop(actx.currentTime + i * 0.35 + 0.3);
      }
    } catch {}
    navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 300]);
  }

  // ---------- Tema ----------
  function applyTheme() {
    let t = 'auto';
    try { t = localStorage.getItem('yk:theme') || 'auto'; } catch {}
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  applyTheme();

  window.YK = { $, $$, h, I, api, auth, tl, dt, d8, phoneFmt, initials, STATUS, statusBadge, toast, fail, modal, confirmBox, perms, getPosition, registerSW, enablePush, showLocalNotification, connectSocket, createMap, truckIcon, pinIcon, meIcon, route, geocode, reverseGeocode, alertSound, applyTheme };
})();
