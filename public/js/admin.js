// Yönetim paneli: istatistik, indirim kodları, çekiciler, müşteriler, talepler, ödemeler, toplu bildirim
(function () {
  const { $, $$, h, I, api, auth, tl, dt, d8, phoneFmt, statusBadge, toast, fail, confirmBox } = YK;
  const app = $('#app');
  const S = { tab: 'dash', cfg: null, map: null, layer: null, markers: {} };

  async function boot() {
    S.cfg = await api('/config').catch(() => ({ services: {} }));
    if (auth.token) {
      try { const u = (await api('/me', { noLogout: true })).user; if (u.role === 'admin') return renderMain(); } catch {}
      auth.token = null;
    }
    renderLogin();
  }

  function renderLogin() {
    app.innerHTML = `<div class="screen full"><div class="page stack" style="max-width:420px;padding-top:12vh">
      <div class="brand" style="display:inline-flex"><span class="logo">${I.tow}</span>YÖNETİM PANELİ</div>
      <h1>Yönetici girişi</h1>
      <form id="f" class="stack">
        <label class="field"><span>Telefon</span><input name="phone" required inputmode="tel"></label>
        <label class="field"><span>Şifre</span><input name="password" type="password" required></label>
        <button class="btn dark">Giriş yap</button>
      </form></div></div>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/auth/login', { body: Object.fromEntries(new FormData(e.target)) });
        if (r.user.role !== 'admin') throw new Error('Bu hesap yönetici değil');
        auth.token = r.token;
        renderMain();
      } catch (err) { fail(err); }
    };
  }

  const TABS = [['dash', 'Özet'], ['codes', 'İndirim kodları'], ['drivers', 'Çekiciler'], ['customers', 'Müşteriler'], ['jobs', 'Talepler'], ['payments', 'Ödemeler'], ['push', 'Bildirim gönder']];
  function renderMain() {
    app.innerHTML = `<div class="screen full"><div class="page" style="max-width:1180px">
      <div class="row between" style="flex-wrap:wrap;gap:10px"><div class="brand" style="display:inline-flex"><span class="logo">${I.tow}</span>YOLDA KALDIK · YÖNETİM</div>
      <div class="row"><a class="btn sm ghost" href="/" target="_blank">Müşteri uygulaması</a><a class="btn sm ghost" href="/cekici" target="_blank">Çekici paneli</a><button class="btn sm ghost" id="lo">${I.logout}</button></div></div>
      <div class="chips" style="margin:14px 0 10px;padding-left:0">${TABS.map(([k, n]) => `<button class="chip ${S.tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <div id="content"></div></div></div>`;
    $$('[data-t]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; renderMain(); }));
    $('#lo').onclick = () => { auth.token = null; location.reload(); };
    ({ dash, codes, drivers, customers, jobs, payments, push })[S.tab]();
  }
  const C = () => $('#content');

  // ---------- Özet + canlı harita ----------
  async function dash() {
    const s = await api('/admin/stats');
    C().innerHTML = `
      ${s.demo ? '<div class="card flat small" style="margin-bottom:12px;border-color:var(--amber)"><b>Demo modu açık:</b> gerçek çekici yokken sanal çekiciler talepleri kabul eder. Canlıya geçerken Render ortam değişkenlerinde <code>DEMO_MODE=false</code> yapın.</div>' : ''}
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
        ${[['Müşteri', s.customers], ['Çekici', s.drivers], ['Aktif paket', s.activeSubs], ['Çevrimiçi çekici', s.onlineDrivers], ['Aktif talep', s.activeJobs], ['Tamamlanan', s.completedJobs], ['Toplam iş hacmi', tl(s.gmv)], ['Paket geliri (30 gün)', tl(s.subRevenueMonth)], ['Paket geliri (toplam)', tl(s.subRevenueAll)]]
          .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
      </div>
      <h2>Canlı harita</h2>
      <div class="card" style="padding:0;overflow:hidden;height:420px;position:relative"><div id="amap" style="position:absolute;inset:0"></div></div>`;
    const j = await api('/admin/jobs');
    S.map = YK.createMap('amap', [41.0, 29.0], 10);
    S.layer = L.layerGroup().addTo(S.map);
    const pts = [];
    j.jobs.filter((x) => ['searching', 'accepted', 'arrived', 'towing', 'servicing'].includes(x.status)).forEach((x) => {
      L.marker([x.pickup.lat, x.pickup.lng], { icon: YK.pinIcon(x.status === 'searching' ? 'amber' : '') }).bindPopup(`<b>${x.no}</b> · ${h(x.customer?.name)}<br>${statusBadge(x.status)} ${tl(x.price.total)}`).addTo(S.layer);
      pts.push([x.pickup.lat, x.pickup.lng]);
      if (x.driver?.lat != null) { S.markers[x.id] = L.marker([x.driver.lat, x.driver.lng], { icon: YK.truckIcon(true) }).bindPopup(h(x.driver.name)).addTo(S.layer); pts.push([x.driver.lat, x.driver.lng]); }
    });
    const d = await api('/admin/users?role=driver');
    d.users.filter((u) => u.driver?.online && u.driver.lat != null).forEach((u) => { L.marker([u.driver.lat, u.driver.lng], { icon: YK.truckIcon() }).bindPopup(`${h(u.name)} · ${h(u.driver.plate)}`).addTo(S.layer); pts.push([u.driver.lat, u.driver.lng]); });
    if (pts.length) S.map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
    S.markers = {};
    if (S.sock) return;
    S.sock = YK.connectSocket();
    S.sock && S.sock.on('job:driver', (p) => {
      if (!S.layer || !S.map) return;
      if (S.tab !== 'dash') return;
      if (S.markers[p.jobId]) S.markers[p.jobId].setLatLng([p.lat, p.lng]);
      else S.markers[p.jobId] = L.marker([p.lat, p.lng], { icon: YK.truckIcon(true) }).addTo(S.layer);
    });
  }

  // ---------- İndirim kodları ----------
  async function codes() {
    const r = await api('/admin/codes');
    const tgt = { ride: 'Kurtarma', subscription: 'Çekici paketi', all: 'Hepsi' };
    C().innerHTML = `
      <div class="card"><h2 style="margin-top:0">Yeni indirim kodu</h2>
        <form id="cf" class="stack">
          <div class="row" style="flex-wrap:wrap">
            <label class="field grow"><span>Kod</span><input name="code" required placeholder="BAHAR25" style="text-transform:uppercase"></label>
            <label class="field grow"><span>Açıklama</span><input name="label" placeholder="Bahar kampanyası %25"></label>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <label class="field grow"><span>Uygulandığı yer</span><select name="target"><option value="ride">Kurtarma talepleri (müşteri)</option><option value="subscription">Aylık çekici paketi</option><option value="all">Hepsi</option></select></label>
            <label class="field grow"><span>Tür</span><select name="type"><option value="percent">Yüzde (%)</option><option value="amount">Sabit tutar (TL)</option></select></label>
            <label class="field grow"><span>Değer</span><input name="value" type="number" min="1" required placeholder="25"></label>
            <label class="field grow"><span>En fazla indirim (TL)</span><input name="maxDiscount" type="number" min="0" placeholder="Sınırsız"></label>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <label class="field grow"><span>Toplam kullanım limiti</span><input name="maxUses" type="number" min="0" placeholder="Sınırsız"></label>
            <label class="field grow"><span>Kişi başı limit</span><input name="perUser" type="number" min="0" value="1"></label>
            <label class="field grow"><span>Son geçerlilik</span><input name="expiresAt" type="date"></label>
            <label class="check grow" style="align-self:flex-end"><input type="checkbox" name="firstRideOnly"> Yalnızca ilk kurtarma</label>
          </div>
          <button class="btn" style="max-width:240px">Kodu oluştur</button>
        </form></div>
      <h2>Kodlar</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kod</th><th>İndirim</th><th>Yer</th><th>Kullanım</th><th>Bitiş</th><th>Durum</th><th></th></tr></thead><tbody>
        ${r.codes.map((c) => `<tr><td><b>${h(c.code)}</b><br><span class="tiny muted">${h(c.label)}</span></td><td>${c.type === 'percent' ? '%' + c.value : tl(c.value)}${c.maxDiscount ? `<br><span class="tiny muted">en fazla ${tl(c.maxDiscount)}</span>` : ''}</td><td>${tgt[c.target]}${c.firstRideOnly ? '<br><span class="tiny muted">ilk kurtarma</span>' : ''}</td><td>${c.used}${c.maxUses ? ' / ' + c.maxUses : ''}</td><td>${c.expiresAt ? d8(c.expiresAt) : '—'}</td>
          <td><label class="switch"><input type="checkbox" data-tg="${h(c.code)}" ${c.active ? 'checked' : ''}><span></span></label></td><td><button data-del="${h(c.code)}" class="muted">${I.trash}</button></td></tr>`).join('')}
      </tbody></table></div>`;
    $('#cf').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.firstRideOnly = !!fd.firstRideOnly;
      if (fd.expiresAt) fd.expiresAt = new Date(fd.expiresAt + 'T23:59:59').toISOString();
      try { await api('/admin/codes', { body: fd }); toast('Kod oluşturuldu'); codes(); } catch (err) { fail(err); }
    };
    $$('[data-tg]').forEach((x) => (x.onchange = () => api('/admin/codes/' + x.dataset.tg, { method: 'PATCH', body: { active: x.checked } }).then(() => toast(x.checked ? 'Kod aktif' : 'Kod pasif')).catch(fail)));
    $$('[data-del]').forEach((x) => (x.onclick = async () => { if (await confirmBox('Kodu sil', x.dataset.del + ' silinecek.', 'Sil', true)) { await api('/admin/codes/' + x.dataset.del, { method: 'DELETE' }).catch(fail); codes(); } }));
  }

  // ---------- Çekiciler ----------
  async function drivers() {
    const r = await api('/admin/users?role=driver');
    C().innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Çekici</th><th>Plaka / araç</th><th>Hizmetler</th><th>Paket</th><th>Durum</th><th>Kazanç</th><th>İşlem</th></tr></thead><tbody>
      ${r.users.map((u) => `<tr><td><b>${h(u.name)}</b><br><span class="tiny muted">${phoneFmt(u.phone)}${u.driver.company ? ' · ' + h(u.driver.company) : ''}</span></td>
        <td><span class="plate">${h(u.driver.plate)}</span><br><span class="tiny muted">${h(u.driver.vehicle || '')}</span></td>
        <td class="small">${u.driver.services.map((s) => h(S.cfg.services[s]?.name || s)).join(', ')}</td>
        <td>${u.subscriptionActive ? `<span class="badge green">Aktif</span><br><span class="tiny muted">${d8(u.driver.subscription.until)}</span>` : '<span class="badge amber">Yok</span>'}</td>
        <td>${u.driver.online ? '<span class="badge green">Çevrimiçi</span>' : '<span class="badge">Çevrimdışı</span>'}</td>
        <td>${tl(u.driver.earnings || 0)}</td>
        <td class="row" style="gap:6px"><button class="btn sm ghost" data-ext="${u.id}">+30 gün</button>${u.subscriptionActive ? `<button class="btn sm danger" data-stop="${u.id}">Durdur</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Henüz çekici yok</td></tr>'}
    </tbody></table></div>`;
    $$('[data-ext]').forEach((b) => (b.onclick = () => api(`/admin/drivers/${b.dataset.ext}/subscription`, { body: { days: 30 } }).then(() => { toast('Paket 30 gün uzatıldı'); drivers(); }).catch(fail)));
    $$('[data-stop]').forEach((b) => (b.onclick = async () => { if (await confirmBox('Paketi durdur', 'Çekici iş alamayacak.', 'Durdur', true)) api(`/admin/drivers/${b.dataset.stop}/subscription`, { body: { days: 0 } }).then(drivers).catch(fail); }));
  }

  async function customers() {
    const r = await api('/admin/users?role=customer');
    C().innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Müşteri</th><th>Telefon</th><th>Davet kodu</th><th>Çek bakiyesi</th><th>Kayıt</th></tr></thead><tbody>
      ${r.users.map((u) => `<tr><td><b>${h(u.name)}</b></td><td>${phoneFmt(u.phone)}</td><td>${h(u.referralCode)}${u.referredBy ? ' <span class="badge">davetli</span>' : ''}</td><td>${tl(u.credits || 0)}</td><td>${dt(u.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Henüz müşteri yok</td></tr>'}
    </tbody></table></div>`;
  }

  async function jobs() {
    const r = await api('/admin/jobs');
    C().innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No</th><th>Hizmet</th><th>Müşteri</th><th>Çekici</th><th>Güzergah</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>
      ${r.jobs.map((j) => `<tr><td><b>${j.no}</b></td><td>${h(S.cfg.services[j.service]?.name)}</td><td>${h(j.customer?.name || '—')}</td><td>${h(j.driver?.name || '—')}${j.driver?.bot ? ' <span class="badge">demo</span>' : ''}</td>
        <td class="small" style="max-width:260px">${h(j.pickup.address)}${j.dropoff ? ' → ' + h(j.dropoff.address) : ''}</td><td>${tl(j.price.total)}${j.price.code ? `<br><span class="tiny muted">${h(j.price.code.code)}</span>` : ''}</td><td>${statusBadge(j.status)}</td><td class="small">${dt(j.createdAt)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Henüz talep yok</td></tr>'}
    </tbody></table></div>`;
  }

  async function payments() {
    const r = await api('/admin/payments');
    C().innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fatura</th><th>Çekici</th><th>Tutar</th><th>İndirim</th><th>Ödenen</th><th>Dönem</th><th>Tarih</th></tr></thead><tbody>
      ${r.payments.map((p) => `<tr><td><b>${p.no}</b></td><td>${h(p.user?.name || '—')}</td><td>${tl(p.amount)}</td><td>${p.discount ? '−' + tl(p.discount) + ' (' + h(p.code) + ')' : '—'}</td><td><b>${tl(p.total)}</b></td><td class="small">${d8(p.period.from)} – ${d8(p.period.until)}</td><td class="small">${dt(p.createdAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Henüz ödeme yok</td></tr>'}
    </tbody></table></div>`;
  }

  function push() {
    C().innerHTML = `<div class="card stack" style="max-width:560px">
      <h2 style="margin-top:0">Toplu bildirim</h2>
      <label class="field"><span>Kime</span><select id="au"><option value="all">Herkes</option><option value="customer">Müşteriler</option><option value="driver">Çekiciler</option></select></label>
      <label class="field"><span>Başlık</span><input id="ti" maxlength="80" placeholder="Hafta sonuna özel %20 indirim"></label>
      <label class="field"><span>Mesaj</span><textarea id="bo" maxlength="300" placeholder="HAFTASONU20 koduyla tüm kurtarmalarda %20 indirim!"></textarea></label>
      <button class="btn" id="send">Gönder</button>
      <p class="small muted">Uygulama içi bildirim + bildirim izni veren cihazlara anlık (push) bildirim olarak gider.</p></div>`;
    $('#send').onclick = async () => {
      try { const r = await api('/admin/broadcast', { body: { audience: $('#au').value, title: $('#ti').value, body: $('#bo').value } }); toast(`${r.sent} kişiye gönderildi`); } catch (e) { fail(e); }
    };
  }

  boot();
})();
