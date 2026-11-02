// Müşteri uygulaması
(function () {
  const { $, $$, h, I, svcImg, api, auth, tl, dt, phoneFmt, initials, statusBadge, toast, fail, modal, confirmBox, perms } = YK;
  const app = $('#app');
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('yk-m:' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('yk-m:' + k, JSON.stringify(v)); } catch {} },
  };

  const S = {
    cfg: null,
    user: null,
    tab: 'home',
    mode: 'idle', // idle | pickDrop | request | active
    map: null,
    center: null,
    pickupAddr: '',
    draft: { service: null, sub: 'aku', dropoff: null, code: '', payment: 'cash', note: '', vehicle: LS.get('vehicle', { plate: '', model: '' }) },
    quote: null,
    job: null,
    nearby: [],
    nearbyLayer: null,
    jobLayer: null,
    driverMarker: null,
    socket: null,
    unread: 0,
  };

  // ---------------- Açılış ----------------
  async function boot() {
    YK.registerSW();
    try { S.cfg = await api('/config'); } catch { S.cfg = { services: {}, roadside: {} }; }
    YK.initMaps(S.cfg);
    if (auth.token) {
      try { S.user = (await api('/me', { noLogout: true })).user; } catch { auth.token = null; }
    }
    if (!S.user) return renderAuth();
    if (!LS.get('permsDone', false)) return renderPerms();
    renderMain();
  }

  // ---------------- Giriş / Kayıt ----------------
  function renderAuth(mode = 'login') {
    const ref = new URLSearchParams(location.search).get('davet') || '';
    if (ref) mode = 'register';
    app.innerHTML = `
      <div class="screen full">
        <div class="hero">
          <div class="brand" style="display:inline-flex"><span class="logo"><img src="/icons/logo-64.png" alt=""></span>YOLDA KALDIK</div>
          <h1>Yolda mı kaldınız?<br><span>Çekiciniz dakikalar içinde</span> yanınızda.</h1>
          <p>Canlı takip, şeffaf fiyat, 7/24 kurtarma.</p>
          <svg class="road" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="1.5">${I.svc_oto.replace(/<\/?svg[^>]*>/g, '')}</svg>
        </div>
        <div class="page stack" style="margin-top:-6px">
          <div class="seg" id="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Giriş yap</button><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Hesap oluştur</button></div>
          <form id="f" class="stack" autocomplete="on">
            ${mode === 'register' ? '<label class="field"><span>Ad Soyad</span><input name="name" required autocomplete="name" placeholder="Adınız Soyadınız"></label>' : ''}
            <label class="field"><span>Cep telefonu</span><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>
            <label class="field"><span>Şifre</span><input name="password" type="password" required minlength="6" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="En az 6 karakter"></label>
            ${mode === 'register' ? `<label class="field"><span>Davet kodu (isteğe bağlı)</span><input name="referral" value="${h(ref)}" placeholder="Örn. YKAB12C" style="text-transform:uppercase"></label>` : ''}
            <button class="btn" type="submit">${mode === 'login' ? 'Giriş yap' : 'Hesabımı oluştur'}</button>
          </form>
          ${mode === 'login' ? '<button class="center small bold" id="forgot" style="width:100%;color:var(--brand-2)">Şifremi unuttum</button>' : '<p class="tiny muted center" style="margin:0">Kayıt için telefonunuza SMS ile doğrulama kodu gönderilir.</p>'}
          <p class="center small muted">Çekici / kurtarma firması mısınız?<br><a href="/cekici"><b>Çekici hesabı açın →</b></a></p>
        </div>
      </div>`;
    $$('#seg button').forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
    $('#forgot') && ($('#forgot').onclick = async () => {
      const r = await YK.forgotPassword('customer');
      if (!r) return;
      auth.token = r.token;
      S.user = r.user;
      toast('Şifreniz yenilendi ✅');
      LS.get('permsDone', false) ? renderMain() : renderPerms();
    });
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        let r;
        if (mode === 'login') r = await api('/auth/login', { body: { ...fd, role: 'customer' } });
        else {
          if (!fd.name || fd.name.trim().length < 2) throw new Error('Ad soyad girin');
          if ((fd.password || '').length < 6) throw new Error('Şifre en az 6 karakter olmalı');
          r = await YK.otpModal({
            phone: fd.phone,
            request: () => api('/auth/otp', { body: { phone: fd.phone, role: 'customer', purpose: 'register' } }),
            submit: (otp) => api('/auth/register', { body: { ...fd, role: 'customer', otp } }),
          });
          if (!r) return;
        }
        if (r.user.role === 'driver') { auth.token = null; throw new Error('Bu bir çekici hesabı. Çekici paneline yönlendiriliyorsunuz.'); }
        if (r.user.role === 'admin') { location.href = '/admin'; return; }
        auth.token = r.token;
        S.user = r.user;
        history.replaceState(null, '', '/');
        LS.get('permsDone', false) ? renderMain() : renderPerms();
      } catch (err) {
        fail(err);
        if (/çekici hesabı/.test(err.message)) setTimeout(() => (location.href = '/cekici'), 1200);
      } finally { btn.disabled = false; }
    };
  }

  // ---------------- İzin ekranı ----------------
  async function renderPerms() {
    const loc = await perms.location();
    const noti = perms.notification();
    const call = perms.call();
    const card = (k, icon, title, text, state) => `
      <div class="perm ${state === 'granted' ? 'ok' : ''}" data-k="${k}">
        <div class="pi">${icon}</div>
        <div class="pb"><b>${title}</b><span>${text}</span></div>
        ${state === 'granted' ? '<span class="badge green">Açık</span>' : state === 'denied' ? '<span class="badge red">Kapalı</span>' : state === 'unsupported' ? '<span class="badge">Desteklenmiyor</span>' : `<button class="btn sm" data-ask="${k}">İzin ver</button>`}
      </div>`;
    app.innerHTML = `
      <div class="screen full"><div class="page stack">
        <div class="brand" style="display:inline-flex;margin-top:8px"><span class="logo"><img src="/icons/logo-64.png" alt=""></span>YOLDA KALDIK</div>
        <h1 style="margin-top:20px">Size hızlı ulaşabilmemiz için birkaç izin</h1>
        <p class="muted" style="margin-top:-8px">İzinleri istediğiniz zaman Ayarlar'dan değiştirebilirsiniz.</p>
        ${card('loc', I.pin, 'Konum', 'Çekicinin sizi bulması ve en yakın aracı atamak için', loc)}
        ${card('noti', I.bell, 'Bildirimler', 'Çekici kabul ettiğinde, geldiğinde ve teslimde haber verelim', noti)}
        ${card('call', I.phone, 'Arama', 'Çekicinizle tek dokunuşla telefonla görüşün', call)}
        ${loc === 'denied' ? '<p class="small" style="color:var(--red)">Konum engellenmiş. Tarayıcının adres çubuğundaki kilit simgesinden konuma izin verin.</p>' : ''}
        <button class="btn dark" id="go">Devam et</button>
      </div></div>`;
    $$('[data-ask]').forEach((b) => (b.onclick = async () => {
      const k = b.dataset.ask;
      try {
        if (k === 'loc') { const p = await YK.getPosition(); S.center = p; }
        if (k === 'noti') await YK.enablePush(S.cfg.vapidPublicKey);
        if (k === 'call') perms.setCall('granted');
      } catch (e) { fail(e); }
      renderPerms();
    }));
    $('#go').onclick = () => { LS.set('permsDone', true); renderMain(); };
  }

  // ---------------- Ana iskelet ----------------
  function renderMain() {
    app.innerHTML = `
      <div class="screen full" id="homeScreen">
        <div id="map"></div>
        <div class="topbar">
          <div class="brand"><span class="logo"><img src="/icons/logo-64.png" alt=""></span>YOLDA KALDIK</div>
          <div class="grow"></div>
          <button class="icon-btn sos-btn" id="sosBtn" aria-label="Acil durum">${I.sos}</button>
          <button class="icon-btn" id="bellBtn" aria-label="Bildirimler">${I.bell}<span class="dot hidden" id="bellDot"></span></button>
        </div>
        <div class="center-pin" id="cpin"><div class="label" id="cpinLabel"><b>Alış</b>Konum alınıyor…</div><div class="head"></div><div class="stick"></div><div class="shadow"></div></div>
        <button class="icon-btn locate-btn" id="locBtn" aria-label="Konumuma git">${I.locate}</button>
        <div class="sheet over-tabs" id="sheet"><div class="grab"></div><div class="body"><div class="sheet-wrap" id="sheetBody"></div></div></div>
      </div>
      <div class="screen hidden" id="tabScreen"></div>
      <nav class="tabs" id="tabs">
        <button data-t="home" class="on">${I.home}<span>Anasayfa</span></button>
        <button data-t="jobs">${I.truck}<span>Kurtarmalarım</span></button>
        <button data-t="account">${I.user}<span>Hesap</span></button>
        <button data-t="settings">${I.gear}<span>Ayarlar</span></button>
      </nav>`;
    $$('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
    $('#bellBtn').onclick = openNotifications;
    $('#sosBtn').onclick = openSOS;
    loadScheduled();
    $('#locBtn').onclick = locateMe;
    initMap();
    connect();
    refreshUnread();
    loadActiveJob();
    // Push aboneliğini tazele (izin önceden verildiyse)
    if (perms.notification() === 'granted') YK.enablePush(S.cfg.vapidPublicKey).catch(() => {});
  }

  function setTab(t) {
    S.tab = t;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    $('#tabs [data-t=home]').innerHTML = (t === 'home' ? I.home : I.homeO) + '<span>Anasayfa</span>';
    const home = t === 'home';
    $('#homeScreen').classList.toggle('hidden', !home);
    $('#tabScreen').classList.toggle('hidden', home);
    if (home) setTimeout(() => S.map.invalidateSize(), 50);
    else ({ jobs: renderJobs, account: renderAccount, settings: renderSettings })[t]();
  }

  // ---------------- Harita ----------------
  function initMap() {
    const last = LS.get('lastCenter', null);
    const start = S.center || last || { lat: 40.9909, lng: 29.0303 };
    S.map = YK.createMap('map', [start.lat, start.lng], 15);
    S.nearbyLayer = L.layerGroup().addTo(S.map);
    S.typeBtn = YK.mapTypeButton(S.map);
    $('#homeScreen').appendChild(S.typeBtn);
    S.jobLayer = L.layerGroup().addTo(S.map);
    positionPin();
    window.addEventListener('resize', positionPin);
    S.map.on('movestart', () => $('#cpin').classList.add('lift'));
    let t;
    S.map.on('moveend', () => {
      $('#cpin').classList.remove('lift');
      const c = S.map.getCenter();
      S.center = { lat: c.lat, lng: c.lng };
      LS.set('lastCenter', S.center);
      clearTimeout(t);
      t = setTimeout(onCenterSettled, 350);
    });
    onCenterSettled();
    locateMe(true);
    setInterval(() => S.mode !== 'active' && S.tab === 'home' && loadNearby(), 15000);
    renderSheet();
  }
  function positionPin() {
    // Pin, sayfanın görünen harita alanının ortasında olsun (alt sayfa hariç)
    const sheetH = $('#sheet')?.offsetHeight || 0;
    const visible = window.innerHeight - sheetH - 72;
    const y = Math.max(140, 70 + visible / 2);
    $('#cpin').style.top = y + 'px';
    $('#locBtn').style.top = Math.max(120, y - 10) + 'px';
    if (S.typeBtn) S.typeBtn.style.top = Math.max(120, y - 10) + 54 + 'px';
    if (S.map) {
      S.map.invalidateSize();
    }
    S.pinOffsetY = y - window.innerHeight / 2;
  }
  function pinLatLng() {
    // Haritanın merkezi değil, pinin bulunduğu ekran noktası
    const pt = S.map.getSize().divideBy(2).add([0, S.pinOffsetY || 0]);
    const ll = S.map.containerPointToLatLng(pt);
    return { lat: ll.lat, lng: ll.lng };
  }
  function panToPin(p, zoom) {
    const z = zoom || S.map.getZoom();
    const pt = S.map.project([p.lat, p.lng], z).subtract([0, S.pinOffsetY || 0]);
    S.map.setView(S.map.unproject(pt, z), z);
  }
  async function onCenterSettled() {
    if (S.mode === 'active') return;
    const p = pinLatLng();
    if (S.mode === 'pickDrop') {
      $('#cpinLabel').innerHTML = '<b>Varış</b>' + h(await YK.reverseGeocode(p));
      return;
    }
    if (S.mode !== 'idle') return;
    S.pickup = p;
    if (S.pendingPickupAddr) {
      S.pickupAddr = S.pendingPickupAddr;
      S.pendingPickupAddr = null;
    } else {
      $('#cpinLabel').innerHTML = '<b>Alış</b>Adres bulunuyor…';
      S.pickupAddr = await YK.reverseGeocode(p);
    }
    if (S.mode === 'idle') {
      $('#cpinLabel').innerHTML = '<b>Alış</b>' + h(S.pickupAddr);
      const pt = $('#pickTxt');
      if (pt) pt.textContent = S.pickupAddr;
    }
    loadNearby();
  }
  // Aramadan seçilen alış noktası: pini oraya taşı, adresi koru
  function setPickup(p) {
    if (!p) return;
    S.pendingPickupAddr = p.address || null;
    if (S.mode !== 'idle') { S.mode = 'idle'; renderSheet(); }
    panToPin(p, 16);
    toast('Alış noktası seçildi', 'Pin konumunu gerekirse kaydırarak düzeltebilirsiniz');
  }
  async function locateMe(silent) {
    try {
      const p = await YK.getPosition();
      S.myPos = p;
      if (!S.meMarker) S.meMarker = L.marker([p.lat, p.lng], { icon: YK.meIcon(), interactive: false }).addTo(S.map);
      else S.meMarker.setLatLng([p.lat, p.lng]);
      if (S.mode === 'idle' || S.mode === 'pickDrop' || silent !== true) panToPin(p, 16);
    } catch (e) {
      if (silent !== true) fail(e);
    }
  }
  async function loadNearby() {
    if (!S.pickup) return;
    try {
      const r = await api(`/nearby?lat=${S.pickup.lat}&lng=${S.pickup.lng}`);
      S.nearby = r.drivers;
      S.nearbyLayer.clearLayers();
      r.drivers.forEach((d) => L.marker([d.lat, d.lng], { icon: YK.truckIcon(), interactive: false }).addTo(S.nearbyLayer));
      if (S.mode === 'idle') updateEtas();
    } catch {}
  }
  function etaFor(svc) {
    const list = S.nearby.filter((d) => d.services.includes(svc));
    return list.length ? Math.min(...list.map((d) => d.eta)) : null;
  }
  function updateEtas() {
    $$('.svc[data-s]').forEach((el) => {
      const e = etaFor(el.dataset.s);
      const tag = el.querySelector('.eta');
      if (!tag) return;
      tag.innerHTML = e ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>${e} dk` : 'Yoğun';
      tag.classList.toggle('none', !e);
    });
  }

  // ---------------- Alt sayfa içerikleri ----------------
  function setSheet(html) {
    $('#sheetBody').innerHTML = html;
    requestAnimationFrame(positionPin);
  }
  function renderSheet() {
    $('#cpin').classList.toggle('hidden', !(S.mode === 'idle' || S.mode === 'pickDrop'));
    $('#sheet').classList.toggle('compact', S.mode === 'idle' || S.mode === 'pickDrop');
    if (S.mode === 'idle') return sheetIdle();
    if (S.mode === 'pickDrop') return sheetPickDrop();
    if (S.mode === 'request') return sheetRequest();
    if (S.mode === 'active') return sheetActive();
  }

  const svcCard = (k, s) => `
    <button class="svc" data-s="${k}">
      <span class="eta none">…</span>
      <span class="pic">${svcImg(k)}</span>
      <span class="name">${h(s.name.toLocaleUpperCase('tr-TR'))}</span>
      <span class="desc">${h(s.desc)}</span>
    </button>`;

  function sheetIdle() {
    const u = S.user;
    const addrs = u.addresses || [];
    S.jobLayer.clearLayers();
    setSheet(`
      <div class="promo-strip"><div class="t">Arkadaşını davet et, <span>250 TL kurtarma çeki</span> kazan!</div><button id="inviteBtn">Davet et</button></div>
      ${(S.scheduled || []).map((j) => `<button class="sched-banner" data-sj="${j.id}">${I.cal}<span class="grow"><b>Randevulu: ${h(fmtWhen(j.scheduledAt))}</b><br><span class="muted">${h(S.cfg.services[j.service]?.name)} · ${h(j.pickup.address || '')}</span></span><span class="chev">${I.chev}</span></button>`).join('')}
      <div class="route-box">
        <button class="rb-row" id="pickBtn"><span class="rb-dot a"></span><span class="grow"><span class="rb-k">ALIŞ NOKTASI · aracın bulunduğu yer</span><span class="rb-v ellipsis" id="pickTxt">${h(S.pickupAddr || 'Konum alınıyor…')}</span></span><span class="rb-ic">${I.search}</span></button>
        <div class="rb-sep"></div>
        <button class="rb-row" id="destBtn"><span class="rb-dot b"></span><span class="grow"><span class="rb-k">VARIŞ NOKTASI</span><span class="rb-v ellipsis ${S.draft.dropoff ? '' : 'muted'}">${S.draft.dropoff ? h(S.draft.dropoff.address) : 'Nereye çekilecek?'}</span></span><span class="rb-ic">${S.draft.dropoff ? `<span id="clrDest">${I.x}</span>` : I.search}</span></button>
      </div>
      <div class="chips">
        ${addrs.map((a, i) => `<button class="chip" data-a="${i}">${I.pin}${h(a.label)}</button>`).join('')}
        <button class="chip" id="addAddr">+ Yeni adres ekle</button>
      </div>
      <div class="services">${Object.entries(S.cfg.services).map(([k, s]) => svcCard(k, s)).join('')}</div>
      <h2 style="margin:20px 0 10px;font-size:17px">Acil durumlarda yanınızdayız</h2>
      <div class="carousel">
        <div class="banner promo">
          <div class="promo-top"><div><div class="big">%30<small>'a varan</small></div><div class="tiny bold" style="color:var(--brand-2);margin-top:2px">Kod: ILK30</div></div><img src="/img/promo-tow.png" alt="" draggable="false"></div>
          <div class="cap"><span class="pc">%</span>İLK KEZ KULLANANLARA İNDİRİM</div>
        </div>
        <div class="banner dark"><div class="big">7/24</div><div class="cap">CANLI TAKİP · SİGORTALI TAŞIMA</div>
          <svg class="art" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.2">${I.shield.replace(/<\/?svg[^>]*>/g, '')}</svg></div>
        <div class="banner amber"><div class="big">${u.credits ? tl(u.credits) : '250 TL'}</div><div class="cap">${u.credits ? 'KURTARMA ÇEKİNİZ HAZIR' : 'HER DAVETE KURTARMA ÇEKİ'}</div>
          <svg class="art" viewBox="0 0 24 24" fill="none" stroke="#b86e00" stroke-width="1.2">${I.gift.replace(/<\/?svg[^>]*>/g, '')}</svg></div>
      </div>
      <div style="height:6px"></div>`);
    $('#inviteBtn').onclick = shareInvite;
    $$('[data-sj]').forEach((b) => (b.onclick = () => jobDetail(S.scheduled.find((x) => x.id === b.dataset.sj))));
    $('#pickBtn').onclick = () => openDestSearch((p) => setPickup(p), 'Aracınız nerede?', 'idle', 'pickup');
    $('#destBtn').onclick = (e) => {
      if (e.target.closest('#clrDest')) { S.draft.dropoff = null; return sheetIdle(); }
      openDestSearch((p) => { S.draft.dropoff = p; sheetIdle(); toast('Varış noktası seçildi', 'Şimdi hizmet türünü seçin'); });
    };
    $$('.chip[data-a]').forEach((c) => (c.onclick = () => {
      const a = addrs[+c.dataset.a];
      S.draft.dropoff = { lat: a.lat, lng: a.lng, address: a.label + ' · ' + a.address };
      sheetIdle();
      toast(`Varış: ${a.label}`, 'Şimdi hizmet türünü seçin');
    }));
    $('#addAddr').onclick = addAddressFlow;
    $$('.svc[data-s]').forEach((b) => (b.onclick = () => startRequest(b.dataset.s)));
    updateEtas();
  }

  function startRequest(service) {
    if (!S.pickup) return toast('Konum bekleniyor', 'Haritayı kurtarma noktasına getirin', true);
    S.draft.service = service;
    S.draft.pickup = { ...S.pickup, address: S.pickupAddr };
    const needsDrop = S.cfg.services[service].needsDropoff;
    if (needsDrop && !S.draft.dropoff) {
      return openDestSearch((p) => { S.draft.dropoff = p; S.mode = 'request'; renderSheet(); drawDraft(); }, 'Aracınız nereye çekilecek?');
    }
    S.mode = 'request';
    renderSheet();
    drawDraft();
  }

  function drawDraft() {
    S.jobLayer.clearLayers();
    const d = S.draft;
    const pts = [[d.pickup.lat, d.pickup.lng]];
    L.marker(pts[0], { icon: YK.pinIcon() }).addTo(S.jobLayer);
    if (d.dropoff && S.cfg.services[d.service].needsDropoff) {
      pts.push([d.dropoff.lat, d.dropoff.lng]);
      L.marker(pts[1], { icon: YK.pinIcon('drop') }).addTo(S.jobLayer);
      YK.route(d.pickup, d.dropoff).then((r) => {
        if (S.mode !== 'request') return;
        L.polyline(r.coords, { color: '#0b2b33', weight: 5, opacity: 0.85, dashArray: r.km ? null : '8 8' }).addTo(S.jobLayer);
      });
    }
    setTimeout(() => {
      const sheetH = $('#sheet').offsetHeight;
      S.map.fitBounds(L.latLngBounds(pts).pad(0.3), { paddingTopLeft: [30, 90], paddingBottomRight: [30, sheetH + 20], maxZoom: 16 });
    }, 60);
  }

  function sheetPickDrop() {
    setSheet(`
      <div class="row" style="margin:4px 0 12px"><button class="icon-btn" id="pdBack" style="box-shadow:none;background:var(--chip)">${I.back}</button><div class="grow"><b>Varış noktasını seçin</b><div class="small muted">Haritayı kaydırarak pini hedefe getirin</div></div></div>
      <button class="btn dark" id="pdOk">Bu noktayı seç</button>`);
    $('#pdBack').onclick = () => { S.mode = S.pickDropReturn || 'idle'; S.pickDropCb = null; renderSheet(); if (S.mode === 'request') drawDraft(); };
    $('#pdOk').onclick = async () => {
      const p = pinLatLng();
      const addr = await YK.reverseGeocode(p);
      const cb = S.pickDropCb;
      S.mode = S.pickDropReturn === 'request' ? 'request' : 'idle';
      if (S.mode === 'idle' && S.draft.pickup) panToPin(S.draft.pickup);
      cb && cb({ ...p, address: addr });
      renderSheet();
    };
  }

  async function sheetRequest() {
    const d = S.draft;
    const s = S.cfg.services[d.service];
    $('#cpin').classList.add('hidden');
    setSheet(`
      <div class="row" style="margin:2px 0 10px">
        <button class="icon-btn" id="rqBack" style="box-shadow:none;background:var(--chip)">${I.back}</button>
        <div class="grow"><div class="bold" style="font-size:17px">${h(s.name)}</div><div class="small muted">${h(s.desc)}</div></div>
        <span class="thumb">${svcImg(d.service)}</span>
      </div>
      ${!s.needsDropoff ? `<div class="chips" style="padding-top:0">${Object.values(S.cfg.roadside).map((r) => `<button class="chip ${d.sub === r.key ? 'on' : ''}" data-sub="${r.key}">${h(r.name)} · ${tl(r.price)}</button>`).join('')}</div>` : ''}
      <div class="list" style="box-shadow:none;border:1.5px solid var(--line);margin-top:6px">
        <button class="li" id="editPick"><span class="lic" style="background:var(--brand-soft);color:var(--brand-2)">${I.pin}</span><span class="grow"><span class="tiny muted bold">ALIŞ NOKTASI</span><br><span class="ellipsis" style="display:block">${h(d.pickup.address || 'Seçilen konum')}</span></span><span class="chev">${I.chev}</span></button>
        ${s.needsDropoff ? `<button class="li" id="editDrop"><span class="lic" style="background:var(--ink);color:#fff">${I.nav}</span><span class="grow"><span class="tiny muted bold">VARIŞ NOKTASI</span><br><span class="ellipsis" style="display:block">${h(d.dropoff?.address || 'Seçin')}</span></span><span class="chev">${I.chev}</span></button>` : ''}
      </div>
      ${s.needsDropoff ? `<label class="kasko ${d.kasko ? 'on' : ''}" id="kaskoBox"><input type="checkbox" id="kaskoIn" ${d.kasko ? 'checked' : ''}>
        <span class="k-ic">${I.shield}</span><span class="grow"><b>Kasko güvencesi</b> <span class="k-price">+${tl(S.cfg.kaskoPrice || 350)}</span><br><span class="small muted">Yükleme, çekme ve indirme sırasında aracınızda oluşabilecek hasarlar güvence altında.</span></span></label>` : ''}
      <div class="row" style="margin-top:12px">
        <label class="field grow"><span>Plaka</span><input id="vPlate" value="${h(d.vehicle.plate)}" placeholder="34 ABC 123" style="text-transform:uppercase"></label>
        <label class="field grow"><span>Marka / model</span><input id="vModel" value="${h(d.vehicle.model)}" placeholder="Örn. Renault Clio"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Çekiciye not (isteğe bağlı)</span><input id="vNote" value="${h(d.note)}" placeholder="Örn. Otoparkın -2. katındayım, vites P'de"></label>
      <div style="margin-top:12px" class="seg" id="whenSeg"><button data-w="now" class="${!d.scheduledAt ? 'on' : ''}">Hemen</button><button data-w="later" class="${d.scheduledAt ? 'on' : ''}">${I.cal.replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} İleri tarih</button></div>
      <label class="field ${d.scheduledAt ? '' : 'hidden'}" id="whenBox" style="margin-top:10px"><span>Çekici ne zaman gelsin?</span><input type="datetime-local" id="whenIn" value="${h(d.scheduledAt ? toLocalInput(new Date(d.scheduledAt)) : '')}" min="${toLocalInput(new Date(Date.now() + 31 * 60000))}" max="${toLocalInput(new Date(Date.now() + 14 * 86400000))}"></label>
      <div style="margin-top:12px" class="seg" id="paySeg"><button data-p="cash" class="${d.payment === 'cash' ? 'on' : ''}">Nakit</button><button data-p="card" class="${d.payment === 'card' ? 'on' : ''}">Kredi kartı (POS)</button></div>
      <div class="row" style="margin-top:12px"><input class="input grow" id="codeIn" value="${h(d.code)}" placeholder="İndirim kodu" style="text-transform:uppercase"><button class="btn sm ghost" id="codeBtn">${d.code ? 'Kaldır' : 'Uygula'}</button></div>
      <div id="qBox" class="price-lines" style="margin-top:12px"><div class="muted small">Fiyat hesaplanıyor…</div></div>
      <button class="btn" id="callBtn" style="margin-top:14px" disabled>${I.tow} Çekici çağır</button>
      <p class="tiny muted center" style="margin:8px 0 0">Ödeme hizmet tamamlandığında çekiciye yapılır. Kabulden sonra iptal ücretsizdir.</p>`);
    $('#rqBack').onclick = () => { S.mode = 'idle'; S.jobLayer.clearLayers(); renderSheet(); panToPin(d.pickup); };
    $('#editPick').onclick = () => openDestSearch((p) => { d.pickup = p; S.pickupAddr = p.address; sheetRequest(); drawDraft(); }, 'Aracınız nerede?', 'request', 'pickup');
    $('#editDrop') && ($('#editDrop').onclick = () => openDestSearch((p) => { d.dropoff = p; sheetRequest(); drawDraft(); }, 'Aracınız nereye çekilecek?', 'request'));
    $$('[data-sub]').forEach((b) => (b.onclick = () => { d.sub = b.dataset.sub; sheetRequest(); }));
    $$('#whenSeg button').forEach((b) => (b.onclick = () => {
      if (b.dataset.w === 'now') { d.scheduledAt = null; sheetRequest(); return; }
      const def = new Date(Date.now() + 24 * 3600000);
      def.setMinutes(0, 0, 0);
      def.setHours(9);
      d.scheduledAt = def.toISOString();
      sheetRequest();
    }));
    $('#whenIn').onchange = (e) => { if (e.target.value) { d.scheduledAt = new Date(e.target.value).toISOString(); loadQuote(); } };
    $$('#paySeg button').forEach((b) => (b.onclick = () => { d.payment = b.dataset.p; $$('#paySeg button').forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#kaskoIn') && ($('#kaskoIn').onchange = (e) => { d.kasko = e.target.checked; $('#kaskoBox').classList.toggle('on', d.kasko); loadQuote(); });
    $('#vPlate').oninput = (e) => (d.vehicle.plate = e.target.value.toUpperCase());
    $('#vModel').oninput = (e) => (d.vehicle.model = e.target.value);
    $('#vNote').oninput = (e) => (d.note = e.target.value);
    $('#codeBtn').onclick = () => {
      if (d.code) { d.code = ''; sheetRequest(); return; }
      d.code = $('#codeIn').value.trim().toUpperCase();
      if (d.code) loadQuote(true);
    };
    $('#callBtn').onclick = createJob;
    loadQuote();
  }

  async function loadQuote(fromCode) {
    const d = S.draft;
    try {
      const q = await api('/quote', { body: { service: d.service, sub: d.sub, pickup: d.pickup, dropoff: d.dropoff, code: d.code, scheduledAt: d.scheduledAt, kasko: !!d.kasko } });
      S.quote = q;
      if (q.codeError) {
        toast(q.codeError, '', true);
        d.code = '';
        if (fromCode) return sheetRequest();
      } else if (fromCode && q.code) {
        toast('Kod uygulandı 🎉', q.code.label);
        $('#codeBtn').textContent = 'Kaldır';
      }
      $('#qBox').innerHTML = `
        ${q.lines.map((l) => `<div class="pl ${l.kasko ? 'kasko-line' : ''}"><span>${l.kasko ? '🛡️ ' : ''}${h(l.label)}</span><span>${tl(l.amount)}</span></div>`).join('')}
        ${q.distanceKm ? `<div class="tiny muted" style="margin:-2px 0 4px">${q.routed ? 'Yol rotasına göre mesafe' : 'Tahmini yol mesafesi'} · ${q.distanceKm} km</div>` : ''}
        ${q.discount ? `<div class="pl disc"><span>İndirim (${h(q.code.code)})</span><span>−${tl(q.discount)}</span></div>` : ''}
        ${q.credit ? `<div class="pl disc"><span>Kurtarma çeki</span><span>−${tl(q.credit)}</span></div>` : ''}
        <div class="pl total"><span>Toplam</span><span>${tl(q.total)}</span></div>`;
      const btn = $('#callBtn');
      btn.disabled = false;
      btn.innerHTML = d.scheduledAt ? `${I.cal} Randevu oluştur · ${tl(q.total)}` : `${I.tow} Çekici çağır · ${tl(q.total)}`;
    } catch (e) { fail(e); }
  }

  async function createJob() {
    const d = S.draft;
    const btn = $('#callBtn');
    btn.disabled = true;
    try {
      LS.set('vehicle', d.vehicle);
      const r = await api('/jobs', { body: { service: d.service, sub: d.sub, pickup: d.pickup, dropoff: d.dropoff, code: d.code, payment: d.payment, vehicle: d.vehicle, note: d.note, scheduledAt: d.scheduledAt, kasko: !!d.kasko } });
      S.draft = { service: null, sub: 'aku', dropoff: null, code: '', payment: 'cash', note: '', vehicle: d.vehicle, scheduledAt: null, kasko: false };
      if (r.job.status === 'scheduled') {
        S.mode = 'idle';
        S.jobLayer.clearLayers();
        await loadScheduled();
        renderSheet();
        panToPin(r.job.pickup);
      } else setJob(r.job);
      if (perms.notification() === 'prompt') {
        setTimeout(() => confirmBox('Bildirimleri açalım mı?', 'Uygulamayı kapatsanız bile çekici kabul ettiğinde ve geldiğinde haber verelim.', 'Bildirimleri aç').then((ok) => ok && YK.enablePush(S.cfg.vapidPublicKey).catch(fail)), 800);
      }
    } catch (e) { fail(e); btn.disabled = false; }
  }

  // ---------------- Aktif talep ----------------
  async function loadActiveJob() {
    try {
      const r = await api('/jobs/active');
      if (r.job) setJob(r.job);
    } catch {}
  }
  function setJob(job) {
    if (job && job.status === 'scheduled') { loadScheduled().then(() => S.mode === 'idle' && renderSheet()); return; }
    const prev = S.job;
    S.job = job;
    if (!job) return;
    if (!prev || prev.id !== job.id) S.unreadChat = 0;
    if (['completed', 'cancelled', 'expired'].includes(job.status)) {
      S.mode = 'idle';
      S.job = null;
      S.driverMarker = null;
      S.jobLayer.clearLayers();
      renderSheet();
      if (job.pickup) panToPin(job.pickup);
      if (job.status === 'completed' && !job.rating) openRating(job);
      if (job.status === 'expired') toast('Şu an müsait çekici bulunamadı', 'Lütfen birkaç dakika sonra tekrar deneyin.', true);
      refreshUser();
      return;
    }
    S.mode = 'active';
    S.nearbyLayer.clearLayers();
    if (S.socket && (!prev || prev.id !== job.id)) S.socket.emit('job:watch', job.id);
    if (!prev || prev.id !== job.id || prev.status !== job.status) drawJob(job);
    renderSheet();
  }
  function drawJob(job) {
    S.jobLayer.clearLayers();
    S.driverMarker = null;
    L.marker([job.pickup.lat, job.pickup.lng], { icon: YK.pinIcon() }).addTo(S.jobLayer);
    const pts = [[job.pickup.lat, job.pickup.lng]];
    if (job.dropoff) {
      L.marker([job.dropoff.lat, job.dropoff.lng], { icon: YK.pinIcon('drop') }).addTo(S.jobLayer);
      pts.push([job.dropoff.lat, job.dropoff.lng]);
    }
    const dr = job.driver;
    if (dr && dr.lat != null) {
      S.driverMarker = L.marker([dr.lat, dr.lng], { icon: YK.truckIcon(true), zIndexOffset: 1000 }).addTo(S.jobLayer);
      pts.push([dr.lat, dr.lng]);
      const target = job.status === 'towing' ? job.dropoff : job.pickup;
      if (target) YK.route({ lat: dr.lat, lng: dr.lng }, target).then((r) => S.mode === 'active' && L.polyline(r.coords, { color: '#ea580c', weight: 6, opacity: 0.9 }).addTo(S.jobLayer));
    } else if (job.dropoff) {
      L.polyline(pts, { color: '#0b2b33', weight: 4, opacity: 0.6, dashArray: '8 8' }).addTo(S.jobLayer);
    }
    setTimeout(() => {
      const sheetH = $('#sheet').offsetHeight;
      S.map.fitBounds(L.latLngBounds(pts).pad(0.25), { paddingTopLeft: [30, 90], paddingBottomRight: [30, sheetH + 20], maxZoom: 16 });
    }, 80);
  }
  function onDriverLoc(p) {
    if (!S.job || p.jobId !== S.job.id) return;
    S.job.eta = p.eta;
    if (!S.driverMarker) S.driverMarker = L.marker([p.lat, p.lng], { icon: YK.truckIcon(true), zIndexOffset: 1000 }).addTo(S.jobLayer);
    else S.driverMarker.setLatLng([p.lat, p.lng]);
    const e = $('#etaVal');
    if (e && p.eta) e.textContent = p.eta;
  }

  function sheetActive() {
    const j = S.job;
    const svc = S.cfg.services[j.service];
    if (j.status === 'searching') {
      setSheet(`
        <div class="radar"><i></i><i></i><i></i><div class="core">${I.tow}</div></div>
        <div class="center"><div class="bold" style="font-size:18px">Size en yakın çekici aranıyor</div>
        <div class="muted small" style="margin-top:4px">${h(svc.name)} · ${tl(j.price.total)} · ${j.no}</div></div>
        <div class="card flat small" style="margin-top:14px"><div class="row"><span style="color:var(--brand-2)">${I.pin}</span><span class="grow ellipsis">${h(j.pickup.address)}</span></div>
        ${j.dropoff ? `<div class="row" style="margin-top:8px"><span>${I.nav}</span><span class="grow ellipsis">${h(j.dropoff.address)}</span></div>` : ''}</div>
        <button class="btn danger" id="cancelBtn" style="margin-top:14px">Talebi iptal et</button>`);
      $('#cancelBtn').onclick = cancelJob;
      return;
    }
    const d = j.driver || {};
    const order = j.dropoff ? ['accepted', 'arrived', 'towing', 'completed'] : ['accepted', 'arrived', 'servicing', 'completed'];
    const idx = order.indexOf(j.status);
    const waitingPin = j.status === 'arrived' && !j.verified;
    const title = { accepted: 'Çekiciniz yolda', arrived: waitingPin ? 'Çekiciniz geldi · kodu söyleyin' : 'Eşleşme doğrulandı', towing: 'Aracınız çekiliyor', servicing: 'Yol yardımı yapılıyor' }[j.status];
    const sub = { accepted: 'Aracınızın yanında güvenli bir yerde bekleyin', arrived: waitingPin ? 'Plakayı kontrol edin, ardından eşleşme kodunu çekiciye söyleyin' : 'Çekici aracınızı hazırlıyor', towing: 'Varış noktasına canlı takip ediliyor', servicing: 'İşlem tamamlanınca bildirim alacaksınız' }[j.status];
    setSheet(`
      <div class="row between" style="margin-top:4px">
        <div class="grow"><div class="bold" style="font-size:19px">${title}</div><div class="small muted">${sub}</div></div>
        ${j.status === 'accepted' || j.status === 'towing' ? `<div class="eta-pill"><b id="etaVal">${j.eta || '–'}</b><span>dakika</span></div>` : ''}
      </div>
      <div class="steps">${order.map((s, i) => `<div class="s ${i < idx ? 'on' : i === idx ? 'now' : ''}"></div>`).join('')}</div>
      ${j.pin && ['accepted', 'arrived'].includes(j.status) && !j.verified ? `
        <div class="pin-card ${waitingPin ? 'live' : ''}">
          <div class="grow"><div class="tiny bold" style="opacity:.75;letter-spacing:.06em">EŞLEŞME KODUNUZ</div>
          <div class="small" style="opacity:.85;margin-top:2px">${waitingPin ? 'Kodu yalnızca plakası eşleşen çekiciye söyleyin' : 'Çekici geldiğinde bu kodu söyleyin. Kod olmadan aracınız teslim alınamaz.'}</div></div>
          <div class="pin-digits">${j.pin.split('').map((c) => `<b>${c}</b>`).join('')}</div>
        </div>` : ''}
      ${j.verified && ['arrived', 'towing', 'servicing'].includes(j.status) ? `<div class="pin-ok">${I.shield}<span>Eşleşme doğrulandı · doğru çekici</span></div>` : ''}
      <div class="driver-card" style="margin-top:12px">
        <div class="avatar">${initials(d.name)}</div>
        <div class="grow"><div class="bold">${h(d.name || 'Çekici')}</div><div class="small muted">${h(d.vehicle || svc.name)} · ★ ${d.rating ?? '5.0'}</div></div>
        <span class="plate">${h(d.plate || '')}</span>
      </div>
      <div class="actions">
        <button class="act call" id="callDrv">${I.phone}Ara</button>
        <button class="act" id="chatBtn">${I.msg}Mesaj${S.unreadChat ? `<i class="cdot">${S.unreadChat}</i>` : ''}</button>
        ${['accepted', 'arrived'].includes(j.status) ? `<button class="act red" id="cancelBtn">${I.x}İptal</button>` : `<button class="act" id="shareBtn">${I.share}Paylaş</button>`}
      </div>
      ${j.photos?.pickup?.length ? `<div style="margin-top:12px"><div class="tiny bold muted" style="margin-bottom:6px">YÜKLEME ÖNCESİ FOTOĞRAFLAR</div>${YK.photoStrip(j.photos.pickup)}</div>` : ''}
      ${j.photos?.dropoff?.length ? `<div style="margin-top:10px"><div class="tiny bold muted" style="margin-bottom:6px">TESLİM FOTOĞRAFLARI</div>${YK.photoStrip(j.photos.dropoff)}</div>` : ''}
      ${j.kasko ? `<div class="pin-ok" style="margin-top:10px">${I.shield}<span>Kasko güvenceli taşıma</span></div>` : ''}
      <details style="margin-top:14px"><summary class="small bold" style="cursor:pointer">Talep detayı · ${j.no} · ${tl(j.price.total)}</summary>
        <div class="price-lines" style="margin-top:8px">${j.price.lines.map((l) => `<div class="pl"><span>${h(l.label)}</span><span>${tl(l.amount)}</span></div>`).join('')}
        ${j.price.discount ? `<div class="pl disc"><span>İndirim</span><span>−${tl(j.price.discount)}</span></div>` : ''}${j.price.credit ? `<div class="pl disc"><span>Kurtarma çeki</span><span>−${tl(j.price.credit)}</span></div>` : ''}
        <div class="pl total"><span>${j.payment === 'card' ? 'Kartla ödenecek' : 'Nakit ödenecek'}</span><span>${tl(j.price.total)}</span></div></div>
      </details>`);
    $('#callDrv').onclick = () => callNumber(d.phone, d.name);
    $('#chatBtn').onclick = () => {
      S.unreadChat = 0;
      S.chatOpen = true;
      $('#chatBtn .cdot')?.remove();
      YK.openChat({ job: S.job, me: 'customer', socket: S.socket, onClose: () => (S.chatOpen = false) });
    };
    YK.bindPhotoStrips($('#sheetBody'));
    $('#cancelBtn') && ($('#cancelBtn').onclick = cancelJob);
    $('#shareBtn') && ($('#shareBtn').onclick = () => {
      const text = `Aracım ${d.plate} plakalı çekiciyle ${j.dropoff ? j.dropoff.address : ''} adresine çekiliyor. Tahmini varış ${j.eta || '?'} dk. — Yolda Kaldık`;
      navigator.share ? navigator.share({ text }).catch(() => {}) : (navigator.clipboard?.writeText(text), toast('Kopyalandı'));
    });
  }

  async function callNumber(phone, name) {
    if (!phone) return;
    if (perms.call() !== 'granted') {
      const ok = await confirmBox('Arama izni', `${name || 'Çekici'} ile telefon uygulamanız üzerinden görüşmek için arama izni verin.`, 'İzin ver ve ara');
      if (!ok) return;
      perms.setCall('granted');
    }
    location.href = 'tel:0' + phone;
  }
  async function cancelJob() {
    const ok = await confirmBox('Talebi iptal et', 'Kurtarma talebiniz iptal edilecek. Emin misiniz?', 'İptal et', true);
    if (!ok) return;
    try { const r = await api(`/jobs/${S.job.id}/cancel`, { body: { reason: 'Müşteri vazgeçti' } }); setJob(r.job); toast('Talebiniz iptal edildi'); } catch (e) { fail(e); }
  }

  function openRating(job) {
    let stars = 5;
    const m = modal(`
      <div class="center"><div class="avatar" style="margin:0 auto">${initials(job.driver?.name)}</div>
      <h3 style="margin-top:10px">Kurtarma tamamlandı</h3>
      <p class="muted" style="margin-top:-6px">${h(job.driver?.name || '')} hizmetini nasıl buldunuz?</p></div>
      <div class="stars" id="stars">${[1, 2, 3, 4, 5].map((i) => `<button data-v="${i}" class="on">★</button>`).join('')}</div>
      <label class="field"><span>Yorum (isteğe bağlı)</span><textarea id="rc" placeholder="Hızlı ve özenliydi…"></textarea></label>
      <div class="card flat row between" style="margin-top:12px"><span class="muted">Ödenecek tutar</span><b style="font-size:18px">${tl(job.price.total)}</b></div>
      <button class="btn" id="rOk" style="margin-top:14px">Gönder</button>`);
    $$('#stars button', m.el).forEach((b) => (b.onclick = () => { stars = +b.dataset.v; $$('#stars button', m.el).forEach((x) => x.classList.toggle('on', +x.dataset.v <= stars)); }));
    $('#rOk', m.el).onclick = async () => {
      try { await api(`/jobs/${job.id}/rate`, { body: { stars, comment: $('#rc', m.el).value } }); m.close(); toast('Teşekkürler!', 'Değerlendirmeniz çekiciye iletildi.'); } catch (e) { fail(e); }
    };
  }

  // ---------------- Varış arama ----------------
  function openDestSearch(cb, title = 'Nereye çekilecek?', returnMode, kind = 'dropoff') {
    const addrs = S.user.addresses || [];
    const isPick = kind === 'pickup';
    const m = modal(`
      <h3>${h(title)}</h3>
      <div class="search" style="padding:10px 14px">${I.search}<input id="dq" placeholder="${isPick ? 'Aracınızın bulunduğu adres, cadde, mevki…' : 'Adres, sanayi sitesi, servis ara…'}" autocomplete="off"></div>
      <div id="dres" style="margin-top:6px">
        ${isPick ? `<button class="result" id="useMyLoc">${I.locate}<span><b>Mevcut konumum</b><br><span class="small muted">Telefonunuzun GPS konumunu kullan</span></span></button>` : ''}
        <button class="result" id="pickOnMap">${I.pin}<span><b>Haritadan seç</b><br><span class="small muted">${isPick ? 'Pini aracın bulunduğu yere getirin' : 'Pini sürükleyerek varış noktasını belirleyin'}</span></span></button>
        ${addrs.map((a, i) => `<button class="result" data-i="${i}">${I.home}<span><b>${h(a.label)}</b><br><span class="small muted">${h(a.address)}</span></span></button>`).join('')}
        <div class="small muted" style="padding:10px 4px">Örnek: “Ostim Sanayi”, “Pendik Yetkili Servis”, “İkitelli Oto Sanayi”</div>
      </div>`);
    const input = $('#dq', m.el);
    setTimeout(() => input.focus(), 250);
    $('#useMyLoc', m.el) && ($('#useMyLoc', m.el).onclick = async () => {
      try { const p = await YK.getPosition(); m.close(); const address = await YK.reverseGeocode(p); cb({ lat: p.lat, lng: p.lng, address }); } catch (e) { fail(e); }
    });
    $('#pickOnMap', m.el).onclick = () => {
      m.close();
      if (isPick) {
        if (S.mode !== 'idle') { S.mode = 'idle'; renderSheet(); if (S.draft.pickup) panToPin(S.draft.pickup); }
        toast('Pini aracın bulunduğu yere getirin', 'Ardından hizmet türünü seçin');
        return;
      }
      S.pickDropCb = cb;
      S.pickDropReturn = returnMode || (S.mode === 'request' ? 'request' : 'idle');
      S.mode = 'pickDrop';
      renderSheet();
      onCenterSettled();
    };
    $$('[data-i]', m.el).forEach((b) => (b.onclick = () => { const a = addrs[+b.dataset.i]; m.close(); cb({ lat: a.lat, lng: a.lng, address: a.label + ' · ' + a.address }); }));
    let t;
    input.oninput = () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 3) return;
      t = setTimeout(async () => {
        try {
          const res = await YK.geocode(q, S.pickup);
          $('#dres', m.el).innerHTML = res.length ? res.map((r, i) => `<button class="result" data-r="${i}">${I.pin}<span><b>${h(r.address.split(',')[0])}</b><br><span class="small muted">${h(r.full.split(',').slice(1, 4).join(','))}</span></span></button>`).join('') : '<div class="empty small">Sonuç bulunamadı. Haritadan seçmeyi deneyin.</div>';
          $$('[data-r]', m.el).forEach((b) => (b.onclick = async () => {
            try { const p = await YK.resolvePlace(res[+b.dataset.r]); m.close(); cb(p); } catch (e) { fail(new Error('Adres konumu alınamadı, haritadan seçmeyi deneyin')); }
          }));
        } catch { $('#dres', m.el).innerHTML = '<div class="empty small">Arama şu an yapılamıyor. Haritadan seçebilirsiniz.</div>'; }
      }, 400);
    };
  }

  function addAddressFlow() {
    const m = modal(`
      <h3>Yeni adres ekle</h3>
      <label class="field"><span>Adres adı</span><input id="al" placeholder="Evim, İş yerim, Servisim…"></label>
      <p class="small muted">Konum olarak haritadaki pinin bulunduğu nokta kaydedilir:</p>
      <div class="card flat small" id="aaddr">${h(S.pickupAddr || 'Konum seçilmedi')}</div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-close>Vazgeç</button><button class="btn" id="aok">Kaydet</button></div>`);
    $('#aok', m.el).onclick = async () => {
      const label = $('#al', m.el).value.trim() || 'Adresim';
      if (!S.pickup) return fail(new Error('Önce haritada konum seçin'));
      const addresses = [...(S.user.addresses || []), { label, lat: S.pickup.lat, lng: S.pickup.lng, address: S.pickupAddr }];
      try { S.user = (await api('/me', { method: 'PATCH', body: { addresses } })).user; m.close(); sheetIdle(); toast('Adres kaydedildi'); } catch (e) { fail(e); }
    };
  }

  async function shareInvite() {
    const link = `${location.origin}/?davet=${S.user.referralCode}`;
    const text = `Yolda kalırsan Yolda Kaldık'ı kullan! Davet kodum ${S.user.referralCode} ile 250 TL kurtarma çeki kazan: ${link}`;
    if (navigator.share) navigator.share({ title: 'Yolda Kaldık', text, url: link }).catch(() => {});
    else { try { await navigator.clipboard.writeText(text); } catch {} toast('Davet bağlantısı kopyalandı', S.user.referralCode); }
  }

  // ---------------- Randevulu talepler ----------------
  const fmtWhen = (s) => new Date(s).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  async function loadScheduled() {
    try { S.scheduled = (await api('/jobs')).jobs.filter((j) => j.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)); } catch { S.scheduled = []; }
  }

  // ---------------- Acil durum ----------------
  async function openSOS() {
    const p = S.myPos || S.pickup || null;
    const addr = p ? await YK.reverseGeocode(p).catch(() => '') : '';
    const contacts = S.user.emergencyContacts || [];
    const m = modal(`
      <h3 style="color:var(--red)">Acil durum</h3>
      <a class="sos-big" href="tel:112">${I.phone}<span class="grow">112 Acil Çağrı<br><span class="small" style="font-weight:600;opacity:.85">Yaralı varsa önce burayı arayın</span></span></a>
      <div class="row" style="margin-top:8px"><a class="btn ghost sm" href="tel:155" style="flex:1">155 Polis</a><a class="btn ghost sm" href="tel:110" style="flex:1">110 İtfaiye</a><a class="btn ghost sm" href="tel:156" style="flex:1">156 Jandarma</a></div>
      <div class="card flat small" style="margin-top:12px"><div class="tiny bold muted">KONUMUNUZ (operatöre okuyabilirsiniz)</div><b>${h(addr || 'Konum alınıyor…')}</b>${p ? `<div class="muted">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>` : ''}</div>
      <button class="btn dark" id="sosShare" style="margin-top:12px">${I.share} Konumumu acil kişilerime gönder${contacts.length ? ` (${contacts.length})` : ''}</button>
      <button class="btn" id="sosTow" style="margin-top:8px">${I.tow} Kaza yaptım, çekici çağır</button>
      <p class="tiny muted center" style="margin-top:10px">${contacts.length ? contacts.map((c) => h(c.name)).join(', ') + ' bilgilendirilecek.' : 'Acil durum kişisi eklemediniz. Hesap → Acil durum kişilerim.'}</p>`);
    $('#sosTow', m.el).onclick = () => { m.close(); setTab('home'); if (S.mode !== 'idle') return; if (p) panToPin(p, 16); setTimeout(() => startRequest('oto'), 400); };
    $('#sosShare', m.el).onclick = async () => {
      if (!contacts.length) { m.close(); setTab('account'); toast('Önce acil durum kişisi ekleyin'); return; }
      try {
        const r = await api('/sos', { body: { location: p ? { ...p, address: addr } : null } });
        if (r.sent) toast('Konumunuz gönderildi ✅', `${r.sent} kişiye SMS gitti`);
        else {
          // SMS servisi yoksa telefonun kendi mesaj uygulamasıyla gönder
          const nums = contacts.map((c) => '0' + c.phone).join(',');
          location.href = `sms:${nums}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(r.text)}`;
        }
      } catch (e) { fail(e); }
    };
  }

  // ---------------- Socket & bildirimler ----------------
  function connect() {
    S.socket = YK.connectSocket();
    if (!S.socket) return;
    S.socket.on('connect', () => S.job && S.socket.emit('job:watch', S.job.id));
    S.socket.on('notify', (n) => {
      toast(n.title, n.body);
      YK.showLocalNotification(n.title, n.body, n.data);
      S.unread++;
      $('#bellDot')?.classList.remove('hidden');
    });
    S.socket.on('job:update', (j) => {
      const terminal = ['completed', 'cancelled', 'expired'].includes(j.status);
      if (terminal ? S.job && S.job.id === j.id : !S.job || S.job.id === j.id) setJob(j);
    });
    S.socket.on('job:driver', onDriverLoc);
    S.socket.on('job:message', ({ jobId, message }) => {
      if (!S.job || S.job.id !== jobId) return;
      S.job.messages = [...(S.job.messages || []).filter((x) => x.id !== message.id), message];
      if (S.chatOpen || message.from === 'customer') return;
      S.unreadChat = (S.unreadChat || 0) + 1;
      toast(`💬 ${message.name}`, message.text || '📷 Fotoğraf');
      YK.showLocalNotification(`💬 ${message.name}`, message.text || 'Fotoğraf gönderdi');
      if (S.mode === 'active' && S.tab === 'home') sheetActive();
    });
  }
  async function refreshUnread() {
    try { const r = await api('/notifications'); S.unread = r.unread; $('#bellDot')?.classList.toggle('hidden', !r.unread); } catch {}
  }
  async function refreshUser() { try { S.user = (await api('/me')).user; } catch {} }
  async function openNotifications() {
    const r = await api('/notifications').catch(() => ({ notifications: [] }));
    modal(`<h3>Bildirimler</h3>${r.notifications.length ? `<div class="list" style="box-shadow:none">${r.notifications.map((n) => `<div class="li"><span class="lic" style="${n.read ? '' : 'background:var(--brand-soft);color:var(--brand-2)'}">${I.bell}</span><span class="grow"><b>${h(n.title)}</b><br><span class="small muted">${h(n.body)}</span><br><span class="tiny muted">${dt(n.createdAt)}</span></span></div>`).join('')}</div>` : `<div class="empty">${I.bell}<p>Henüz bildiriminiz yok</p></div>`}`);
    api('/notifications/read', { body: {} }).catch(() => {});
    $('#bellDot').classList.add('hidden');
  }

  // ---------------- Kurtarmalarım ----------------
  async function renderJobs() {
    const el = $('#tabScreen');
    el.innerHTML = `<div class="page"><h1>Kurtarmalarım</h1><div id="jl" class="muted">Yükleniyor…</div></div>`;
    const r = await api('/jobs').catch(() => ({ jobs: [] }));
    $('#jl').innerHTML = r.jobs.length
      ? `<div class="list">${r.jobs.map((j, i) => `<button class="li" data-i="${i}"><span class="lic pic-lic">${svcImg(j.service)}</span><span class="grow"><span class="row between"><b>${h(S.cfg.services[j.service]?.name || j.service)}</b><b>${tl(j.price.total)}</b></span><span class="row between small muted" style="margin-top:2px"><span class="ellipsis">${dt(j.createdAt)} · ${j.no}</span>${statusBadge(j.status)}</span></span></button>`).join('')}</div>`
      : `<div class="empty">${I.truck}<p><b>Henüz kurtarma talebiniz yok</b><br>Yolda kalırsanız tek dokunuşla çekici çağırabilirsiniz.</p><button class="btn sm" id="goHome">Çekici çağır</button></div>`;
    $('#goHome') && ($('#goHome').onclick = () => setTab('home'));
    $$('#jl [data-i]').forEach((b) => (b.onclick = () => jobDetail(r.jobs[+b.dataset.i])));
  }
  function jobDetail(j) {
    if (!j) return;
    const m = modal(`
      ${j.status === 'scheduled' ? `<div class="sched-banner">${I.cal}<span class="grow"><b>${h(fmtWhen(j.scheduledAt))}</b><br><span class="muted">Saatinden önce çekici atanacak, bildirim alacaksınız.</span></span></div>` : ''}
      <div class="row between"><h3>${h(S.cfg.services[j.service]?.name)} · ${j.no}</h3>${statusBadge(j.status)}</div>
      <div class="card flat small"><div class="row"><span style="color:var(--brand-2)">${I.pin}</span><span class="grow">${h(j.pickup.address)}</span></div>${j.dropoff ? `<div class="row" style="margin-top:8px"><span>${I.nav}</span><span class="grow">${h(j.dropoff.address)}</span></div>` : ''}</div>
      ${j.driver ? `<div class="driver-card" style="margin-top:12px"><div class="avatar">${initials(j.driver.name)}</div><div class="grow"><b>${h(j.driver.name)}</b><div class="small muted">${h(j.driver.vehicle || '')}</div></div><span class="plate">${h(j.driver.plate || '')}</span></div>` : ''}
      <h2 style="font-size:15px;margin:16px 0 6px">Zaman çizelgesi</h2>
      <div class="small">${j.timeline.map((t) => `<div class="row" style="padding:5px 0"><span class="live-dot" style="background:var(--brand)"></span><span class="grow">${h(t.note)}</span><span class="muted">${new Date(t.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')}</div>
      <div class="price-lines" style="margin-top:12px">${j.price.lines.map((l) => `<div class="pl"><span>${h(l.label)}</span><span>${tl(l.amount)}</span></div>`).join('')}${j.price.discount ? `<div class="pl disc"><span>İndirim</span><span>−${tl(j.price.discount)}</span></div>` : ''}${j.price.credit ? `<div class="pl disc"><span>Kurtarma çeki</span><span>−${tl(j.price.credit)}</span></div>` : ''}<div class="pl total"><span>Toplam</span><span>${tl(j.price.total)}</span></div></div>
      ${j.photos?.pickup?.length ? `<h2 style="font-size:15px;margin:16px 0 6px">Yükleme öncesi fotoğraflar</h2>${YK.photoStrip(j.photos.pickup, 72)}` : ''}
      ${j.photos?.dropoff?.length ? `<h2 style="font-size:15px;margin:14px 0 6px">Teslim fotoğrafları</h2>${YK.photoStrip(j.photos.dropoff, 72)}` : ''}
      ${j.status === 'scheduled' ? '<button class="btn danger" id="cancelSched" style="margin-top:14px">Randevuyu iptal et</button>' : ''}
      ${j.rating ? `<p class="center" style="color:var(--amber);font-size:22px;margin:12px 0 0">${'★'.repeat(j.rating.stars)}</p>` : ''}
      ${j.status === 'completed' && !j.rating ? '<button class="btn" id="rateBtn" style="margin-top:14px">Çekiciyi puanla</button>' : ''}
      ${['searching', 'accepted', 'arrived', 'towing', 'servicing'].includes(j.status) ? '<button class="btn" id="trackBtn" style="margin-top:14px">Canlı takip et</button>' : ''}`);
    $('#rateBtn', m.el) && ($('#rateBtn', m.el).onclick = () => { m.close(); openRating(j); });
    YK.bindPhotoStrips(m.el);
    $('#cancelSched', m.el) && ($('#cancelSched', m.el).onclick = async () => {
      if (!(await confirmBox('Randevuyu iptal et', `${fmtWhen(j.scheduledAt)} randevunuz iptal edilecek.`, 'İptal et', true))) return;
      try { await api(`/jobs/${j.id}/cancel`, { body: { reason: 'Randevu iptali' } }); m.close(); toast('Randevunuz iptal edildi'); await loadScheduled(); if (S.mode === 'idle') renderSheet(); if (S.tab === 'jobs') renderJobs(); } catch (e) { fail(e); }
    });
    $('#trackBtn', m.el) && ($('#trackBtn', m.el).onclick = () => { m.close(); setTab('home'); setJob(j); });
  }

  // ---------------- Hesap ----------------
  async function renderAccount() {
    await refreshUser();
    const u = S.user;
    const el = $('#tabScreen');
    el.innerHTML = `<div class="page">
      <h1>Hesabım</h1>
      <div class="card row"><div class="avatar">${initials(u.name)}</div><div class="grow"><b style="font-size:17px">${h(u.name)}</b><div class="muted small">${phoneFmt(u.phone)}</div></div><button class="btn sm ghost" id="editName">Düzenle</button></div>
      <div class="stat-grid" style="margin-top:12px">
        <div class="stat"><div class="k">Kurtarma çeki</div><div class="v" style="color:var(--brand-2)">${tl(u.credits || 0)}</div></div>
        <div class="stat"><div class="k">Davet kodum</div><div class="v">${h(u.referralCode)}</div></div>
      </div>
      <div class="banner dark" style="width:100%;margin-top:12px"><div class="bold" style="font-size:16px">Arkadaşını davet et, ikiniz de kazanın</div><div class="small" style="opacity:.8;margin:4px 0 10px">Arkadaşınız kayıtta 250 TL çek alır; ilk kurtarmasını tamamlayınca size de 250 TL.</div><button class="btn sm amber" id="inv2">${I.share} Davet bağlantısını paylaş</button></div>
      <h2>Acil durum kişilerim</h2>
      <div class="list">${(u.emergencyContacts || []).map((c, i) => `<div class="li"><span class="lic" style="background:var(--red-soft);color:var(--red)">${I.phone}</span><span class="grow"><b>${h(c.name)}</b><br><span class="small muted">${phoneFmt(c.phone)}</span></span><button data-ec="${i}" class="muted" aria-label="Sil">${I.trash}</button></div>`).join('')}
        ${(u.emergencyContacts || []).length < 3 ? `<button class="li" id="addEc"><span class="lic">+</span><span class="grow"><b>Kişi ekle</b><br><span class="small muted">Acil düğmesine basınca konumunuz bu kişilere gönderilir (en fazla 3)</span></span></button>` : ''}</div>
      <h2>Kayıtlı adreslerim</h2>
      <div class="list">${(u.addresses || []).map((a, i) => `<div class="li"><span class="lic">${I.pin}</span><span class="grow"><b>${h(a.label)}</b><br><span class="small muted ellipsis" style="display:block">${h(a.address)}</span></span><button data-del="${i}" class="muted" aria-label="Sil">${I.trash}</button></div>`).join('') || '<div class="li muted small">Haritadaki pinin bulunduğu yeri “Yeni adres ekle” ile kaydedebilirsiniz.</div>'}</div>
      <h2>İndirim kodu</h2>
      <div class="row"><input class="input grow" id="cc" placeholder="Kodu girin" style="text-transform:uppercase"><button class="btn sm" id="ccBtn">Kontrol et</button></div>
      <p class="small muted">Geçerli kodu kurtarma talebi oluştururken uygulayabilirsiniz.</p>
      <h2>Diğer</h2>
      <div class="list">
        <a class="li" href="/cekici" style="color:inherit;text-decoration:none"><span class="lic">${I.tow}</span><span class="grow"><b>Çekici hesabı aç</b><br><span class="small muted">Aylık paketle sınırsız iş alın</span></span><span class="chev">${I.chev}</span></a>
        <button class="li" id="logout"><span class="lic">${I.logout}</span><span class="grow"><b>Çıkış yap</b></span></button>
      </div></div>`;
    $('#inv2').onclick = shareInvite;
    $$('[data-ec]').forEach((b) => (b.onclick = async () => {
      try { S.user = (await api('/me', { method: 'PATCH', body: { emergencyContacts: u.emergencyContacts.filter((_, i) => i !== +b.dataset.ec) } })).user; renderAccount(); } catch (e) { fail(e); }
    }));
    $('#addEc') && ($('#addEc').onclick = () => {
      const m = modal(`<h3>Acil durum kişisi</h3><label class="field"><span>Ad</span><input id="ecN" placeholder="Örn. Annem"></label><label class="field" style="margin-top:10px"><span>Cep telefonu</span><input id="ecP" inputmode="tel" placeholder="05xx xxx xx xx"></label><button class="btn" id="ecOk" style="margin-top:14px">Kaydet</button>`);
      $('#ecOk', m.el).onclick = async () => {
        const list = [...(u.emergencyContacts || []), { name: $('#ecN', m.el).value, phone: $('#ecP', m.el).value }];
        try {
          const r = await api('/me', { method: 'PATCH', body: { emergencyContacts: list } });
          if (r.user.emergencyContacts.length < list.length) throw new Error('Ad ve geçerli bir cep telefonu girin');
          S.user = r.user; m.close(); renderAccount(); toast('Acil durum kişisi eklendi');
        } catch (e) { fail(e); }
      };
    });
    $('#editName').onclick = () => {
      const m = modal(`<h3>Profili düzenle</h3><label class="field"><span>Ad Soyad</span><input id="nn" value="${h(u.name)}"></label><label class="field" style="margin-top:10px"><span>Yeni şifre (isteğe bağlı)</span><input id="np" type="password" placeholder="Değiştirmek istemiyorsanız boş bırakın"></label><button class="btn" id="nok" style="margin-top:14px">Kaydet</button>`);
      $('#nok', m.el).onclick = async () => {
        try { S.user = (await api('/me', { method: 'PATCH', body: { name: $('#nn', m.el).value, ...($('#np', m.el).value ? { password: $('#np', m.el).value } : {}) } })).user; m.close(); renderAccount(); toast('Kaydedildi'); } catch (e) { fail(e); }
      };
    };
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      const addresses = u.addresses.filter((_, i) => i !== +b.dataset.del);
      try { S.user = (await api('/me', { method: 'PATCH', body: { addresses } })).user; renderAccount(); } catch (e) { fail(e); }
    }));
    $('#ccBtn').onclick = async () => {
      try { const r = await api('/codes/check', { body: { code: $('#cc').value, target: 'ride' } }); toast('Kod geçerli ✅', r.label); } catch (e) { fail(e); }
    };
    $('#logout').onclick = async () => { if (await confirmBox('Çıkış yap', 'Hesabınızdan çıkış yapılacak.', 'Çıkış yap')) { auth.token = null; location.href = '/'; } };
  }

  // ---------------- Ayarlar ----------------
  async function renderSettings() {
    const loc = await perms.location();
    const noti = perms.notification();
    const call = perms.call();
    const st = (s) => (s === 'granted' ? '<span class="badge green">Açık</span>' : s === 'denied' ? '<span class="badge red">Engelli</span>' : s === 'unsupported' ? '<span class="badge">Yok</span>' : '<span class="badge amber">Kapalı</span>');
    let theme = 'auto';
    try { theme = localStorage.getItem('yk:theme') || 'auto'; } catch {}
    const el = $('#tabScreen');
    el.innerHTML = `<div class="page">
      <h1>Ayarlar</h1>
      <h2>İzinler</h2>
      <div class="list">
        <button class="li" data-p="loc"><span class="lic">${I.pin}</span><span class="grow"><b>Konum izni</b><br><span class="small muted">Konumunuzu çekiciye iletmek için</span></span>${st(loc)}</button>
        <button class="li" data-p="noti"><span class="lic">${I.bell}</span><span class="grow"><b>Bildirim izni</b><br><span class="small muted">Durum değişikliklerinde anlık bildirim</span></span>${st(noti)}</button>
        <button class="li" data-p="call"><span class="lic">${I.phone}</span><span class="grow"><b>Arama izni</b><br><span class="small muted">Çekicinizi tek dokunuşla arayın</span></span>${st(call)}</button>
      </div>
      ${loc === 'denied' || noti === 'denied' ? '<p class="small muted">Engellenen izinleri tarayıcınızın site ayarlarından (adres çubuğundaki kilit simgesi) açabilirsiniz.</p>' : ''}
      <h2>Bildirimler</h2>
      <div class="list"><button class="li" id="testPush"><span class="lic">${I.bell}</span><span class="grow"><b>Test bildirimi gönder</b></span><span class="chev">${I.chev}</span></button></div>
      <h2>Görünüm</h2>
      <div class="seg" id="themeSeg"><button data-v="auto" class="${theme === 'auto' ? 'on' : ''}">Otomatik</button><button data-v="light" class="${theme === 'light' ? 'on' : ''}">Açık</button><button data-v="dark" class="${theme === 'dark' ? 'on' : ''}">Koyu</button></div>
      <h2>Destek</h2>
      <div class="list">
        <a class="li" href="tel:${h(S.cfg.support)}" style="color:inherit;text-decoration:none"><span class="lic">${I.phone}</span><span class="grow"><b>Çağrı merkezi</b><br><span class="small muted">7/24 · ${h(S.cfg.support)}</span></span><span class="chev">${I.chev}</span></a>
        <button class="li" id="faq"><span class="lic">${I.help}</span><span class="grow"><b>Sık sorulan sorular</b></span><span class="chev">${I.chev}</span></button>
        <button class="li" id="delAcc"><span class="lic" style="color:var(--red)">${I.trash}</span><span class="grow"><b style="color:var(--red)">Hesabımı sil</b></span></button>
      </div>
      <p class="tiny muted center" style="margin-top:20px">Yolda Kaldık · sürüm 1.0</p></div>`;
    $$('[data-p]').forEach((b) => (b.onclick = async () => {
      try {
        if (b.dataset.p === 'loc') { await locateMe(); toast('Konum izni açık'); }
        if (b.dataset.p === 'noti') { await YK.enablePush(S.cfg.vapidPublicKey); toast('Bildirimler açıldı'); }
        if (b.dataset.p === 'call') { perms.setCall(perms.call() === 'granted' ? 'prompt' : 'granted'); }
      } catch (e) { fail(e); }
      renderSettings();
    }));
    $('#testPush').onclick = () => api('/push/test', { body: {} }).catch(fail);
    $$('#themeSeg button').forEach((b) => (b.onclick = () => { try { localStorage.setItem('yk:theme', b.dataset.v); } catch {} YK.applyTheme(); renderSettings(); }));
    $('#faq').onclick = () => modal(`<h3>Sık sorulan sorular</h3>
      <p><b>Fiyat nasıl hesaplanıyor?</b><br><span class="muted">Hizmet türüne göre açılış ücreti + kilometre başı ücret. 22:00–06:00 arası %20 gece tarifesi uygulanır. Talep öncesinde toplam tutarı görürsünüz.</span></p>
      <p><b>Ödemeyi nasıl yaparım?</b><br><span class="muted">Hizmet tamamlandığında çekiciye nakit veya kredi kartı (POS) ile.</span></p>
      <p><b>İptal ücreti var mı?</b><br><span class="muted">Hayır, çekici size ulaşmadan iptal ücretsizdir.</span></p>
      <p><b>Davet çeki nasıl kullanılır?</b><br><span class="muted">Çekiniz bir sonraki kurtarmanızda otomatik düşülür.</span></p>`);
    $('#delAcc').onclick = async () => {
      if (await confirmBox('Hesabı sil', 'Hesabınız ve kayıtlı bilgileriniz kalıcı olarak silinecek.', 'Hesabımı sil', true)) {
        await api('/me', { method: 'DELETE' }).catch(fail);
        auth.token = null;
        location.href = '/';
      }
    };
  }

  boot();
})();
