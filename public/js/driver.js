// Çekici paneli
(function () {
  const { $, $$, h, I, svcImg, api, auth, tl, dt, d8, phoneFmt, initials, statusBadge, toast, fail, modal, confirmBox, perms } = YK;
  const app = $('#app');
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('yk-c:' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('yk-c:' + k, JSON.stringify(v)); } catch {} },
  };
  const S = { cfg: null, user: null, tab: 'map', job: null, offers: [], socket: null, map: null, me: null, myMarker: null, jobLayer: null, offerLayer: null, watchId: null, lastSent: 0, wake: null, offerModal: null };

  async function boot() {
    YK.registerSW();
    try { S.cfg = await api('/config'); } catch { S.cfg = { services: {}, roadside: {} }; }
    YK.initMaps(S.cfg);
    if (auth.token) { try { S.user = (await api('/me', { noLogout: true })).user; } catch { auth.token = null; } }
    if (!S.user || S.user.role !== 'driver') { auth.token = null; return renderAuth(); }
    if (!LS.get('permsDone', false)) return renderPerms();
    renderMain();
  }

  // ---------------- Giriş / kayıt ----------------
  function renderAuth(mode = 'login') {
    const svcs = Object.entries(S.cfg.services);
    app.innerHTML = `
      <div class="screen full">
        <div class="hero">
          <div class="brand" style="display:inline-flex"><span class="logo">${I.tow}</span>YOLDA KALDIK · ÇEKİCİ</div>
          <h1>Komisyon yok,<br><span>sınırsız iş</span> var.</h1>
          <p>Aylık ${tl(S.cfg.subscriptionPrice)} sabit paket ile bölgenizdeki tüm kurtarma taleplerini anında alın.</p>
          <svg class="road" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="1.5">${I.svc_agir.replace(/<\/?svg[^>]*>/g, '')}</svg>
        </div>
        <div class="page stack">
          <div class="seg" id="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Giriş yap</button><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Çekici hesabı aç</button></div>
          <form id="f" class="stack">
            ${mode === 'register' ? `
              <div class="seg" id="acctSeg"><button type="button" data-a="solo" class="on">Bireysel çekici</button><button type="button" data-a="firm">Firma (birden fazla araç)</button></div>
              <input type="hidden" name="firm" id="firmIn" value="">
              <label class="field"><span>Ad Soyad</span><input name="name" required autocomplete="name"></label>
              <label class="field"><span id="coLbl">Firma adı (isteğe bağlı)</span><input name="company" placeholder="Örn. Pendik Oto Kurtarma"></label>
              <p class="tiny muted hidden" id="firmNote" style="margin:-4px 0 0">Firma hesabıyla tek ${tl(S.cfg.subscriptionPrice)} paketle ${S.cfg.fleetMax} araca kadar şoför ekleyip işleri dağıtabilirsiniz.</p>` : ''}
            <label class="field"><span>Cep telefonu</span><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx"></label>
            <label class="field"><span>Şifre</span><input name="password" type="password" required minlength="6"></label>
            ${mode === 'register' ? `
              <div class="row"><label class="field grow"><span>Araç plakası</span><input name="plate" required placeholder="34 ABC 123" style="text-transform:uppercase"></label>
              <label class="field grow"><span>Araç</span><input name="vehicle" placeholder="Kayar kasa, ahtapot…"></label></div>
              <label class="field"><span>Vergi no / TC (fatura için, isteğe bağlı)</span><input name="taxNo" inputmode="numeric"></label>
              <div class="field"><span>Verdiğiniz hizmetler</span><div class="stack" style="margin-top:0">${svcs.map(([k, s], i) => `<label class="check ${i === 0 ? 'on' : ''}"><input type="checkbox" name="svc" value="${k}" ${i === 0 ? 'checked' : ''}><span class="grow">${h(s.name)}<br><span class="small muted">${h(s.desc)}</span></span></label>`).join('')}</div></div>` : ''}
            <button class="btn" type="submit">${mode === 'login' ? 'Giriş yap' : 'Hesabımı oluştur'}</button>
          </form>
          ${mode === 'login' ? '<button class="center small bold" id="forgot" style="width:100%;color:var(--brand-2)">Şifremi unuttum</button>' : '<p class="tiny muted center" style="margin:0">Kayıt için telefonunuza SMS ile doğrulama kodu gönderilir. Kayıttan sonra ruhsat, K belgesi, sigorta ve ehliyetinizi yükleyeceksiniz.</p>'}
          <p class="center small muted">Araç çekici mi arıyorsunuz? <a href="/"><b>Müşteri uygulaması →</b></a></p>
        </div>
      </div>`;
    $$('#seg button').forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
    $$('.check input').forEach((c) => (c.onchange = () => c.closest('.check').classList.toggle('on', c.checked)));
    $$('#acctSeg button').forEach((b) => (b.onclick = () => {
      const firm = b.dataset.a === 'firm';
      $$('#acctSeg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#firmIn').value = firm ? '1' : '';
      $('#coLbl').textContent = firm ? 'Firma adı' : 'Firma adı (isteğe bağlı)';
      $('#firmNote').classList.toggle('hidden', !firm);
    }));
    $('#forgot') && ($('#forgot').onclick = async () => {
      const r = await YK.forgotPassword('driver');
      if (!r) return;
      auth.token = r.token;
      S.user = r.user;
      toast('Şifreniz yenilendi ✅');
      LS.get('permsDone', false) ? renderMain() : renderPerms();
    });
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const fd = Object.fromEntries(new FormData(f));
      const body = mode === 'login'
        ? { phone: fd.phone, password: fd.password, role: 'driver' }
        : { role: 'driver', name: fd.name, phone: fd.phone, password: fd.password, driver: { plate: fd.plate, vehicle: fd.vehicle, company: fd.company, taxNo: fd.taxNo, firm: !!fd.firm, services: $$('input[name=svc]:checked', f).map((x) => x.value) } };
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        let r;
        if (mode === 'login') r = await api('/auth/login', { body });
        else {
          if (!body.driver.services.length) throw new Error('En az bir hizmet türü seçin');
          if (body.driver.firm && (body.driver.company || '').trim().length < 2) throw new Error('Firma adını girin');
          r = await YK.otpModal({
            phone: fd.phone,
            request: () => api('/auth/otp', { body: { phone: fd.phone, role: 'driver', purpose: 'register' } }),
            submit: (otp) => api('/auth/register', { body: { ...body, otp } }),
          });
          if (!r) return;
        }
        if (r.user.role === 'admin') { location.href = '/admin'; return; }
        if (r.user.role !== 'driver') throw new Error('Bu bir müşteri hesabı. Çekici hesabı açmak için "Çekici hesabı aç" sekmesini kullanın.');
        auth.token = r.token;
        S.user = r.user;
        LS.get('permsDone', false) ? renderMain() : renderPerms();
      } catch (err) { fail(err); } finally { btn.disabled = false; }
    };
  }

  // ---------------- İzinler ----------------
  async function renderPerms() {
    const loc = await perms.location();
    const noti = perms.notification();
    const call = perms.call();
    const card = (k, icon, title, text, state) => `
      <div class="perm ${state === 'granted' ? 'ok' : ''}"><div class="pi">${icon}</div><div class="pb"><b>${title}</b><span>${text}</span></div>
      ${state === 'granted' ? '<span class="badge green">Açık</span>' : state === 'denied' ? '<span class="badge red">Kapalı</span>' : state === 'unsupported' ? '<span class="badge">Yok</span>' : `<button class="btn sm" data-ask="${k}">İzin ver</button>`}</div>`;
    app.innerHTML = `<div class="screen full"><div class="page stack">
      <div class="brand" style="display:inline-flex;margin-top:8px"><span class="logo">${I.tow}</span>ÇEKİCİ PANELİ</div>
      <h1 style="margin-top:20px">İş alabilmeniz için gerekli izinler</h1>
      ${card('loc', I.pin, 'Konum (zorunlu)', 'Size en yakın talepleri iletmek ve müşterinin sizi canlı izlemesi için', loc)}
      ${card('noti', I.bell, 'Bildirimler', 'Uygulama kapalıyken bile yeni iş geldiğinde sesli uyarı', noti)}
      ${card('call', I.phone, 'Arama', 'Müşteriyi tek dokunuşla arayın', call)}
      <p class="small muted">İpucu: Telefonunuzda “Ana ekrana ekle” ile uygulama gibi kullanın; bildirimler daha güvenilir çalışır.</p>
      <button class="btn dark" id="go">Devam et</button></div></div>`;
    $$('[data-ask]').forEach((b) => (b.onclick = async () => {
      try {
        if (b.dataset.ask === 'loc') S.me = await YK.getPosition();
        if (b.dataset.ask === 'noti') await YK.enablePush(S.cfg.vapidPublicKey);
        if (b.dataset.ask === 'call') perms.setCall('granted');
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
          <button class="online-toggle" id="onBtn"><span class="live-dot"></span><span class="st" id="onTxt">Çevrimdışı</span><label class="switch" onclick="event.preventDefault()"><input type="checkbox" id="onChk"><span></span></label></button>
          <div class="grow"></div>
          <button class="icon-btn" id="bellBtn">${I.bell}<span class="dot hidden" id="bellDot"></span></button>
        </div>
        <button class="icon-btn locate-btn" id="locBtn" style="top:calc(76px + var(--safe-t))">${I.locate}</button>
        <div class="sheet over-tabs" id="sheet"><div class="grab"></div><div class="body"><div class="sheet-wrap" id="sheetBody"></div></div></div>
      </div>
      <div class="screen hidden" id="tabScreen"></div>
      <nav class="tabs" id="tabs">
        <button data-t="map" class="on">${I.home}<span>Harita</span></button>
        <button data-t="jobs">${I.list}<span>İşlerim</span></button>
        <button data-t="earn">${I.chart}<span>Kazanç</span></button>
        <button data-t="plan">${I.box}<span>Paket</span><i class="tdot hidden" id="planDot"></i></button>
        ${S.user.firm?.owner ? `<button data-t="fleet">${I.team}<span>Filo</span></button>` : ''}
        <button data-t="account">${I.user}<span>Hesap</span><i class="tdot hidden" id="accDot"></i></button>
      </nav>`;
    $$('#tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.t)));
    $('#onBtn').onclick = toggleOnline;
    $('#bellBtn').onclick = openNotifications;
    $('#locBtn').onclick = () => S.me && S.map.setView([S.me.lat, S.me.lng], 15);
    S.map = YK.createMap('map', S.me ? [S.me.lat, S.me.lng] : LS.get('last', [40.9909, 29.0303]), 14);
    S.jobLayer = L.layerGroup().addTo(S.map);
    const tb = YK.mapTypeButton(S.map);
    tb.style.top = 'calc(130px + var(--safe-t))';
    $('#homeScreen').appendChild(tb);
    S.offerLayer = L.layerGroup().addTo(S.map);
    connect();
    updateOnlineUI();
    startTracking();
    loadActive();
    refreshUnread();
    if (perms.notification() === 'granted') YK.enablePush(S.cfg.vapidPublicKey).catch(() => {});
    if (location.hash === '#paket') setTab('plan');
  }
  function setTab(t) {
    S.tab = t;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    const home = t === 'map';
    $('#homeScreen').classList.toggle('hidden', !home);
    $('#tabScreen').classList.toggle('hidden', home);
    if (home) setTimeout(() => S.map.invalidateSize(), 50);
    clearInterval(S.fleetTimer);
    if (!home) ({ jobs: renderJobs, earn: renderEarn, plan: renderPlan, account: renderAccount, fleet: renderFleet })[t]();
  }

  // ---------------- Konum takibi ----------------
  function startTracking() {
    if (!navigator.geolocation || S.watchId != null) return;
    S.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const first = !S.me;
        S.me = { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading || 0 };
        LS.set('last', [S.me.lat, S.me.lng]);
        if (!S.myMarker) S.myMarker = L.marker([S.me.lat, S.me.lng], { icon: YK.truckIcon(true), zIndexOffset: 1000 }).addTo(S.map);
        else S.myMarker.setLatLng([S.me.lat, S.me.lng]);
        if (first) S.map.setView([S.me.lat, S.me.lng], 14);
        const now = Date.now();
        if (S.socket && (S.user.driver.online || S.job) && now - S.lastSent > 3000) {
          S.lastSent = now;
          S.socket.emit('driver:location', S.me);
        }
      },
      (e) => { if (e.code === 1) toast('Konum izni gerekli', 'İş alabilmek için tarayıcıdan konum izni verin.', true); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !S.wake) S.wake = await navigator.wakeLock.request('screen');
      if (!on && S.wake) { await S.wake.release(); S.wake = null; }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && S.user?.driver?.online && keepAwake(true));

  // ---------------- Çevrimiçi ----------------
  function updateOnlineUI() {
    const on = !!S.user.driver.online;
    $('#onBtn').classList.toggle('on', on);
    $('#onTxt').textContent = on ? 'Çevrimiçi' : 'Çevrimdışı';
    $('#onChk').checked = on;
    $('#planDot').classList.toggle('hidden', S.user.subscriptionActive);
    $('#accDot').classList.toggle('hidden', S.user.approval === 'approved' || S.user.approval === 'pending');
    renderSheet();
  }
  async function toggleOnline() {
    if (S.user.approval !== 'approved' && !S.user.driver.online) {
      toast('Belge onayı gerekli', approvalText(), true);
      return openDocs();
    }
    if (!S.user.subscriptionActive) {
      if (S.user.firm && !S.user.firm.owner) return toast('Firma paketi aktif değil', `${S.user.firm.name} paketini yenilemeli.`, true);
      toast('Aylık paket gerekli', `İş almak için ${tl(S.cfg.subscriptionPrice)} aylık paketi etkinleştirin.`, true);
      return setTab('plan');
    }
    const want = !S.user.driver.online;
    try {
      if (want && !S.me) S.me = await YK.getPosition();
      const r = await api('/driver/online', { body: { online: want, location: S.me } });
      S.user = r.user;
      if (want && S.me) S.socket?.emit('driver:location', S.me);
      keepAwake(want);
      toast(want ? 'Çevrimiçisiniz 🟢' : 'Çevrimdışısınız', want ? 'Yakındaki talepler size anında iletilecek.' : 'Yeni talep almayacaksınız.');
      updateOnlineUI();
      if (want) loadOffers();
    } catch (e) { fail(e); }
  }

  // ---------------- Alt sayfa ----------------
  function setSheet(html) { $('#sheetBody').innerHTML = html; }
  function renderSheet() {
    if (S.job) return sheetJob();
    S.jobLayer.clearLayers();
    if (S.user.approval !== 'approved') {
      const st = S.user.approval;
      return setSheet(`
        <div class="row" style="margin:4px 0 10px"><span class="lic" style="width:48px;height:48px;border-radius:14px;background:${st === 'rejected' ? 'var(--red-soft);color:var(--red)' : 'var(--amber-soft);color:#a55f00'};display:grid;place-items:center">${I.doc}</span>
        <div class="grow"><b style="font-size:17px">${{ missing: 'Belgelerinizi yükleyin', pending: 'Belgeleriniz inceleniyor', rejected: 'Belgeniz reddedildi', firm_pending: 'Firma onayı bekleniyor' }[st]}</b><div class="small muted">${approvalText()}</div></div></div>
        <button class="btn ${st === 'pending' || st === 'firm_pending' ? 'ghost' : 'amber'}" id="goDocs">${st === 'pending' || st === 'firm_pending' ? 'Belgeleri görüntüle' : 'Belgeleri yükle'}</button>
        ${!S.user.subscriptionActive && !(S.user.firm && !S.user.firm.owner) ? '<button class="btn ghost sm" id="goPlan2" style="width:100%;margin-top:8px">Bu sırada paketi etkinleştirebilirsiniz</button>' : ''}`),
        ($('#goDocs').onclick = openDocs), $('#goPlan2') && ($('#goPlan2').onclick = () => setTab('plan'));
    }
    if (!S.user.subscriptionActive) {
      if (S.user.firm && !S.user.firm.owner) return setSheet(`<div class="center" style="padding:6px 0"><b style="font-size:17px">Firma paketi aktif değil</b><p class="muted small">${h(S.user.firm.name)} aylık paketini yenileyince iş almaya devam edebilirsiniz.</p></div>`);
      return setSheet(`
        <div class="row" style="margin:4px 0 10px"><span class="lic" style="width:48px;height:48px;border-radius:14px;background:var(--amber-soft);color:#a55f00;display:grid;place-items:center">${I.box}</span>
        <div class="grow"><b style="font-size:17px">Paketiniz aktif değil</b><div class="small muted">İş almaya başlamak için aylık çekici paketini etkinleştirin.</div></div></div>
        <button class="btn amber" id="goPlan">${tl(S.cfg.subscriptionPrice)} / ay · Paketi etkinleştir</button>`), ($('#goPlan').onclick = () => setTab('plan'));
    }
    if (!S.user.driver.online) {
      return setSheet(`<div class="center" style="padding:6px 0 4px"><b style="font-size:17px">Çevrimdışısınız</b><p class="muted small" style="margin:4px 0 12px">Çevrimiçi olduğunuzda bölgenizdeki talepler size anında düşer.</p><button class="btn" id="goOn">Çevrimiçi ol</button></div>`), ($('#goOn').onclick = toggleOnline);
    }
    S.offerLayer.clearLayers();
    S.offers.forEach((o) => L.marker([o.pickup.lat, o.pickup.lng], { icon: YK.pinIcon('amber') }).addTo(S.offerLayer).on('click', () => showOffer(o, false)));
    setSheet(`
      <div class="row between" style="margin:2px 0 10px"><div><b style="font-size:17px">${S.offers.length ? `${S.offers.length} açık talep` : 'Talep bekleniyor…'}</b><div class="small muted">Yeni talepler sesli bildirimle gelir</div></div><button class="btn sm ghost" id="refOff">Yenile</button></div>
      ${S.offers.length ? `<div class="list" style="box-shadow:none;border:1.5px solid var(--line)">${S.offers.map((o, i) => `<button class="li" data-o="${i}"><span class="lic pic-lic">${svcImg(o.service)}</span><span class="grow"><span class="row between"><b>${h(S.cfg.services[o.service].name)}</b><b style="color:var(--brand-2)">${tl(o.price.total)}</b></span><span class="small muted ellipsis" style="display:block">${o.distanceToPickup != null ? o.distanceToPickup + ' km · ' : ''}${h(o.pickup.address)}</span></span></button>`).join('')}</div>`
        : '<div class="radar" style="width:90px;height:90px"><i></i><i></i><i></i><div class="core" style="inset:26px">' + I.tow + '</div></div>'}`);
    $('#refOff').onclick = loadOffers;
    $$('[data-o]').forEach((b) => (b.onclick = () => showOffer(S.offers[+b.dataset.o], false)));
  }
  async function loadOffers() {
    try { S.offers = (await api('/jobs/offers')).offers; if (!S.job) renderSheet(); } catch {}
  }

  function offerHtml(o) {
    const s = S.cfg.services[o.service];
    return `
      ${o.scheduledAt ? `<div class="sched-banner" style="margin-bottom:8px">${I.cal}<span class="grow"><b>Randevulu: ${new Date(o.scheduledAt).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b></span></div>` : ''}
      <div class="row between"><span class="badge amber">YENİ TALEP · ${o.no}</span><span class="badge">${o.payment === 'card' ? 'Kart (POS)' : 'Nakit'}</span></div>
      <div class="row" style="margin:12px 0 4px"><span class="thumb">${svcImg(o.service)}</span><div class="grow"><b style="font-size:19px">${h(s.name)}${o.sub ? ' · ' + h(S.cfg.roadside[o.sub]?.name || '') : ''}</b><div class="small muted">${o.vehicle?.plate ? h(o.vehicle.plate) + ' · ' : ''}${h(o.vehicle?.model || 'Araç bilgisi yok')}</div></div><div class="center"><b style="font-size:22px;color:var(--brand-2)">${tl(o.price.total)}</b><div class="tiny muted">kazanç</div></div></div>
      <div class="card flat small" style="margin-top:10px">
        <div class="row"><span style="color:var(--brand-2)">${I.pin}</span><span class="grow"><b>${o.distanceToPickup != null ? o.distanceToPickup + ' km uzakta' : 'Alış'}</b><br>${h(o.pickup.address)}</span></div>
        ${o.dropoff ? `<div class="row" style="margin-top:8px"><span>${I.nav}</span><span class="grow"><b>${o.distanceKm} km çekme</b><br>${h(o.dropoff.address)}</span></div>` : ''}
        ${o.note ? `<div style="margin-top:8px" class="muted">“${h(o.note)}”</div>` : ''}
      </div>`;
  }
  function showOffer(o, alert = true) {
    if (S.job) return;
    if (S.offerModal) S.offerModal.close();
    if (alert) YK.alertSound(4);
    let left = 30;
    const m = modal(`${offerHtml(o)}${alert ? '<div class="offer-timer"><i id="otb" style="width:100%"></i></div>' : '<div style="height:14px"></div>'}
      <div class="row"><button class="btn ghost" id="oNo">Reddet</button><button class="btn" id="oYes" style="flex:2">Kabul et</button></div>`, { onClose: () => { clearInterval(tm); S.offerModal = null; } });
    S.offerModal = m;
    S.offerModalId = o.id;
    const tm = alert ? setInterval(() => { left--; const b = $('#otb', m.el); if (b) b.style.width = (left / 30) * 100 + '%'; if (left <= 0) m.close(); }, 1000) : null;
    $('#oNo', m.el).onclick = () => m.close();
    $('#oYes', m.el).onclick = async () => {
      try {
        const r = await api(`/jobs/${o.id}/accept`, { body: { location: S.me } });
        m.close();
        S.offers = S.offers.filter((x) => x.id !== o.id);
        setJob(r.job);
        toast('İş sizde ✅', 'Müşteriye yola çıktığınız bildirildi.');
      } catch (e) { fail(e); m.close(); loadOffers(); }
    };
  }

  // ---------------- Aktif iş ----------------
  async function loadActive() {
    try { const r = await api('/jobs/active'); if (r.job) setJob(r.job); else loadOffers(); } catch {}
  }
  function setJob(j) {
    if (j && ['completed', 'cancelled', 'expired'].includes(j.status)) {
      if (S.job && S.job.id === j.id) {
        if (j.status === 'cancelled') toast('Talep iptal edildi', 'Müşteri talebi iptal etti.', true);
        if (j.status === 'completed') toast('İş tamamlandı 🎉', `${tl(j.price.total)} tahsil edin.`);
      }
      S.job = null;
      S.jobLayer.clearLayers();
      renderSheet();
      loadOffers();
      return;
    }
    const changed = !S.job || S.job.status !== j.status || S.job.id !== j.id;
    const isNew = !S.job || S.job.id !== j.id;
    S.job = j;
    if (S.socket && isNew) S.socket.emit('job:watch', j.id);
    if (changed) drawJob();
    renderSheet();
  }
  function drawJob() {
    const j = S.job;
    S.jobLayer.clearLayers();
    S.offerLayer.clearLayers();
    const target = j.status === 'towing' ? j.dropoff : j.pickup;
    L.marker([j.pickup.lat, j.pickup.lng], { icon: YK.pinIcon() }).addTo(S.jobLayer);
    if (j.dropoff) L.marker([j.dropoff.lat, j.dropoff.lng], { icon: YK.pinIcon('drop') }).addTo(S.jobLayer);
    const pts = [[target.lat, target.lng]];
    if (S.me) {
      pts.push([S.me.lat, S.me.lng]);
      YK.route(S.me, target).then((r) => S.job && L.polyline(r.coords, { color: '#18b45f', weight: 6, opacity: 0.9 }).addTo(S.jobLayer));
    }
    setTimeout(() => S.map.fitBounds(L.latLngBounds(pts).pad(0.3), { paddingTopLeft: [20, 90], paddingBottomRight: [20, $('#sheet').offsetHeight + 20], maxZoom: 16 }), 60);
  }
  function sheetJob() {
    const j = S.job;
    const s = S.cfg.services[j.service];
    const target = j.status === 'towing' ? j.dropoff : j.pickup;
    const needPin = j.status === 'arrived' && !j.verified;
    const min = S.cfg.minPhotos || 2;
    const photoStage = !needPin && j.dropoff && j.status === 'arrived' ? 'pickup' : j.dropoff && j.status === 'towing' ? 'dropoff' : null;
    const photos = photoStage ? j.photos?.[photoStage] || [] : [];
    const needPhotos = photoStage && photos.length < min;
    const next = needPin ? null : {
      accepted: ['arrived', 'Konuma vardım'],
      arrived: j.dropoff ? ['towing', 'Aracı yükledim, yola çıkıyorum'] : ['servicing', 'Yol yardımına başla'],
      towing: ['completed', 'Teslim ettim · İşi tamamla'],
      servicing: ['completed', 'Hizmeti tamamla'],
    }[j.status];
    const title = { accepted: 'Müşteriye gidiyorsunuz', arrived: 'Müşteri konumundasınız', towing: 'Araç çekiliyor', servicing: 'Yol yardımı yapılıyor' }[j.status];
    setSheet(`
      <div class="row between" style="margin-top:2px"><div><b style="font-size:18px">${title}</b><div class="small muted">${h(s.name)} · ${j.no}</div></div><div class="center"><b style="font-size:20px;color:var(--brand-2)">${tl(j.price.total)}</b><div class="tiny muted">${j.payment === 'card' ? 'Kart (POS)' : 'Nakit'} tahsil</div></div></div>
      <div class="driver-card" style="margin-top:12px"><div class="avatar" style="background:var(--brand)">${initials(j.customer?.name)}</div><div class="grow"><b>${h(j.customer?.name)}</b><div class="small muted">${j.vehicle?.plate ? h(j.vehicle.plate) + ' · ' : ''}${h(j.vehicle?.model || '')}</div></div></div>
      <div class="actions" style="grid-template-columns:repeat(${['accepted', 'arrived'].includes(j.status) ? 4 : 3},1fr)">
        <button class="act call" id="cCall">${I.phone}Ara</button>
        <button class="act" id="chatBtn">${I.msg}Mesaj${S.unreadChat ? `<i class="cdot">${S.unreadChat}</i>` : ''}</button>
        <a class="act" style="text-decoration:none;color:inherit" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving">${I.nav}Yol tarifi</a>
        ${['accepted', 'arrived'].includes(j.status) ? `<button class="act red" id="dropJob">${I.x}Bırak</button>` : ''}
      </div>
      <div class="card flat small" style="margin-top:12px">
        <div class="row"><span style="color:var(--brand-2)">${I.pin}</span><span class="grow">${h(j.pickup.address)}</span></div>
        ${j.dropoff ? `<div class="row" style="margin-top:8px"><span>${I.nav}</span><span class="grow">${h(j.dropoff.address)} · ${j.distanceKm} km</span></div>` : ''}
        ${j.note ? `<div class="muted" style="margin-top:8px">Not: “${h(j.note)}”</div>` : ''}
      </div>
      ${needPin ? `
        <div class="pin-info"><span>${I.shield}</span><div class="grow"><b>Eşleşme kodu gerekli</b><div class="small">Müşteriden 4 haneli eşleşme kodunu isteyin. Kod doğrulanmadan araç yüklenemez ve iş tamamlanamaz.</div></div></div>
        <button class="btn amber" id="pinBtn" style="margin-top:10px">${I.shield} Eşleşme kodunu gir</button>`
        : j.status !== 'accepted' && j.verified ? `<div class="pin-ok">${I.shield}<span>Eşleşme doğrulandı</span></div>` : ''}
      ${photoStage ? `
        <div class="step-note">${I.camera}<div class="grow"><b>${photoStage === 'pickup' ? 'Yükleme öncesi hasar fotoğrafları' : 'Teslim fotoğrafları'} (${photos.length}/${min})</b>
          <div class="small muted">${photoStage === 'pickup' ? 'Aracı yüklemeden önce önden, arkadan ve yanlardan çekin. Müşteri de görür; hasar anlaşmazlıklarında sizi korur.' : 'Aracı teslim ettiğiniz noktada aynı açılardan çekin.'}</div>
          <div class="photo-strip" style="margin-top:8px">${photos.map((p) => `<button class="ph" data-url="${h(p.url)}" style="width:64px;height:64px"><img src="${h(p.url)}" alt=""></button>`).join('')}<button class="ph-add" id="addPhotos" aria-label="Fotoğraf çek">${I.camera}</button></div></div></div>` : ''}
      ${next ? `<button class="btn ${next[0] === 'completed' ? 'dark' : ''}" id="nextBtn" style="margin-top:12px" ${needPhotos ? 'disabled' : ''}>${needPhotos ? `${I.camera} Önce ${min - photos.length} fotoğraf daha çekin` : next[1]}</button>` : ''}`);
    YK.bindPhotoStrips($('#sheetBody'));
    $('#chatBtn').onclick = () => {
      S.unreadChat = 0;
      S.chatOpen = true;
      YK.openChat({ job: S.job, me: 'driver', socket: S.socket, onClose: () => { S.chatOpen = false; renderSheet(); } });
    };
    $('#addPhotos') && ($('#addPhotos').onclick = async () => {
      const files = await YK.pickImages({ multiple: true, camera: true });
      if (!files.length) return;
      try {
        toast(`${files.length} fotoğraf yükleniyor…`);
        const ids = [];
        for (const f of files.slice(0, 8)) ids.push((await YK.uploadImage(f, 'damage')).id);
        const r = await api(`/jobs/${j.id}/photos`, { body: { stage: photoStage, fileIds: ids } });
        setJob(r.job);
        toast('Fotoğraflar eklendi 📷', 'Müşteri de görebilir.');
      } catch (e) { fail(e); }
    });
    $('#pinBtn') && ($('#pinBtn').onclick = () => openPin(j));
    $('#cCall').onclick = async () => {
      if (perms.call() !== 'granted') { if (!(await confirmBox('Arama izni', 'Müşteriyi telefon uygulamanız üzerinden aramak için izin verin.', 'İzin ver ve ara'))) return; perms.setCall('granted'); }
      location.href = 'tel:0' + j.customer.phone;
    };
    $('#dropJob') && ($('#dropJob').onclick = async () => {
      if (!(await confirmBox('İşi bırak', 'Talep başka bir çekiciye yönlendirilecek. Sık iş bırakmak puanınızı düşürebilir.', 'İşi bırak', true))) return;
      try { await api(`/jobs/${j.id}/cancel`, { body: {} }); S.job = null; renderSheet(); loadOffers(); } catch (e) { fail(e); }
    });
    $('#nextBtn') && ($('#nextBtn').onclick = async () => {
      if (next[0] === 'completed' && !(await confirmBox('İşi tamamla', `Müşteriden ${tl(j.price.total)} tahsil ettiniz mi?`, 'Evet, tamamla'))) return;
      try {
        const r = await api(`/jobs/${j.id}/status`, { body: { status: next[0] } });
        setJob(r.job);
        if (r.job.status === 'arrived' && !r.job.verified) openPin(r.job);
      } catch (e) { fail(e); }
    });
  }

  // Konuma varınca müşteriden alınan 4 haneli kod: kod olmadan eşleşme olmaz
  function openPin(j) {
    if (S.pinModal) S.pinModal.close();
    const m = modal(`
      <div class="center"><span class="pin-hero">${I.shield}</span>
      <h3 style="margin:10px 0 4px">Eşleşme kodunu girin</h3>
      <p class="muted small" style="margin:0 0 14px">${h(j.customer?.name || 'Müşteri')} uygulamasında görünen 4 haneli kodu size söyleyecek.</p></div>
      <div class="pin-boxes" id="pinBoxes">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
      <input id="pinIn" class="pin-input" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="4" aria-label="Eşleşme kodu">
      <p class="small center" id="pinErr" style="color:var(--red);min-height:20px;margin:10px 0 4px"></p>
      <button class="btn" id="pinOk" disabled>Kodu doğrula</button>
      <p class="tiny muted center" style="margin-top:10px">Kod müşteriyle doğru araçla eşleştiğinizi kanıtlar. Kodu telefonla değil yüz yüze alın.</p>`, { onClose: () => (S.pinModal = null) });
    S.pinModal = m;
    const input = $('#pinIn', m.el);
    const boxes = $$('#pinBoxes i', m.el);
    const paint = () => {
      const v = input.value;
      boxes.forEach((b, i) => { b.textContent = v[i] || ''; b.classList.toggle('on', i === Math.min(v.length, 3)); });
      $('#pinOk', m.el).disabled = v.length !== 4;
    };
    const submit = async () => {
      if (input.value.length !== 4) return;
      $('#pinOk', m.el).disabled = true;
      try {
        const r = await api(`/jobs/${j.id}/verify`, { body: { pin: input.value } });
        m.close();
        toast('Eşleşme doğrulandı ✅', j.dropoff ? 'Aracı yükleyip yola çıkabilirsiniz.' : 'Yol yardımına başlayabilirsiniz.');
        setJob(r.job);
      } catch (e) {
        $('#pinErr', m.el).textContent = e.message;
        m.el.querySelector('.pin-boxes').classList.remove('shake');
        void m.el.offsetWidth;
        m.el.querySelector('.pin-boxes').classList.add('shake');
        navigator.vibrate && navigator.vibrate(200);
        input.value = '';
        paint();
      }
    };
    input.oninput = () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); $('#pinErr', m.el).textContent = ''; paint(); if (input.value.length === 4) submit(); };
    $('#pinBoxes', m.el).onclick = () => input.focus();
    $('#pinOk', m.el).onclick = submit;
    paint();
    setTimeout(() => input.focus(), 250);
  }

  // ---------------- Belgeler ----------------
  function approvalText() {
    return {
      missing: 'İş alabilmek için ruhsat, sigorta ve ehliyet fotoğraflarınızı yükleyin' + (S.user.requiredDocs.includes('kbelgesi') ? ' (K belgesi dahil)' : '') + '. Onaydan sonra çevrimiçi olabilirsiniz.',
      pending: 'Belgeleriniz ekibimiz tarafından inceleniyor. Onaylanınca bildirim alacaksınız.',
      rejected: 'Reddedilen belgeyi yeniden yükleyin.',
      firm_pending: 'Firmanızın K belgesi onaylanınca iş almaya başlayabilirsiniz.',
      approved: 'Belgeleriniz onaylı.',
    }[S.user.approval];
  }
  function openDocs() {
    const u = S.user;
    const st = { approved: ['Onaylı', 'green'], pending: ['İnceleniyor', 'amber'], rejected: ['Reddedildi', 'red'] };
    const m = modal(`
      <h3>Belgelerim</h3>
      <p class="muted small" style="margin-top:-6px">Belgeler net, okunur ve geçerli olmalı. Fotoğraflar yalnızca onay ekibimiz tarafından görülür.</p>
      <div class="stack">${u.requiredDocs.map((k) => {
        const d = u.driver.docs?.[k];
        return `<div class="doc-card"><button class="thumb-doc" ${d ? `data-view="${h(d.url)}"` : ''}>${d ? `<img src="${h(d.url)}" alt="">` : I.doc}</button>
          <div class="grow"><b>${h(S.cfg.docTypes[k])}</b><br>${d ? `<span class="badge ${st[d.status][1]}">${st[d.status][0]}</span>${d.note ? `<div class="tiny" style="color:var(--red);margin-top:4px">${h(d.note)}</div>` : ''}` : '<span class="small muted">Yüklenmedi</span>'}</div>
          ${d?.status === 'approved' ? '' : `<button class="btn sm ${d ? 'ghost' : ''}" data-up="${k}">${d ? 'Yenile' : 'Yükle'}</button>`}</div>`;
      }).join('')}</div>
      ${u.driver.firmId ? `<p class="tiny muted" style="margin-top:12px">K belgesi firmanız (${h(u.firm?.name || '')}) tarafından yüklenir.</p>` : ''}
      <button class="btn ghost" data-close style="margin-top:14px">Kapat</button>`, { onClose: () => renderSheet() });
    $$('[data-view]', m.el).forEach((b) => (b.onclick = () => YK.viewPhoto(b.dataset.view)));
    $$('[data-up]', m.el).forEach((b) => (b.onclick = async () => {
      const [f] = await YK.pickImages();
      if (!f) return;
      b.disabled = true;
      b.textContent = 'Yükleniyor…';
      try {
        const up = await YK.uploadImage(f, 'doc');
        S.user = (await api('/driver/docs', { body: { type: b.dataset.up, fileId: up.id } })).user;
        m.el.parentElement.remove();
        toast('Belge yüklendi', 'İnceleme sonrası bildirim alacaksınız.');
        updateOnlineUI();
        openDocs();
      } catch (e) { fail(e); b.disabled = false; b.textContent = 'Yükle'; }
    }));
  }

  // ---------------- Filo (firma) ----------------
  async function renderFleet() {
    let v;
    try { v = await api('/fleet'); } catch (e) { $('#tabScreen').innerHTML = `<div class="page"><div class="empty">${h(e.message)}</div></div>`; return; }
    if (S.tab !== 'fleet') return;
    const stLbl = (m) => (m.job ? `<span class="badge green">${YK.STATUS[m.job.status]?.[0] || m.job.status}</span>` : m.online ? '<span class="badge green">Müsait</span>' : '<span class="badge">Çevrimdışı</span>');
    const apLbl = (a) => (a === 'approved' ? '' : `<span class="badge ${a === 'rejected' ? 'red' : 'amber'}" style="margin-left:4px">${{ missing: 'Belge eksik', pending: 'Belge inceleniyor', rejected: 'Belge reddedildi', firm_pending: 'Firma onayı' }[a]}</span>`);
    const free = v.members.filter((m) => !m.job && m.approval === 'approved');
    const keepScroll = $('#tabScreen').scrollTop;
    $('#tabScreen').innerHTML = `<div class="page">
      <h1>Filo</h1>
      <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="k">Araç</div><div class="v">${v.members.length}<span class="small muted">/${v.max}</span></div></div>
        <div class="stat"><div class="k">Çevrimiçi</div><div class="v" style="color:var(--brand-2)">${v.members.filter((m) => m.online).length}</div></div>
        <div class="stat"><div class="k">İşte</div><div class="v">${v.members.filter((m) => m.job).length}</div></div>
      </div>
      ${!v.subscriptionActive ? '<div class="card flat small" style="margin-top:12px;border-color:var(--amber)">Firma paketiniz aktif değil; şoförleriniz iş alamaz. <b>Paket</b> sekmesinden etkinleştirin.</div>' : ''}
      <div class="card" style="padding:0;overflow:hidden;height:220px;position:relative;margin-top:12px"><div id="fleetMap" style="position:absolute;inset:0"></div></div>
      <h2>Açık talepler · şoföre ata</h2>
      ${v.offers.length ? `<div class="list">${v.offers.map((o) => `<div class="li" style="flex-wrap:wrap"><span class="lic pic-lic">${svcImg(o.service)}</span><span class="grow"><span class="row between"><b>${h(S.cfg.services[o.service].name)}</b><b style="color:var(--brand-2)">${tl(o.price.total)}</b></span><span class="small muted ellipsis" style="display:block">${h(o.pickup.address || '')}${o.dropoff ? ' → ' + h(o.dropoff.address || '') : ''}</span></span>
          <div class="row" style="width:100%;margin-top:8px"><select class="input grow" data-sel="${o.id}" style="padding:9px 12px">${free.filter((m) => m.services.includes(o.service)).map((m) => `<option value="${m.id}">${h(m.name)} · ${h(m.plate)}</option>`).join('') || '<option value="">Müsait şoför yok</option>'}</select><button class="btn sm" data-assign="${o.id}">Ata</button></div></div>`).join('')}</div>`
        : '<div class="card flat small muted">Bölgenizde şu an açık talep yok. Yeni talepler burada görünür.</div>'}
      <h2>Şoförler</h2>
      <div class="list">${v.members.map((m) => `<div class="li"><span class="avatar" style="width:40px;height:40px;font-size:14px;border-radius:12px;${m.online ? 'background:var(--brand)' : ''}">${initials(m.name)}</span>
        <span class="grow"><b>${h(m.name)}${m.owner ? ' <span class="badge">Siz</span>' : ''}</b><br><span class="small muted">${h(m.plate)} · ${m.services.map((x) => h(S.cfg.services[x]?.name)).join(', ')}</span><br>${stLbl(m)}${apLbl(m.approval)}${m.job ? `<span class="tiny muted" style="margin-left:6px">${m.job.no} · ${tl(m.job.total)}</span>` : ''}</span>
        ${!m.owner ? `<button class="muted" data-del="${m.id}" aria-label="Şoförü kaldır">${I.trash}</button>` : ''}</div>`).join('')}</div>
      ${v.members.length < v.max ? '<button class="btn" id="addMem" style="margin-top:12px">+ Şoför / araç ekle</button>' : ''}
      <p class="tiny muted" style="margin-top:10px">Eklediğiniz şoför kendi telefonundan çekici paneline telefon ve şifresiyle giriş yapar, kendi ehliyet, ruhsat ve sigortasını yükler. K belgesi firmanızınkini kullanır.</p>
    </div>`;
    $('#tabScreen').scrollTop = keepScroll;
    const fm = YK.createMap('fleetMap', [41, 29], 10);
    const pts = [];
    v.members.filter((m) => m.lat != null).forEach((m) => { L.marker([m.lat, m.lng], { icon: YK.truckIcon(!!m.job) }).bindPopup(`${h(m.name)} · ${h(m.plate)}`).addTo(fm); pts.push([m.lat, m.lng]); });
    v.offers.forEach((o) => { L.marker([o.pickup.lat, o.pickup.lng], { icon: YK.pinIcon('amber') }).bindPopup(h(S.cfg.services[o.service].name) + ' · ' + tl(o.price.total)).addTo(fm); pts.push([o.pickup.lat, o.pickup.lng]); });
    if (pts.length) fm.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
    $$('[data-assign]').forEach((b) => (b.onclick = async () => {
      const driverId = $(`[data-sel="${b.dataset.assign}"]`).value;
      if (!driverId) return toast('Müsait şoför yok', '', true);
      try { await api('/fleet/assign', { body: { jobId: b.dataset.assign, driverId } }); toast('İş atandı ✅', 'Şoföre bildirim gönderildi.'); renderFleet(); loadActive(); } catch (e) { fail(e); }
    }));
    $$('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox('Şoförü kaldır', 'Şoförün hesabı silinecek ve iş alamayacak.', 'Kaldır', true))) return;
      try { await api('/fleet/members/' + b.dataset.del, { method: 'DELETE' }); renderFleet(); } catch (e) { fail(e); }
    }));
    $('#addMem') && ($('#addMem').onclick = () => {
      const m = modal(`<h3>Şoför / araç ekle</h3>
        <form id="mf" class="stack">
          <label class="field"><span>Şoför adı soyadı</span><input name="name" required></label>
          <label class="field"><span>Cep telefonu (giriş için)</span><input name="phone" required inputmode="tel" placeholder="05xx xxx xx xx"></label>
          <label class="field"><span>Geçici şifre</span><input name="password" required minlength="6" placeholder="En az 6 karakter"></label>
          <div class="row"><label class="field grow"><span>Plaka</span><input name="plate" required style="text-transform:uppercase"></label><label class="field grow"><span>Araç</span><input name="vehicle" placeholder="Kayar kasa…"></label></div>
          ${Object.entries(S.cfg.services).map(([k, s], i) => `<label class="check ${i === 0 ? 'on' : ''}"><input type="checkbox" name="svc" value="${k}" ${i === 0 ? 'checked' : ''}><span class="grow">${h(s.name)}</span></label>`).join('')}
          <button class="btn">Şoförü ekle</button></form>`);
      $$('.check input', m.el).forEach((c) => (c.onchange = () => c.closest('.check').classList.toggle('on', c.checked)));
      $('#mf', m.el).onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        try {
          await api('/fleet/members', { body: { ...fd, services: $$('input[name=svc]:checked', m.el).map((x) => x.value) } });
          m.close();
          toast('Şoför eklendi ✅', `${fd.name} çekici paneline telefonu ve verdiğiniz şifreyle giriş yapabilir.`);
          renderFleet();
        } catch (err) { fail(err); }
      };
    });
    clearInterval(S.fleetTimer);
    S.fleetTimer = setInterval(() => S.tab === 'fleet' && !document.querySelector('.modal-back') && renderFleet(), 15000);
  }

  // ---------------- Socket ----------------
  function connect() {
    S.socket = YK.connectSocket();
    if (!S.socket) return;
    S.socket.on('connect', () => { if (S.me && S.user.driver.online) S.socket.emit('driver:location', S.me); if (S.job) S.socket.emit('job:watch', S.job.id); });
    S.socket.on('job:offer', (o) => {
      if (!S.offers.some((x) => x.id === o.id)) S.offers.unshift(o);
      if (!S.job) { renderSheet(); if (S.tab !== 'map') setTab('map'); showOffer(o, true); }
    });
    S.socket.on('job:gone', ({ id }) => {
      S.offers = S.offers.filter((x) => x.id !== id);
      if (S.offerModal && S.offerModalId === id) { S.offerModal.close(); toast('Talep başka bir çekiciye geçti'); }
      if (!S.job) renderSheet();
    });
    S.socket.on('job:update', (j) => { if (S.job && S.job.id === j.id) setJob(j); else if (j.driverId === S.user.id && !S.job) setJob(j); });
    S.socket.on('job:message', ({ jobId, message }) => {
      if (!S.job || S.job.id !== jobId) return;
      S.job.messages = [...(S.job.messages || []).filter((x) => x.id !== message.id), message];
      if (S.chatOpen || message.from === 'driver') return;
      S.unreadChat = (S.unreadChat || 0) + 1;
      toast(`💬 ${message.name}`, message.text || '📷 Fotoğraf');
      YK.showLocalNotification(`💬 ${message.name}`, message.text || 'Fotoğraf gönderdi');
      if (S.tab === 'map') renderSheet();
    });
    S.socket.on('notify', (n) => {
      if (n.data?.type !== 'offer') toast(n.title, n.body);
      YK.showLocalNotification(n.title, n.body, n.data);
      $('#bellDot')?.classList.remove('hidden');
      if (/Paket|Belge|onay|Hesabınız/i.test(n.title)) refreshUser();
      if (S.tab === 'fleet') renderFleet();
    });
  }
  async function refreshUser() { try { S.user = (await api('/me')).user; updateOnlineUI(); } catch {} }
  async function refreshUnread() { try { const r = await api('/notifications'); $('#bellDot')?.classList.toggle('hidden', !r.unread); } catch {} }
  async function openNotifications() {
    const r = await api('/notifications').catch(() => ({ notifications: [] }));
    modal(`<h3>Bildirimler</h3>${r.notifications.length ? `<div class="list" style="box-shadow:none">${r.notifications.map((n) => `<div class="li"><span class="lic">${I.bell}</span><span class="grow"><b>${h(n.title)}</b><br><span class="small muted">${h(n.body)}</span><br><span class="tiny muted">${dt(n.createdAt)}</span></span></div>`).join('')}</div>` : `<div class="empty">${I.bell}<p>Bildirim yok</p></div>`}`);
    api('/notifications/read', { body: {} }).catch(() => {});
    $('#bellDot').classList.add('hidden');
  }

  // ---------------- İşlerim ----------------
  async function renderJobs() {
    $('#tabScreen').innerHTML = `<div class="page"><h1>İşlerim</h1><div id="jl" class="muted">Yükleniyor…</div></div>`;
    const r = await api('/jobs').catch(() => ({ jobs: [] }));
    $('#jl').innerHTML = r.jobs.length
      ? `<div class="list">${r.jobs.map((j) => `<div class="li"><span class="lic pic-lic">${svcImg(j.service)}</span><span class="grow"><span class="row between"><b>${h(j.customer?.name || '')}</b><b>${tl(j.price.total)}</b></span><span class="row between small muted" style="margin-top:2px"><span class="ellipsis">${dt(j.createdAt)} · ${j.no}${j.rating ? ' · ' + '★'.repeat(j.rating.stars) : ''}</span>${statusBadge(j.status)}</span></span></div>`).join('')}</div>`
      : `<div class="empty">${I.list}<p>Henüz iş almadınız.<br>Çevrimiçi olun, talepler size gelsin.</p></div>`;
  }

  // ---------------- Kazanç ----------------
  async function renderEarn() {
    $('#tabScreen').innerHTML = `<div class="page"><h1>Kazanç</h1><div id="es" class="muted">Yükleniyor…</div></div>`;
    const s = await api('/driver/stats').catch(() => null);
    if (!s) return;
    const max = Math.max(1, ...s.week.map((w) => w.total));
    $('#es').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="k">Bugün</div><div class="v">${tl(s.todayTotal)}</div><div class="tiny muted">${s.todayCount} iş</div></div>
        <div class="stat"><div class="k">Son 30 gün</div><div class="v">${tl(s.monthTotal)}</div><div class="tiny muted">${s.monthCount} iş</div></div>
        <div class="stat"><div class="k">Puan</div><div class="v" style="color:var(--amber)">★ ${s.rating ?? '–'}</div><div class="tiny muted">${s.ratingCount || 0} değerlendirme</div></div>
        <div class="stat"><div class="k">Paket sonrası net (30 gün)</div><div class="v" style="color:${s.monthTotal - S.cfg.subscriptionPrice >= 0 ? 'var(--brand-2)' : 'var(--red)'}">${tl(s.monthTotal - S.cfg.subscriptionPrice)}</div><div class="tiny muted">Komisyon: %0</div></div>
      </div>
      <h2>Son 7 gün</h2>
      <div class="card"><div class="bars">${s.week.map((w) => `<div class="bar"><span class="tiny bold" style="color:var(--text)">${w.total ? Math.round(w.total / 1000) + 'B' : ''}</span><i style="height:${(w.total / max) * 80}%"></i><span>${h(w.day)}</span></div>`).join('')}</div></div>
      <p class="small muted">Tüm iş bedeli size aittir; platform yalnızca aylık sabit paket ücreti alır.</p>`;
  }

  // ---------------- Paket ----------------
  async function renderPlan() {
    await refreshUser();
    const u = S.user;
    const sub = u.driver.subscription;
    const active = u.subscriptionActive;
    const daysLeft = active ? Math.ceil((new Date(sub.until) - Date.now()) / 86400000) : 0;
    if (u.firm && !u.firm.owner) {
      $('#tabScreen').innerHTML = `<div class="page"><h1>Paket</h1>
        <div class="card" style="background:var(--ink);color:#fff"><span class="badge ${active ? 'green' : 'amber'}">${active ? 'AKTİF' : 'AKTİF DEĞİL'}</span>
        <div style="font-size:20px;font-weight:800;margin-top:10px">${h(u.firm.name)} firma paketi</div>
        <div class="small" style="opacity:.8;margin-top:4px">Paketiniz firmanız tarafından karşılanıyor${u.subscriptionUntil ? ` · bitiş ${d8(u.subscriptionUntil)}` : ''}. Ödeme yapmanız gerekmez.</div></div></div>`;
      return;
    }
    const pays = await api('/driver/payments').catch(() => ({ payments: [] }));
    $('#tabScreen').innerHTML = `<div class="page">
      <h1>Aylık paket</h1>
      ${u.firm?.owner ? `<div class="card flat small" style="margin-bottom:12px">${I.team.replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px;margin-right:6px"')}Firma paketi: tek ödemeyle ${S.cfg.fleetMax} araca kadar tüm şoförlerinizi kapsar.</div>` : ''}
      <div class="card" style="background:var(--ink);color:#fff">
        <div class="row between"><span class="badge ${active ? 'green' : 'amber'}">${active ? 'AKTİF' : 'AKTİF DEĞİL'}</span>${active ? `<span class="small" style="opacity:.8">${daysLeft} gün kaldı</span>` : ''}</div>
        <div style="font-size:30px;font-weight:800;margin-top:10px;letter-spacing:-.02em">${tl(S.cfg.subscriptionPrice)}<span style="font-size:15px;opacity:.7"> / ay</span></div>
        <div class="small" style="opacity:.8">Aylık Çekici Paketi</div>
        ${active ? `<div class="small" style="margin-top:8px">Bitiş: <b>${d8(sub.until)}</b>${sub.last4 ? ` · Kart •••• ${h(sub.last4)}` : ''}</div>` : ''}
        <div style="margin-top:14px;display:grid;gap:6px" class="small">
          ${['Sınırsız iş, %0 komisyon', 'Bölgenizdeki tüm taleplere anlık sesli bildirim', 'Müşteriye canlı konum paylaşımı', 'Kazanç ve performans raporu', 'Öncelikli destek hattı'].map((x) => `<div class="row" style="gap:8px"><span style="color:var(--brand)">✓</span>${x}</div>`).join('')}
        </div>
      </div>
      ${active ? `<div class="list" style="margin-top:12px"><div class="li"><span class="grow"><b>Otomatik yenileme</b><br><span class="small muted">Süre bitince aynı kartla yenilensin</span></span><label class="switch"><input type="checkbox" id="ar" ${sub.autoRenew ? 'checked' : ''}><span></span></label></div></div>` : ''}
      <h2>${active ? 'Süreyi uzat (+30 gün)' : 'Paketi etkinleştir'}</h2>
      <div class="row"><input class="input grow" id="pc" placeholder="İndirim kodu (örn. CEKICI20)" style="text-transform:uppercase"><button class="btn sm ghost" id="pcBtn">Uygula</button></div>
      <div id="pq" class="price-lines card flat" style="margin-top:10px"></div>
      <div id="cardBox" class="stack" style="margin-top:12px">
        <label class="field"><span>Kart üzerindeki isim</span><input id="cn" autocomplete="cc-name" value="${h(u.name)}"></label>
        <label class="field"><span>Kart numarası</span><input id="cnum" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23"></label>
        <div class="row"><label class="field grow"><span>Son kullanma</span><input id="cexp" inputmode="numeric" autocomplete="cc-exp" placeholder="AA/YY" maxlength="5"></label><label class="field grow"><span>CVC</span><input id="ccvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"></label></div>
      </div>
      <button class="btn" id="payBtn" style="margin-top:14px">Öde ve etkinleştir</button>
      <p class="tiny muted center">${I.shield.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} 256-bit SSL · Ödeme altyapısı demo modundadır, karttan çekim yapılmaz.</p>
      <h2>Ödeme geçmişi</h2>
      <div class="list">${pays.payments.length ? pays.payments.map((p) => `<div class="li"><span class="lic">${I.card}</span><span class="grow"><b>${p.no} · Aylık paket</b><br><span class="small muted">${d8(p.createdAt)}${p.code ? ' · ' + h(p.code) : ''}${p.last4 ? ' · •••• ' + h(p.last4) : ''}</span></span><b>${tl(p.total)}</b></div>`).join('') : '<div class="li small muted">Henüz ödeme yok</div>'}</div>
    </div>`;
    let code = '';
    const quote = async () => {
      try {
        const q = await api('/driver/subscription/quote', { body: { code } });
        if (q.codeError) { toast(q.codeError, '', true); code = ''; }
        else if (code && q.code) toast('Kod uygulandı 🎉', q.code.label);
        $('#pq').innerHTML = `<div class="pl"><span>Aylık çekici paketi (30 gün)</span><span>${tl(q.price)}</span></div>${q.discount ? `<div class="pl disc"><span>İndirim (${h(q.code.code)})</span><span>−${tl(q.discount)}</span></div>` : ''}<div class="pl total"><span>Ödenecek</span><span>${tl(q.total)}</span></div>`;
        $('#cardBox').classList.toggle('hidden', q.total === 0);
        $('#payBtn').textContent = q.total === 0 ? 'Ücretsiz etkinleştir' : `${tl(q.total)} öde ve etkinleştir`;
      } catch (e) { fail(e); }
    };
    quote();
    $('#pcBtn').onclick = () => { code = $('#pc').value.trim().toUpperCase(); quote(); };
    $('#cnum').oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '));
    $('#cexp').oninput = (e) => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); e.target.value = v; };
    $('#ar') && ($('#ar').onchange = (e) => api('/driver/subscription/auto-renew', { body: { autoRenew: e.target.checked } }).then(() => toast(e.target.checked ? 'Otomatik yenileme açık' : 'Otomatik yenileme kapalı')).catch(fail));
    $('#payBtn').onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true;
      try {
        const r = await api('/driver/subscription', { body: { code, card: { number: $('#cnum').value, exp: $('#cexp').value, cvc: $('#ccvc').value, name: $('#cn').value } } });
        S.user = r.user;
        toast('Paketiniz aktif ✅', `Fatura no: ${r.payment.no}`);
        updateOnlineUI();
        renderPlan();
      } catch (err) { fail(err); btn.disabled = false; }
    };
  }

  // ---------------- Hesap ----------------
  async function renderAccount() {
    const u = S.user;
    const loc = await perms.location();
    const noti = perms.notification();
    const st = (s) => (s === 'granted' ? '<span class="badge green">Açık</span>' : s === 'denied' ? '<span class="badge red">Engelli</span>' : '<span class="badge amber">Kapalı</span>');
    let theme = 'auto';
    try { theme = localStorage.getItem('yk:theme') || 'auto'; } catch {}
    $('#tabScreen').innerHTML = `<div class="page">
      <h1>Hesap</h1>
      <div class="card row"><div class="avatar">${initials(u.name)}</div><div class="grow"><b style="font-size:17px">${h(u.name)}</b><div class="small muted">${phoneFmt(u.phone)}${u.driver.company ? ' · ' + h(u.driver.company) : ''}</div></div><span class="plate">${h(u.driver.plate)}</span></div>
      <h2>Belgelerim</h2>
      <button class="card row" id="docsCard" style="width:100%;text-align:left"><span class="lic" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:${u.approval === 'approved' ? 'var(--brand-soft);color:var(--brand-2)' : u.approval === 'rejected' ? 'var(--red-soft);color:var(--red)' : 'var(--amber-soft);color:#a55f00'}">${I.doc}</span>
        <span class="grow"><b>${{ approved: 'Onaylandı', pending: 'İnceleniyor', missing: 'Eksik belge var', rejected: 'Reddedilen belge var', firm_pending: 'Firma onayı bekleniyor' }[u.approval]}</b><br><span class="small muted">${u.requiredDocs.map((k) => S.cfg.docTypes[k]).join(', ')}</span></span><span class="chev">${I.chev}</span></button>
      <h2>Araç ve hizmetler</h2>
      <div class="card stack">
        <div class="row"><label class="field grow"><span>Plaka</span><input id="pl" value="${h(u.driver.plate)}" style="text-transform:uppercase"></label><label class="field grow"><span>Araç</span><input id="vh" value="${h(u.driver.vehicle || '')}"></label></div>
        <label class="field"><span>Firma</span><input id="co" value="${h(u.driver.company || '')}"></label>
        ${Object.entries(S.cfg.services).map(([k, s]) => `<label class="check ${u.driver.services.includes(k) ? 'on' : ''}"><input type="checkbox" class="sv" value="${k}" ${u.driver.services.includes(k) ? 'checked' : ''}><span class="grow">${h(s.name)}</span></label>`).join('')}
        <button class="btn" id="saveV">Kaydet</button>
      </div>
      <h2>İzinler ve bildirimler</h2>
      <div class="list">
        <button class="li" data-p="loc"><span class="lic">${I.pin}</span><span class="grow"><b>Konum</b></span>${st(loc)}</button>
        <button class="li" data-p="noti"><span class="lic">${I.bell}</span><span class="grow"><b>Bildirimler</b></span>${st(noti)}</button>
        <button class="li" data-p="call"><span class="lic">${I.phone}</span><span class="grow"><b>Arama</b></span>${st(perms.call())}</button>
        <button class="li" id="snd"><span class="lic">${I.bell}</span><span class="grow"><b>Yeni iş sesini dene</b></span><span class="chev">${I.chev}</span></button>
        <button class="li" id="tp"><span class="lic">${I.bell}</span><span class="grow"><b>Test bildirimi gönder</b></span><span class="chev">${I.chev}</span></button>
      </div>
      <h2>Görünüm</h2>
      <div class="seg" id="themeSeg"><button data-v="auto" class="${theme === 'auto' ? 'on' : ''}">Otomatik</button><button data-v="light" class="${theme === 'light' ? 'on' : ''}">Açık</button><button data-v="dark" class="${theme === 'dark' ? 'on' : ''}">Koyu</button></div>
      <h2>Diğer</h2>
      <div class="list">
        <a class="li" href="tel:${h(S.cfg.support)}" style="color:inherit;text-decoration:none"><span class="lic">${I.help}</span><span class="grow"><b>Çekici destek hattı</b><br><span class="small muted">${h(S.cfg.support)}</span></span></a>
        <button class="li" id="logout"><span class="lic">${I.logout}</span><span class="grow"><b>Çıkış yap</b></span></button>
      </div></div>`;
    $$('.check input').forEach((c) => (c.onchange = () => c.closest('.check').classList.toggle('on', c.checked)));
    $('#docsCard').onclick = openDocs;
    $('#saveV').onclick = async () => {
      try { S.user = (await api('/me', { method: 'PATCH', body: { driver: { plate: $('#pl').value, vehicle: $('#vh').value, company: $('#co').value, services: $$('.sv:checked').map((x) => x.value) } } })).user; toast('Kaydedildi'); renderAccount(); } catch (e) { fail(e); }
    };
    $$('[data-p]').forEach((b) => (b.onclick = async () => {
      try {
        if (b.dataset.p === 'loc') S.me = await YK.getPosition();
        if (b.dataset.p === 'noti') await YK.enablePush(S.cfg.vapidPublicKey);
        if (b.dataset.p === 'call') perms.setCall(perms.call() === 'granted' ? 'prompt' : 'granted');
      } catch (e) { fail(e); }
      renderAccount();
    }));
    $('#snd').onclick = () => YK.alertSound(4);
    $('#tp').onclick = () => api('/push/test', { body: {} }).catch(fail);
    $$('#themeSeg button').forEach((b) => (b.onclick = () => { try { localStorage.setItem('yk:theme', b.dataset.v); } catch {} YK.applyTheme(); renderAccount(); }));
    $('#logout').onclick = async () => {
      if (!(await confirmBox('Çıkış yap', 'Çıkış yaptığınızda çevrimdışı olursunuz.', 'Çıkış yap'))) return;
      await api('/driver/online', { body: { online: false } }).catch(() => {});
      auth.token = null;
      location.href = '/cekici';
    };
  }

  boot();
})();
