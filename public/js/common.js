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
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    sos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    satIco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></svg>',
    mapIco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
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
    scheduled: ['Randevulu', 'green'],
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
      if (window.ReactNativeWebView) { try { return localStorage.getItem(KEY + ':nativePush') || 'prompt'; } catch { return 'prompt'; } }
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
  // ---------- Platform ----------
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  const isStandalone = () => !!window.ReactNativeWebView || window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

  // Ana ekrana ekleme rehberi (iPhone'da bildirimler yalnızca ana ekrandan açılan uygulamada çalışır)
  function installHelp(reason = '') {
    const ios = isIOS();
    const m = modal(`
      <div class="center"><img src="/icons/logo-192.png" alt="" style="width:72px;height:72px;border-radius:18px"></div>
      <h3 class="center" style="margin-top:10px">Uygulamayı ana ekrana ekleyin</h3>
      ${reason ? `<p class="muted small center" style="margin-top:-6px">${h(reason)}</p>` : ''}
      ${ios ? `<ol class="steps-list">
          <li>Bu sayfayı <b>Safari</b> ile açın (Chrome değil)</li>
          <li>Alttaki <b>Paylaş</b> düğmesine dokunun <span class="kbd">⬆︎</span></li>
          <li><b>Ana Ekrana Ekle</b>'yi seçin ve <b>Ekle</b>'ye dokunun</li>
          <li>Ana ekrandaki <b>Yolda Kaldık</b> ikonundan açın ve <b>Ayarlar → Bildirim izni</b>'ne dokunun</li></ol>
          <p class="tiny muted">iOS 16.4 ve üstü gerekir. Ayarlar → Genel → Hakkında'dan sürümünüzü görebilirsiniz.</p>`
        : `<ol class="steps-list"><li>Chrome menüsüne (⋮) dokunun</li><li><b>Uygulamayı yükle</b> veya <b>Ana ekrana ekle</b>'yi seçin</li><li>Ana ekrandaki ikondan açın</li></ol>`}
      ${installEvt ? '<button class="btn" id="doInstall">Şimdi yükle</button>' : ''}
      <button class="btn ghost" data-close style="margin-top:8px">Tamam</button>`);
    const b = $('#doInstall', m.el);
    if (b) b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; m.close(); };
  }

  const LSK = (k) => KEY + ':' + k;
  const sameKey = (buf, b64) => {
    if (!buf) return true;
    const a = new Uint8Array(buf);
    const b = b64ToUint8(b64);
    return a.length === b.length && a.every((x, i) => x === b[i]);
  };
  // Expo iOS/Android uygulaması içinde çalışıyorsak yerel bildirim köprüsü
  const NATIVE = !!window.ReactNativeWebView;
  const nativeWait = {};
  window.__ykNative = (msg) => {
    if (!msg) return;
    if (msg.type === 'push:token' && nativeWait.push) { nativeWait.push.res(msg); delete nativeWait.push; }
    if (msg.type === 'push:error' && nativeWait.push) { nativeWait.push.rej(new Error(msg.message || 'Bildirim izni verilmedi')); delete nativeWait.push; }
  };
  const nativePost = (m) => { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch {} };
  function nativePushToken(prompt) {
    return new Promise((res, rej) => {
      nativeWait.push = { res, rej };
      nativePost({ type: 'push:register', prompt });
      setTimeout(() => { if (nativeWait.push) { delete nativeWait.push; rej(new Error('Bildirim izni alınamadı')); } }, 20000);
    });
  }
  async function enablePush(vapidKey, { silent = false } = {}) {
    if (NATIVE) {
      const r = await nativePushToken(!silent);
      if (r.token && auth.token) await api('/push/expo', { body: { token: r.token, platform: r.platform } });
      try { localStorage.setItem(LSK('pushOk'), '1'); localStorage.setItem(LSK('nativePush'), 'granted'); } catch {}
      return true;
    }
    if (!pushSupported()) {
      if (isIOS() && !isStandalone()) {
        if (!silent) installHelp('iPhone\'da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır.');
        throw new Error('iPhone\'da bildirim için uygulamayı ana ekrana ekleyin');
      }
      throw new Error('Bu tarayıcı bildirimleri desteklemiyor. Chrome veya Safari\'nin güncel sürümünü kullanın.');
    }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p !== 'granted') throw new Error(p === 'denied' ? 'Bildirimler engellendi. Telefon/tarayıcı ayarlarından bu site için bildirimlere izin verin.' : 'Bildirim izni verilmedi');
    await (swReg || registerSW());
    if (!vapidKey || !auth.token) return true;
    const ready = await navigator.serviceWorker.ready;
    let sub = await ready.pushManager.getSubscription();
    // Sunucu anahtarı değiştiyse eski abonelik çalışmaz: yenile
    let stored = null;
    try { stored = localStorage.getItem(LSK('vapid')); } catch {}
    if (sub && (stored !== vapidKey || !sameKey(sub.options?.applicationServerKey, vapidKey))) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) });
    await api('/push/subscribe', { body: { ...sub.toJSON(), ua: navigator.userAgent.slice(0, 120) } });
    try { localStorage.setItem(LSK('vapid'), vapidKey); localStorage.setItem(LSK('pushOk'), '1'); } catch {}
    return true;
  }
  async function showLocalNotification(title, body, data = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // uygulama açıkken uygulama içi uyarı yeterli
    let pushOk = false;
    try { pushOk = localStorage.getItem(LSK('pushOk')) === '1'; } catch {}
    if (pushOk) return; // sunucu zaten anlık bildirim gönderiyor; çift bildirim olmasın
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/badge.png', data, tag: data.jobId ? 'job-' + data.jobId : undefined }); } catch {}
  }

  // ---------- Socket ----------
  function connectSocket() {
    if (!window.io || !auth.token) return null;
    const s = window.io({ auth: { token: auth.token }, transports: ['websocket', 'polling'] });
    s.on('connect_error', (e) => console.warn('socket', e.message));
    return s;
  }

  // ---------- Harita (Google Maps; anahtar yoksa OpenStreetMap) ----------
  const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light');
  const GM_DARK = [
    { elementType: 'geometry', stylers: [{ color: '#1d2c30' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9fb3b6' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#142124' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3f44' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d5359' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a1d' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#22343a' }] },
  ];
  const G = { ok: false, ready: null, maps: new Set(), session: null };
  // Mapbox: Google anahtarı yoksa harita, adres arama ve rota sağlayıcısı
  const MB = { token: '', failed: false, session: null };
  const gmapsReady = () => G.ok;
  const provider = () => (G.ok ? 'google' : MB.token && !MB.failed ? 'mapbox' : 'osm');

  // Uygulama açılışında config ile çağrılır
  function initMaps(cfg = {}) {
    MB.token = cfg.mapboxToken || '';
    G.maps.forEach((m) => setBase(m, m._ykType || 'roadmap'));
    return initGoogle(cfg.googleMapsKey);
  }

  // Google Maps JavaScript API'yi yükler (Maps + Places + Geocoding + Directions)
  function initGoogle(key) {
    if (G.ready) return G.ready;
    if (!key) return (G.ready = Promise.resolve(false));
    G.ready = new Promise((res) => {
      window.__ykGm = () => res(!!(window.google && google.maps));
      window.gm_authFailure = () => {
        G.ok = false;
        G.maps.forEach((m) => setBase(m, m._ykType || 'roadmap'));
        toast('Google Haritalar açılamadı', 'API anahtarı geçersiz veya bu alan adına izinli değil. Yedek harita kullanılıyor.', true);
      };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places,geocoding,routes&language=tr&region=TR&callback=__ykGm`;
      s.async = true;
      s.onerror = () => res(false);
      document.head.appendChild(s);
      setTimeout(() => res(false), 12000);
    }).then((ok) => {
      G.ok = ok && !!(L.gridLayer && L.gridLayer.googleMutant);
      if (G.ok) G.maps.forEach((m) => setBase(m, m._ykType || 'roadmap'));
      return G.ok;
    });
    return G.ready;
  }

  const MB_ATTR = '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener"><b>Haritayı geliştir</b></a>';
  function mapboxLayer(type) {
    const style = type === 'hybrid' ? 'satellite-streets-v12' : isDark() ? 'dark-v11' : 'streets-v12';
    const layer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(MB.token)}&language=tr`, {
      tileSize: 512, zoomOffset: -1, maxZoom: 21, attribution: MB_ATTR,
    });
    // Token geçersizse (401/403) birkaç başarısız döşemeden sonra açık haritaya düş
    let okCount = 0, errCount = 0;
    layer.on('tileload', () => okCount++);
    layer.on('tileerror', () => {
      if (okCount || MB.failed || ++errCount < 4) return;
      MB.failed = true;
      G.maps.forEach((m) => setBase(m, 'roadmap'));
      toast('Mapbox haritası açılamadı', 'Erişim anahtarı geçersiz veya bu alan adına izinli değil. Açık harita kullanılıyor.', true);
    });
    return layer;
  }
  function setBase(map, type = 'roadmap') {
    if (map._ykBase) map.removeLayer(map._ykBase);
    const prov = provider();
    if (prov === 'osm') type = 'roadmap';
    if (prov === 'google') map._ykBase = L.gridLayer.googleMutant({ type, maxZoom: 21, styles: type === 'roadmap' && isDark() ? GM_DARK : undefined });
    else if (prov === 'mapbox') map._ykBase = mapboxLayer(type);
    else map._ykBase = L.tileLayer(isDark() ? TILE_DARK : TILE, { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' });
    map._ykBase.addTo(map);
    map._ykType = type;
    map._ykProv = prov;
    map.fire('yk:basechange', { type, provider: prov });
  }
  function createMap(el, center = [40.9909, 29.0303], zoom = 13) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, maxZoom: 20 }).setView(center, zoom);
    G.maps.add(map);
    setBase(map, 'roadmap');
    return map;
  }
  // Harita ↔ Uydu (Google veya Mapbox açıkken)
  function toggleMapType(map) {
    if (provider() === 'osm') return;
    setBase(map, map._ykType === 'hybrid' ? 'roadmap' : 'hybrid');
  }
  function mapTypeButton(map, extraClass = '') {
    const b = document.createElement('button');
    b.className = 'icon-btn maptype-btn ' + extraClass;
    b.setAttribute('aria-label', 'Harita türü');
    const paint = () => {
      b.classList.toggle('hidden', provider() === 'osm');
      b.innerHTML = map._ykType === 'hybrid' ? I.mapIco : I.satIco;
      b.title = map._ykType === 'hybrid' ? 'Harita görünümü' : 'Uydu görünümü';
    };
    b.onclick = () => toggleMapType(map);
    map.on('yk:basechange', paint);
    paint();
    return b;
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));
  async function mbFetch(url) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(MB.token), { signal: ctrl.signal });
    if (!r.ok) throw new Error('Mapbox ' + r.status);
    return r.json();
  }

  const truckIcon = (me = false) =>
    L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20], html: `<div class="truck-marker ${me ? 'me' : ''}"><div class="b">${I.tow}</div></div>` });
  const pinIcon = (cls = '') => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 30], html: `<div class="pin-marker ${cls}"></div>` });
  const meIcon = () => L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="me-dot"></div>' });

  // Rota: Google Directions → OSRM → düz çizgi
  async function route(a, b) {
    if (G.ok) {
      try {
        const { DirectionsService } = await google.maps.importLibrary('routes');
        const r = await new DirectionsService().route({ origin: { lat: a.lat, lng: a.lng }, destination: { lat: b.lat, lng: b.lng }, travelMode: 'DRIVING', region: 'tr' });
        const rt = r.routes[0];
        const leg = rt.legs[0];
        return { coords: rt.overview_path.map((p) => [p.lat(), p.lng()]), km: leg.distance.value / 1000, min: (leg.duration_in_traffic || leg.duration).value / 60, google: true };
      } catch (e) { console.warn('Google rota alınamadı:', e.message || e); }
    }
    if (provider() === 'mapbox') {
      try {
        const j = await mbFetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${a.lng},${a.lat};${b.lng},${b.lat}?geometries=geojson&overview=full&language=tr`);
        const rt = j.routes && j.routes[0];
        if (rt) return { coords: rt.geometry.coordinates.map(([x, y]) => [y, x]), km: rt.distance / 1000, min: rt.duration / 60, mapbox: true };
      } catch (e) { console.warn('Mapbox rota alınamadı:', e.message || e); }
    }
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctrl.signal });
      const j = await r.json();
      if (j.routes && j.routes[0]) return { coords: j.routes[0].geometry.coordinates.map(([x, y]) => [y, x]), km: j.routes[0].distance / 1000, min: j.routes[0].duration / 60 };
    } catch {}
    return { coords: [[a.lat, a.lng], [b.lat, b.lng]], km: null, min: null };
  }

  // ---------- Adres arama: Google Places → OpenStreetMap Nominatim ----------
  async function geocode(q, near) {
    if (G.ok) {
      try {
        const places = await google.maps.importLibrary('places');
        if (!G.session) G.session = new places.AutocompleteSessionToken();
        const req = { input: q, includedRegionCodes: ['tr'], language: 'tr', region: 'tr', sessionToken: G.session };
        if (near) req.locationBias = { center: { lat: near.lat, lng: near.lng }, radius: 50000 };
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        return suggestions.filter((s) => s.placePrediction).slice(0, 7).map((s) => {
          const p = s.placePrediction;
          const main = p.mainText ? p.mainText.text : p.text.text.split(',')[0];
          return {
            address: main,
            full: p.text.text,
            async resolve() {
              const place = p.toPlace();
              await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
              G.session = null; // oturum seçimle kapanır
              const fa = (place.formattedAddress || '').split(',').slice(0, 2).join(',');
              return { lat: place.location.lat(), lng: place.location.lng(), address: place.displayName && !fa.startsWith(place.displayName) ? `${place.displayName}, ${fa}` : fa || main };
            },
          };
        });
      } catch (e) { console.warn('Google Places kullanılamadı:', e.message || e); }
    }
    if (provider() === 'mapbox') {
      try {
        if (!MB.session) MB.session = uuid();
        const prox = near ? `&proximity=${near.lng},${near.lat}` : '';
        const j = await mbFetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&language=tr&country=tr&limit=7${prox}&session_token=${MB.session}`);
        return (j.suggestions || []).map((x) => ({
          address: x.name,
          full: [x.name, x.place_formatted || x.full_address].filter(Boolean).join(', '),
          async resolve() {
            const r = await mbFetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(x.mapbox_id)}?session_token=${MB.session}&language=tr`);
            MB.session = null; // oturum seçimle kapanır
            const f = r.features && r.features[0];
            if (!f) throw new Error('Konum bulunamadı');
            const [lng, lat] = f.geometry.coordinates;
            const sub = (f.properties.place_formatted || f.properties.full_address || '').split(',').slice(0, 2).join(',');
            return { lat, lng, address: [f.properties.name || x.name, sub].filter(Boolean).join(', ') };
          },
        }));
      } catch (e) { console.warn('Mapbox arama kullanılamadı:', e.message || e); }
    }
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.search = new URLSearchParams({ format: 'jsonv2', q, countrycodes: 'tr', limit: '7', 'accept-language': 'tr', addressdetails: '0' });
    if (near) u.searchParams.set('viewbox', `${near.lng - 0.6},${near.lat + 0.4},${near.lng + 0.6},${near.lat - 0.4}`);
    const r = await fetch(u);
    const j = await r.json();
    return j.map((x) => ({ lat: +x.lat, lng: +x.lon, address: x.display_name.split(',').slice(0, 3).join(','), full: x.display_name }));
  }
  const resolvePlace = async (r) => (r.resolve ? r.resolve() : r);

  const rgCache = new Map();
  async function reverseGeocode(p) {
    const k = p.lat.toFixed(4) + ',' + p.lng.toFixed(4);
    if (rgCache.has(k)) return rgCache.get(k);
    let s = null;
    if (G.ok) {
      try {
        const { Geocoder } = await google.maps.importLibrary('geocoding');
        const { results } = await new Geocoder().geocode({ location: { lat: p.lat, lng: p.lng }, language: 'tr' });
        if (results && results[0]) {
          const c = results[0].address_components;
          const get = (...t) => t.map((x) => c.find((y) => y.types.includes(x))?.long_name).find(Boolean);
          s = [get('route'), get('neighborhood', 'sublocality_level_1', 'administrative_area_level_4'), get('administrative_area_level_2', 'locality')].filter(Boolean).join(', ') || results[0].formatted_address;
        }
      } catch (e) { console.warn('Google Geocoding kullanılamadı:', e.message || e); }
    }
    if (!s && provider() === 'mapbox') {
      try {
        const j = await mbFetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.lng}&latitude=${p.lat}&language=tr&limit=1`);
        const f = j.features && j.features[0];
        if (f) {
          const c = f.properties.context || {};
          s = [c.address?.name || c.street?.name, c.neighborhood?.name || c.locality?.name, c.place?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || f.properties.full_address || f.properties.name;
        }
      } catch (e) { console.warn('Mapbox adres bulunamadı:', e.message || e); }
    }
    if (!s) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&accept-language=tr`);
        const j = await r.json();
        const a = j.address || {};
        s = [a.road || a.pedestrian || a.neighbourhood, a.suburb || a.quarter || a.town, a.city_district || a.county || a.province].filter(Boolean).slice(0, 3).join(', ') || j.display_name || 'Seçilen konum';
      } catch {
        return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      }
    }
    rgCache.set(k, s);
    return s;
  }

  // ---------- Fotoğraf: seçme, sıkıştırma, yükleme, görüntüleme ----------
  function pickImages({ multiple = false, camera = false } = {}) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = 'image/*';
      if (multiple) i.multiple = true;
      if (camera) i.capture = 'environment';
      i.style.display = 'none';
      i.onchange = () => { res([...(i.files || [])]); i.remove(); };
      document.body.appendChild(i);
      i.click();
    });
  }
  function compressImage(file, max = 1600, quality = 0.78) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('Lütfen bir fotoğraf seçin'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Fotoğraf okunamadı')); };
      img.src = url;
    });
  }
  async function uploadImage(file, kind) {
    const dataUrl = await compressImage(file);
    return api('/files', { body: { kind, dataUrl } });
  }
  function viewPhoto(url, caption = '') {
    modal(`<img src="${h(url)}" alt="" style="width:100%;border-radius:14px;display:block">${caption ? `<p class="small muted center">${h(caption)}</p>` : ''}<button class="btn ghost" data-close style="margin-top:12px">Kapat</button>`);
  }
  const photoStrip = (list = [], size = 64) =>
    `<div class="photo-strip">${list.map((p) => `<button class="ph" data-url="${h(p.url)}" style="width:${size}px;height:${size}px"><img src="${h(p.url)}" alt="" loading="lazy"></button>`).join('')}</div>`;
  function bindPhotoStrips(root) {
    $$('.photo-strip .ph', root).forEach((b) => (b.onclick = () => viewPhoto(b.dataset.url)));
  }

  // ---------- SMS doğrulama kodu penceresi ----------
  // request(): kodu gönderir ({demoCode}); submit(code): doğrulamayı dener, hata fırlatırsa pencere açık kalır
  function otpModal({ phone, request, submit, title = 'Telefon doğrulama', extraHtml = '', onReady }) {
    return new Promise((resolve) => {
      let left = 0;
      let timer;
      const m = modal(`
        <div class="center"><span class="pin-hero" style="background:var(--brand-soft);color:var(--brand-2)">${I.msg}</span>
        <h3 style="margin:10px 0 4px">${h(title)}</h3>
        <p class="muted small" style="margin:0 0 14px"><b>${h(phoneFmt(String(phone).replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '')))}</b> numarasına gönderilen 6 haneli kodu girin.</p></div>
        <div id="otpDemo"></div>
        <div class="pin-boxes six" id="otpBoxes">${[0, 1, 2, 3, 4, 5].map(() => '<i></i>').join('')}</div>
        <input id="otpIn" class="pin-input" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" aria-label="Doğrulama kodu">
        ${extraHtml}
        <p class="small center" id="otpErr" style="color:var(--red);min-height:20px;margin:10px 0 4px"></p>
        <button class="btn" id="otpOk" disabled>Doğrula</button>
        <button class="btn ghost" id="otpResend" style="margin-top:8px" disabled>Kodu tekrar gönder</button>`, { onClose: () => { clearInterval(timer); resolve(null); } });
      const input = $('#otpIn', m.el);
      const boxes = $$('#otpBoxes i', m.el);
      const paint = () => {
        const v = input.value;
        boxes.forEach((b, i) => { b.textContent = v[i] || ''; b.classList.toggle('on', i === Math.min(v.length, 5)); });
        $('#otpOk', m.el).disabled = v.length !== 6;
      };
      const tick = () => {
        const b = $('#otpResend', m.el);
        if (!b) return clearInterval(timer);
        b.disabled = left > 0;
        b.textContent = left > 0 ? `Kodu tekrar gönder (${left} sn)` : 'Kodu tekrar gönder';
        left--;
      };
      const send = async () => {
        try {
          const r = await request();
          $('#otpErr', m.el).textContent = '';
          $('#otpDemo', m.el).innerHTML = r?.demoCode
            ? `<button class="card flat small" id="otpFill" style="width:100%;margin-bottom:12px;border-color:var(--amber);background:var(--amber-soft);text-align:left">SMS servisi henüz bağlı değil (demo). Kodunuz: <b style="letter-spacing:.1em">${h(r.demoCode)}</b> — doldurmak için dokunun</button>`
            : '';
          const f = $('#otpFill', m.el);
          if (f) f.onclick = () => { input.value = r.demoCode; paint(); };
          left = 60;
          clearInterval(timer);
          timer = setInterval(tick, 1000);
          tick();
        } catch (e) {
          $('#otpErr', m.el).textContent = e.message;
          $('#otpResend', m.el).disabled = false;
        }
      };
      const go = async () => {
        if (input.value.length !== 6) return;
        $('#otpOk', m.el).disabled = true;
        try {
          const r = await submit(input.value, m.el);
          clearInterval(timer);
          m.el.parentElement.remove();
          resolve(r ?? true);
        } catch (e) {
          $('#otpErr', m.el).textContent = e.message;
          $('#otpOk', m.el).disabled = false;
        }
      };
      input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); $('#otpErr', m.el).textContent = ''; paint(); };
      $('#otpBoxes', m.el).onclick = () => input.focus();
      $('#otpOk', m.el).onclick = go;
      $('#otpResend', m.el).onclick = send;
      paint();
      onReady && onReady(m.el);
      send();
      setTimeout(() => input.focus(), 250);
    });
  }
  // Şifremi unuttum: telefon → SMS kodu + yeni şifre → oturum
  function forgotPassword(role) {
    return new Promise((resolve) => {
      const m = modal(`<h3>Şifremi unuttum</h3><p class="muted small" style="margin-top:-6px">Kayıtlı cep telefonunuza bir doğrulama kodu göndereceğiz.</p>
        <label class="field"><span>Cep telefonu</span><input id="fpPhone" inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>
        <button class="btn" id="fpGo" style="margin-top:14px">Kod gönder</button>`, { onClose: () => resolve(null) });
      $('#fpGo', m.el).onclick = async () => {
        const phone = $('#fpPhone', m.el).value;
        m.el.parentElement.remove();
        const r = await otpModal({
          phone,
          title: 'Yeni şifre belirleyin',
          extraHtml: '<label class="field" style="margin-top:14px"><span>Yeni şifre</span><input id="fpPass" type="password" minlength="6" autocomplete="new-password" placeholder="En az 6 karakter"></label>',
          request: () => api('/auth/otp', { body: { phone, role, purpose: 'reset' } }),
          submit: (code, el) => api('/auth/reset', { body: { phone, role, code, password: $('#fpPass', el).value } }),
        });
        resolve(r);
      };
    });
  }

  // ---------- Uygulama içi sohbet ----------
  const QUICK = {
    customer: ['Aracın yanındayım', 'Otoparktayım', 'Kapıdayım', 'Ne kadar kaldı?'],
    driver: ['Yoldayım, geliyorum', '5 dakikaya oradayım', 'Konumdayım', 'Neredesiniz tam olarak?'],
  };
  function openChat({ job, me, socket, onClose }) {
    const other = me === 'customer' ? job.driver?.name || 'Çekici' : job.customer?.name || 'Müşteri';
    const msgs = [...(job.messages || [])];
    const m = modal(`
      <div class="row between"><h3 style="margin:0">${h(other)}</h3><span class="tiny muted">${h(job.no)} · numaranız paylaşılmaz</span></div>
      <div class="chat" id="chatList"></div>
      <div class="chips" style="padding-top:6px" id="chatQuick">${QUICK[me].map((q) => `<button class="chip" data-q="${h(q)}">${h(q)}</button>`).join('')}</div>
      <div class="chat-bar"><button class="icon-btn" id="chatPhoto" style="box-shadow:none;background:var(--chip)" aria-label="Fotoğraf gönder">${I.camera}</button>
        <input class="input grow" id="chatIn" placeholder="Mesaj yazın…" maxlength="500" autocomplete="off">
        <button class="icon-btn" id="chatSend" style="background:var(--brand);color:#fff;box-shadow:none" aria-label="Gönder">${I.send}</button></div>`, { onClose: () => { socket && socket.off('job:message', onMsg); onClose && onClose(); } });
    const list = $('#chatList', m.el);
    const draw = () => {
      list.innerHTML = msgs.length
        ? msgs.map((x) => `<div class="bubble ${x.from === me ? 'me' : ''}">${x.url ? `<button class="ph-in" data-url="${h(x.url)}"><img src="${h(x.url)}" alt=""></button>` : ''}${x.text ? `<div>${h(x.text)}</div>` : ''}<span>${new Date(x.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')
        : `<div class="empty small">Henüz mesaj yok. ${me === 'customer' ? 'Çekicinize' : 'Müşteriye'} not yazabilir, fotoğraf gönderebilirsiniz.</div>`;
      $$('.ph-in', list).forEach((b) => (b.onclick = () => viewPhoto(b.dataset.url)));
      list.scrollTop = list.scrollHeight;
    };
    const onMsg = (e) => { if (e.jobId === job.id && !msgs.some((x) => x.id === e.message.id)) { msgs.push(e.message); draw(); } };
    socket && socket.on('job:message', onMsg);
    const send = async (text, fileId) => {
      try {
        const r = await api(`/jobs/${job.id}/messages`, { body: { text, fileId } });
        if (!msgs.some((x) => x.id === r.message.id)) msgs.push(r.message);
        draw();
      } catch (e) { fail(e); }
    };
    $('#chatSend', m.el).onclick = () => { const v = $('#chatIn', m.el).value.trim(); if (v) { $('#chatIn', m.el).value = ''; send(v); } };
    $('#chatIn', m.el).onkeydown = (e) => e.key === 'Enter' && $('#chatSend', m.el).click();
    $$('[data-q]', m.el).forEach((b) => (b.onclick = () => send(b.dataset.q)));
    $('#chatPhoto', m.el).onclick = async () => {
      const [f] = await pickImages();
      if (!f) return;
      try { toast('Fotoğraf gönderiliyor…'); const up = await uploadImage(f, 'chat'); send('', up.id); } catch (e) { fail(e); }
    };
    draw();
    return m;
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

  // Hizmet görselleri (müşteri tasarımındaki araç çizimleri)
  const svcImg = (k, cls = '') => `<img class="svc-img ${cls}" src="/img/svc-${k}.png" alt="" draggable="false">`;

  window.YK = { isIOS, isAndroid, isStandalone, pushSupported, installHelp, $, $$, h, I, svcImg, api, auth, tl, dt, d8, phoneFmt, initials, STATUS, statusBadge, toast, fail, modal, confirmBox, perms, getPosition, registerSW, enablePush, showLocalNotification, connectSocket, createMap, initMaps, initGoogle, gmapsReady, toggleMapType, mapTypeButton, truckIcon, pinIcon, meIcon, route, geocode, resolvePlace, reverseGeocode, alertSound, applyTheme, pickImages, compressImage, uploadImage, viewPhoto, photoStrip, bindPhotoStrips, otpModal, forgotPassword, openChat };
})();
