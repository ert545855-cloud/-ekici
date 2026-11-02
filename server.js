// Yolda Kaldık — çekici & yol yardım platformu sunucusu
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

const store = require('./src/db');
const P = require('./src/pricing');
const sms = require('./src/sms');
const files = require('./src/files');
const bird = require('./src/bird');

const PORT = process.env.PORT || 3000;
const DEMO_MODE = (process.env.DEMO_MODE || 'true') !== 'false';
const OFFER_RADIUS_KM = Number(process.env.OFFER_RADIUS_KM || 40);
const SEARCH_TIMEOUT_MS = 3 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const FLEET_MAX = Number(process.env.FLEET_MAX_VEHICLES || 10); // firma paketine dahil en fazla araç (sahip dahil)
const MIN_PHOTOS = Number(process.env.MIN_DAMAGE_PHOTOS || 2); // yükleme ve teslimde en az fotoğraf
const SCHEDULE_LEAD_MS = 45 * 60 * 1000; // randevulu talepte çekici aramaya kaç dk önce başlanır
const DOC_TYPES = { ruhsat: 'Araç ruhsatı', kbelgesi: 'K belgesi', sigorta: 'Sigorta poliçesi', ehliyet: 'Sürücü belgesi (ehliyet)' };

const db = () => store.db;

// ---------- Kurulum: gizli anahtarlar, VAPID, admin, varsayılan kodlar ----------
function bootstrap() {
  const d = db();
  d.meta.jwtSecret = process.env.JWT_SECRET || d.meta.jwtSecret || crypto.randomBytes(32).toString('hex');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    d.meta.vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else if (!d.meta.vapid) {
    d.meta.vapid = webpush.generateVAPIDKeys();
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:destek@yoldakaldik.app', d.meta.vapid.publicKey, d.meta.vapid.privateKey);

  const adminPhone = normPhone(process.env.ADMIN_PHONE || '5000000000');
  const adminPass = process.env.ADMIN_PASSWORD || 'admin1234';
  let admin = d.users.find((u) => u.role === 'admin');
  if (!admin) {
    admin = newUser({ role: 'admin', name: 'Yönetici', phone: adminPhone, password: adminPass });
    d.users.push(admin);
  } else if (process.env.ADMIN_PASSWORD) {
    admin.phone = adminPhone;
    admin.passHash = bcrypt.hashSync(adminPass, 10);
  }

  if (!d.meta.codesSeeded) {
    const now = new Date().toISOString();
    d.codes.push(
      { code: 'ILK30', label: 'İlk kurtarmaya %30', type: 'percent', value: 30, maxDiscount: 1500, target: 'ride', firstRideOnly: true, perUser: 1, maxUses: 0, used: 0, usedBy: [], active: true, createdAt: now },
      { code: 'HOSGELDIN', label: '250 TL hoş geldin indirimi', type: 'amount', value: 250, target: 'ride', perUser: 1, maxUses: 0, used: 0, usedBy: [], active: true, createdAt: now },
      { code: 'CEKICI20', label: 'Çekici paketi %20', type: 'percent', value: 20, target: 'subscription', perUser: 1, maxUses: 0, used: 0, usedBy: [], active: true, createdAt: now },
      { code: 'YKDEMO', label: 'Demo: ilk ay ücretsiz', type: 'percent', value: 100, target: 'subscription', perUser: 1, maxUses: 100, used: 0, usedBy: [], active: true, createdAt: now }
    );
    d.meta.codesSeeded = true;
  }
  store.save();
}

// ---------- Yardımcılar ----------
function normPhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.replace(/^90/, '').replace(/^0/, '').slice(-10);
}
function refCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'YK';
  for (let i = 0; i < 5; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}
function newUser({ role, name, phone, password, driver }) {
  return {
    id: store.id('u_'),
    role,
    name: String(name || '').trim().slice(0, 60),
    phone: normPhone(phone),
    passHash: bcrypt.hashSync(String(password), 10),
    createdAt: new Date().toISOString(),
    referralCode: refCode(),
    referredBy: null,
    credits: 0,
    addresses: [],
    pushSubs: [],
    driver: driver || null,
  };
}
function ownSubActive(u) {
  return !!(u && u.driver && u.driver.subscription && new Date(u.driver.subscription.until) > new Date());
}
// Firma şoförünün paketi firma sahibinin paketidir
function firmOwner(u) {
  return u?.driver?.firmId ? db().users.find((x) => x.id === u.driver.firmId && x.role === 'driver') : null;
}
const subActive = (u) => (u?.driver?.firmId ? ownSubActive(firmOwner(u)) : ownSubActive(u));
// Belge onayı: firma şoförü K belgesini firmadan devralır
function requiredDocs(u) {
  return u?.driver?.firmId ? ['ruhsat', 'sigorta', 'ehliyet'] : Object.keys(DOC_TYPES);
}
function approvalStatus(u) {
  if (!u || u.role !== 'driver') return null;
  if (u.bot) return 'approved';
  const docs = u.driver.docs || {};
  const need = requiredDocs(u);
  if (need.some((k) => docs[k]?.status === 'rejected')) return 'rejected';
  if (need.some((k) => !docs[k])) return 'missing';
  if (need.some((k) => docs[k].status !== 'approved')) return 'pending';
  if (u.driver.firmId && firmOwner(u)?.driver?.docs?.kbelgesi?.status !== 'approved') return 'firm_pending';
  return 'approved';
}
const approved = (u) => approvalStatus(u) === 'approved';
function approvalError(u) {
  return {
    missing: 'İş alabilmek için belgelerinizi yükleyin (Hesap → Belgelerim)',
    pending: 'Belgeleriniz inceleniyor. Onaylanınca iş almaya başlayabilirsiniz.',
    rejected: 'Bazı belgeleriniz reddedildi. Hesap → Belgelerim bölümünden yeniden yükleyin.',
    firm_pending: 'Firmanızın K belgesi henüz onaylanmadı.',
  }[approvalStatus(u)];
}

function publicUser(u) {
  if (!u) return null;
  const { passHash, pushSubs, expoTokens, ...rest } = u;
  const out = { ...rest, pushEnabled: (pushSubs || []).length + (expoTokens || []).length > 0, subscriptionActive: subActive(u) };
  if (u.role === 'driver') {
    const docs = {};
    Object.keys(DOC_TYPES).forEach((k) => {
      const d = u.driver.docs?.[k];
      if (d) docs[k] = { ...d, url: files.url(d.fileId) };
    });
    const owner = firmOwner(u);
    out.driver = { ...u.driver, docs };
    out.approval = approvalStatus(u);
    out.requiredDocs = requiredDocs(u);
    out.firm = u.driver.isFirmOwner ? { name: u.driver.company || u.name, owner: true } : owner ? { name: owner.driver.company || owner.name, owner: false, ownerName: owner.name } : null;
    out.subscriptionUntil = (owner || u).driver?.subscription?.until || null;
  }
  return out;
}
function publicDriver(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    plate: u.driver?.plate,
    vehicle: u.driver?.vehicle,
    company: u.driver?.company,
    rating: u.driver?.ratingCount ? Math.round((u.driver.ratingSum / u.driver.ratingCount) * 10) / 10 : 5,
    lat: u.driver?.lat,
    lng: u.driver?.lng,
    bot: !!u.bot,
  };
}
// forCustomer=true ise eşleşme kodu (PIN) dahil edilir; çekici ve admin kodu asla görmez
function publicJob(j, forCustomer = false) {
  const customer = db().users.find((u) => u.id === j.customerId);
  const driver = j.driverId ? findDriver(j.driverId) : null;
  const { pin, pinTries, pinLockedUntil, ...rest } = j;
  return {
    ...rest,
    pin: forCustomer ? pin : undefined,
    photos: {
      pickup: (j.photos?.pickup || []).map((p) => ({ ...p, url: files.url(p.id) })),
      dropoff: (j.photos?.dropoff || []).map((p) => ({ ...p, url: files.url(p.id) })),
    },
    messages: (j.messages || []).map((m) => (m.file ? { ...m, url: files.url(m.file) } : m)),
    verified: isVerified(j),
    pinLocked: !!(pinLockedUntil && pinLockedUntil > Date.now()),
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    driver: publicDriver(driver),
    eta: driver && driver.driver?.lat != null ? etaMin(driver.driver, j.status === 'towing' ? j.dropoff : j.pickup) : null,
  };
}
const isVerified = (j) => j.pin == null || !!j.verified;
const newPin = () => String(crypto.randomInt(1000, 10000));
function etaMin(from, to) {
  if (!from || !to || from.lat == null) return null;
  return Math.max(1, Math.round((P.roadKm(from, to) / 32) * 60));
}

function sign(u) {
  return jwt.sign({ uid: u.id, role: u.role }, db().meta.jwtSecret, { expiresIn: '60d' });
}
function auth(...roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    try {
      const p = jwt.verify(token, db().meta.jwtSecret);
      const u = db().users.find((x) => x.id === p.uid);
      if (!u) throw new Error('no user');
      if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
      req.user = u;
      next();
    } catch {
      res.status(401).json({ error: 'Oturum açmanız gerekiyor' });
    }
  };
}
const wrap = (fn) => (req, res) => {
  try {
    const r = fn(req, res);
    if (r && r.catch) r.catch((e) => res.status(400).json({ error: e.message }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
const isPoint = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const cleanPoint = (p) => (isPoint(p) ? { lat: +p.lat, lng: +p.lng, address: String(p.address || '').slice(0, 200) } : null);

// ---------- Bildirimler (uygulama içi + Web Push) ----------
function notify(userId, title, body, data = {}) {
  const u = db().users.find((x) => x.id === userId);
  if (!u) return;
  const n = { id: store.id('n_'), userId, title, body, data, read: false, createdAt: new Date().toISOString() };
  db().notifications.push(n);
  if (db().notifications.length > 5000) db().notifications.splice(0, 1000);
  store.save();
  io.to('user:' + userId).emit('notify', n);
  const payload = JSON.stringify({ title, body, data: { ...data, url: data.url || (u.role === 'driver' ? '/cekici' : '/') } });
  (u.pushSubs || []).forEach((sub) => {
    webpush.sendNotification(sub, payload, { TTL: data.type === 'offer' ? 120 : 3600, urgency: 'high' }).catch((err) => dropDeadSub(u, sub, err));
  });
  expoPush(u, title, body, { ...data, url: data.url || (u.role === 'driver' ? '/cekici' : '/') });
}

// Gerçek yol mesafesi: Mapbox Directions → OSRM → kuş uçuşu tahmini (null)
const distCache = new Map();
async function routeDistanceKm(a, b) {
  if (!a || !b) return null;
  const key = [a.lat, a.lng, b.lat, b.lng].map((x) => x.toFixed(4)).join(',');
  if (distCache.has(key)) return distCache.get(key);
  const get = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  let km = null;
  if (process.env.MAPBOX_TOKEN) {
    const j = await get(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=false&access_token=${encodeURIComponent(process.env.MAPBOX_TOKEN)}`);
    if (j?.routes?.[0]) km = j.routes[0].distance / 1000;
  }
  if (km == null) {
    const j = await get(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
    if (j?.routes?.[0]) km = j.routes[0].distance / 1000;
  }
  if (km != null) {
    distCache.set(key, km);
    if (distCache.size > 2000) distCache.delete(distCache.keys().next().value);
  }
  return km;
}
const driverShare = (j) => j.price.total - (j.price.kasko || 0);

function notifyPushOnly(u, title, body, data = {}) {
  io.to('user:' + u.id).emit('chat:ping', { title, body, data });
  const payload = JSON.stringify({ title, body, data });
  (u.pushSubs || []).forEach((sub) => webpush.sendNotification(sub, payload, { TTL: 600, urgency: 'high' }).catch((err) => dropDeadSub(u, sub, err)));
  expoPush(u, title, body, data);
}
// iOS/Android uygulaması (Expo) bildirimleri
function expoPush(u, title, body, data = {}) {
  const tokens = u.expoTokens || [];
  if (!tokens.length) return;
  const offer = data.type === 'offer';
  const msgs = tokens.map((t) => ({ to: t.token, title, body, data, sound: 'default', priority: 'high', channelId: offer ? 'jobs' : 'default', ttl: offer ? 120 : 3600, interruptionLevel: offer ? 'time-sensitive' : 'active' }));
  fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: 'Bearer ' + process.env.EXPO_ACCESS_TOKEN } : {}) }, body: JSON.stringify(msgs) })
    .then((r) => r.json())
    .then((j) => {
      (j.data || []).forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          u.expoTokens = (u.expoTokens || []).filter((x) => x.token !== msgs[i].to);
          store.save();
        } else if (ticket.status === 'error') console.warn('Expo push:', ticket.message);
      });
    })
    .catch((e) => console.warn('Expo push gönderilemedi:', e.message));
}
// Geçersiz (süresi dolmuş, başka anahtarla açılmış) abonelikleri sil; uygulama açılınca yeniden abone olunur
function dropDeadSub(u, sub, err) {
  const code = err?.statusCode;
  if ([400, 401, 403, 404, 410].includes(code)) {
    u.pushSubs = (u.pushSubs || []).filter((s) => s.endpoint !== sub.endpoint);
    store.save();
  } else console.warn('Push gönderilemedi:', code || err?.message);
}

// ---------- Demo çekiciler (gerçek çekici yokken akışı göstermek için) ----------
const bots = new Map();
const BOT_NAMES = ['Murat Yıldız', 'Hakan Çelik', 'Emre Kaya', 'Serkan Aydın', 'Volkan Şahin', 'Burak Demir', 'Okan Arslan', 'Cem Koç'];
const BOT_VEHICLES = { oto: 'Ford Cargo Kayar Kasa', agir: 'Mercedes Actros Ahtapot', moto: 'Isuzu NPR Moto Platform', yol: 'Fiat Doblo Servis' };
function findDriver(id) {
  return bots.get(id) || db().users.find((u) => u.id === id && u.role === 'driver');
}
// Demo çekiciler yalnızca yol üzerinde durur (deniz/bina içinde görünmesin) ve rota boyunca ilerler
async function fetchJson(url, ms = 3500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { signal: ctrl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}
// Dönüş: {lat,lng} yola oturtuldu · null yola uzak (deniz vb.) · undefined servis yok
async function snapToRoad(p) {
  const j = await fetchJson(`https://router.project-osrm.org/nearest/v1/driving/${p.lng},${p.lat}?number=1`);
  const w = j?.waypoints?.[0];
  if (w) return w.distance < 200 ? { lat: w.location[1], lng: w.location[0] } : null;
  if (process.env.MAPBOX_TOKEN) {
    const q = await fetchJson(`https://api.mapbox.com/directions/v5/mapbox/driving/${p.lng},${p.lat};${(p.lng + 0.001).toFixed(6)},${p.lat}?overview=false&access_token=${encodeURIComponent(process.env.MAPBOX_TOKEN)}`);
    const mw = q?.waypoints?.[0];
    if (mw) return mw.distance < 200 ? { lat: mw.location[1], lng: mw.location[0] } : null;
  }
  return undefined;
}
// Yol boyunca güzergah: [[lat,lng], ...]
async function roadPath(a, b) {
  const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  let j = await fetchJson(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
  if (!j?.routes?.[0] && process.env.MAPBOX_TOKEN) j = await fetchJson(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=full&geometries=geojson&access_token=${encodeURIComponent(process.env.MAPBOX_TOKEN)}`);
  const g = j?.routes?.[0]?.geometry?.coordinates;
  return g && g.length > 1 ? g.map(([x, y]) => [y, x]) : [[a.lat, a.lng], [b.lat, b.lng]];
}
const BOT_TARGET = 4; // bir bölgede en fazla bu kadar demo çekici
const spawning = new Set();
function makeBot(pos, svc) {
  const id = 'bot_' + crypto.randomBytes(4).toString('hex');
  return {
    id, bot: true, role: 'driver',
    name: BOT_NAMES[crypto.randomInt(BOT_NAMES.length)],
    phone: '5' + String(crypto.randomInt(100000000, 999999999)),
    driver: {
      lat: pos.lat, lng: pos.lng, heading: Math.round(Math.random() * 360), online: true, busy: false,
      services: svc === 'oto' ? ['oto', 'moto'] : [svc],
      plate: `34 ${'ABCDEFGHKLMNPRSTVYZ'[crypto.randomInt(19)]}${'ABCDEFGHKLMNPRSTVYZ'[crypto.randomInt(19)]} ${crypto.randomInt(100, 999)}`,
      vehicle: BOT_VEHICLES[svc], ratingSum: 46 + crypto.randomInt(4), ratingCount: 10,
    },
  };
}
const offsetPoint = (c, km, ang) => ({ lat: c.lat + (km / 111) * Math.sin(ang), lng: c.lng + (km / (111 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(ang) });
async function ensureBots(center, service) {
  if (!DEMO_MODE || !isPoint(center)) return;
  const key = center.lat.toFixed(2) + ',' + center.lng.toFixed(2);
  if (spawning.has(key)) return;
  const near = [...bots.values()].filter((b) => P.haversineKm(b.driver, center) < 5);
  const needSvc = service && !near.some((b) => !b.driver.busy && b.driver.services.includes(service));
  let want = Math.max(0, BOT_TARGET - near.length);
  if (!want && !needSvc) return;
  if (!want) want = 1;
  spawning.add(key);
  try {
    const mix = ['oto', 'agir', 'oto', 'yol'];
    for (let i = 0; i < want; i++) {
      const svc = needSvc && i === 0 ? service : mix[(near.length + i) % mix.length];
      let pos = null;
      let offline = false;
      for (let k = 0; k < 5 && !pos; k++) {
        const snapped = await snapToRoad(offsetPoint(center, 0.5 + Math.random() * 2.5, Math.random() * Math.PI * 2));
        if (snapped === undefined) { offline = true; break; }
        pos = snapped;
      }
      // Rota servisine ulaşılamazsa müşterinin çok yakınında (karada) beklet
      if (!pos && offline) pos = offsetPoint(center, 0.15 + Math.random() * 0.3, Math.random() * Math.PI * 2);
      if (!pos) continue;
      const bot = makeBot(pos, svc);
      bots.set(bot.id, bot);
    }
  } finally {
    spawning.delete(key);
  }
  if (bots.size > 300) [...bots.keys()].slice(0, 100).forEach((k) => !bots.get(k).driver.busy && bots.delete(k));
}

async function moveBotTo(bot, job, target, onArrive) {
  const path = await roadPath(bot.driver, target);
  // Güzergahı eşit aralıklı adımlara böl
  const seg = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + P.haversineKm({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] }));
  const total = seg[seg.length - 1] || 0.001;
  const steps = Math.min(45, Math.max(12, Math.round(total * 5)));
  const at = (f) => {
    const d = f * total;
    let i = seg.findIndex((x) => x >= d);
    if (i <= 0) return path[0];
    const r = (d - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
    return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * r, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * r];
  };
  let n = 0;
  const t = setInterval(() => {
    const j = db().jobs.find((x) => x.id === job.id);
    if (!j || ['cancelled', 'completed', 'expired'].includes(j.status) || j.driverId !== bot.id) {
      clearInterval(t);
      bot.driver.busy = false;
      return;
    }
    n++;
    const [la, ln] = at(Math.min(1, n / steps));
    bot.driver.heading = (Math.atan2(ln - bot.driver.lng, la - bot.driver.lat) * 180) / Math.PI;
    bot.driver.lat = la;
    bot.driver.lng = ln;
    emitDriverLoc(j, bot);
    if (n >= steps) {
      clearInterval(t);
      bot.driver.lat = target.lat;
      bot.driver.lng = target.lng;
      emitDriverLoc(j, bot);
      onArrive();
    }
  }, 1200);
}

async function runBot(job) {
  const j = db().jobs.find((x) => x.id === job.id);
  if (!j || j.status !== 'searching') return;
  await ensureBots(j.pickup, j.service);
  if (j.status !== 'searching') return;
  const candidates = [...bots.values()].filter((b) => !b.driver.busy && b.driver.services.includes(j.service) && P.haversineKm(b.driver, j.pickup) < 15);
  candidates.sort((a, b) => P.haversineKm(a.driver, j.pickup) - P.haversineKm(b.driver, j.pickup));
  let bot = candidates[0];
  if (!bot) {
    bot = makeBot(offsetPoint(j.pickup, 0.4, Math.random() * Math.PI * 2), j.service);
    bots.set(bot.id, bot);
  }
  bot.driver.busy = true;
  assignDriver(j, bot);
  setTimeout(() => {
    moveBotTo(bot, j, j.pickup, () => {
      setStatus(j, 'arrived');
      setTimeout(() => {
        if (j.status !== 'arrived') return;
        verifyJob(j);
      }, 6000);
      setTimeout(() => {
        if (j.status !== 'arrived' || !isVerified(j)) return;
        if (j.dropoff) {
          setStatus(j, 'towing');
          moveBotTo(bot, j, j.dropoff, () => {
            completeJob(j);
            bot.driver.busy = false;
          });
        } else {
          setStatus(j, 'servicing');
          setTimeout(() => {
            if (j.status === 'servicing') completeJob(j);
            bot.driver.busy = false;
          }, 9000);
        }
      }, 10000);
    });
  }, 2500);
}

// ---------- İş akışı ----------
const STATUS_TEXT = {
  scheduled: 'Randevulu talep',
  searching: 'Yakındaki çekiciler aranıyor',
  accepted: 'Çekici yola çıktı',
  arrived: 'Çekici konumunuzda',
  towing: 'Aracınız çekiliyor',
  servicing: 'Yol yardımı yapılıyor',
  completed: 'Kurtarma tamamlandı',
  cancelled: 'Talep iptal edildi',
  expired: 'Çekici bulunamadı',
};
const ACTIVE = ['searching', 'accepted', 'arrived', 'towing', 'servicing'];

function pushTimeline(j, status, note) {
  j.status = status;
  j.timeline.push({ status, at: new Date().toISOString(), note: note || STATUS_TEXT[status] });
}
function broadcastJob(j) {
  io.to('user:' + j.customerId).emit('job:update', publicJob(j, true));
  const rooms = ['role:admin'];
  if (j.driverId) rooms.push('user:' + j.driverId);
  io.to(rooms).emit('job:update', publicJob(j));
  store.save();
}
function emitDriverLoc(j, d) {
  const target = j.status === 'towing' ? j.dropoff : j.pickup;
  const payload = { jobId: j.id, lat: d.driver.lat, lng: d.driver.lng, heading: d.driver.heading || 0, eta: etaMin(d.driver, target) };
  io.to(['job:' + j.id, 'user:' + j.customerId, 'role:admin']).emit('job:driver', payload);
}
function eligibleDrivers(j) {
  return db().users.filter(
    (u) =>
      u.role === 'driver' &&
      u.driver?.online &&
      subActive(u) &&
      approved(u) &&
      (u.driver.services || []).includes(j.service) &&
      !db().jobs.some((x) => x.driverId === u.id && ACTIVE.includes(x.status)) &&
      (u.driver.lat == null || P.haversineKm(u.driver, j.pickup) <= OFFER_RADIUS_KM)
  );
}
function dispatch(j) {
  const drivers = eligibleDrivers(j);
  j.offeredTo = drivers.map((d) => d.id);
  const pj = publicJob(j);
  drivers.forEach((d) => {
    const km = d.driver.lat != null ? Math.round(P.haversineKm(d.driver, j.pickup) * 10) / 10 : null;
    io.to('user:' + d.id).emit('job:offer', { ...pj, distanceToPickup: km });
    notify(d.id, '🚨 Yeni kurtarma talebi', `${P.SERVICES[j.service].name}${j.kasko ? ' · Kasko güvenceli' : ''} · ${km != null ? km + ' km uzakta · ' : ''}${fmtTL(j.price.total)}`, { jobId: j.id, type: 'offer', url: '/cekici' });
  });
  store.save();
  if (DEMO_MODE) {
    const delay = drivers.length ? 25000 : 6000 + crypto.randomInt(4000);
    setTimeout(() => runBot(j), delay);
  }
  const timeout = j.scheduledAt ? Math.max(SEARCH_TIMEOUT_MS, new Date(j.scheduledAt).getTime() + 15 * 60 * 1000 - Date.now()) : SEARCH_TIMEOUT_MS;
  setTimeout(() => {
    if (j.status === 'searching') {
      pushTimeline(j, 'expired');
      releaseCode(j);
      notify(j.customerId, 'Çekici bulunamadı', 'Şu an yakınınızda müsait çekici yok. Lütfen tekrar deneyin.', { jobId: j.id });
      io.to('role:driver').emit('job:gone', { id: j.id });
      broadcastJob(j);
    }
  }, timeout);
}
function assignDriver(j, d) {
  j.driverId = d.id;
  j.acceptedAt = new Date().toISOString();
  pushTimeline(j, 'accepted', `${d.name} talebi kabul etti`);
  const eta = etaMin(d.driver, j.pickup);
  notify(j.customerId, 'Çekiciniz yolda 🚛', `${d.name} · ${d.driver.plate}${eta ? ' · ~' + eta + ' dk' : ''} · Eşleşme kodunuz: ${j.pin}`, { jobId: j.id });
  (j.offeredTo || []).forEach((id) => id !== d.id && io.to('user:' + id).emit('job:gone', { id: j.id }));
  broadcastJob(j);
  emitDriverLoc(j, d);
}
function setStatus(j, status) {
  pushTimeline(j, status);
  const msg = {
    arrived: ['Çekici geldi 📍', `Eşleşme kodunuz ${j.pin}. Kodu yalnızca yanınızdaki çekiciye (${findDriver(j.driverId)?.driver?.plate || ''}) söyleyin.`],
    towing: ['Aracınız yolda', 'Aracınız varış noktasına çekiliyor. Canlı takip edebilirsiniz.'],
    servicing: ['Yol yardımı başladı', 'Ekibimiz aracınız üzerinde çalışıyor.'],
  }[status];
  if (msg) notify(j.customerId, msg[0], msg[1], { jobId: j.id });
  broadcastJob(j);
}
function verifyJob(j) {
  j.verified = true;
  j.verifiedAt = new Date().toISOString();
  if (j.status === 'accepted') pushTimeline(j, 'arrived');
  j.timeline.push({ status: j.status, at: j.verifiedAt, note: 'Eşleşme kodu doğrulandı' });
  notify(j.customerId, 'Eşleşme doğrulandı ✅', 'Çekiciniz kodunuzu doğru girdi. Aracınızı güvenle teslim edebilirsiniz.', { jobId: j.id });
  broadcastJob(j);
}
function completeJob(j) {
  if (j.status === 'completed') return;
  pushTimeline(j, 'completed');
  j.completedAt = new Date().toISOString();
  const c = db().users.find((u) => u.id === j.customerId);
  if (c && j.price.credit) c.credits = Math.max(0, (c.credits || 0) - j.price.credit);
  const d = findDriver(j.driverId);
  if (d && !d.bot) d.driver.earnings = (d.driver.earnings || 0) + driverShare(j);
  // Davet ödülü: davet edilen kişinin ilk tamamlanan kurtarması
  if (c && c.referredBy && !c.referralRewarded) {
    const inviter = db().users.find((u) => u.id === c.referredBy);
    c.referralRewarded = true;
    if (inviter) {
      inviter.credits = (inviter.credits || 0) + 250;
      notify(inviter.id, 'Davet ödülü kazandınız 🎉', `${c.name} ilk kurtarmasını tamamladı. Hesabınıza 250 TL kurtarma çeki eklendi.`);
    }
  }
  notify(j.customerId, 'Kurtarma tamamlandı ✅', `Toplam ${fmtTL(j.price.total)}. Çekicinizi puanlamayı unutmayın.`, { jobId: j.id, type: 'rate' });
  const dd = findDriver(j.driverId);
  birdMail(c, {
    subject: `Kurtarma fişiniz · ${j.no}`,
    title: 'Kurtarmanız tamamlandı',
    html: `<p>${P.SERVICES[j.service].name} hizmetiniz tamamlandı.</p>
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin:12px 0">
      <tr><td style="color:#66767a;padding:4px 0">Talep no</td><td align="right"><b>${j.no}</b></td></tr>
      <tr><td style="color:#66767a;padding:4px 0">Alış</td><td align="right">${(j.pickup.address || '').replace(/</g, '')}</td></tr>
      ${j.dropoff ? `<tr><td style="color:#66767a;padding:4px 0">Varış</td><td align="right">${(j.dropoff.address || '').replace(/</g, '')}</td></tr>` : ''}
      ${dd ? `<tr><td style="color:#66767a;padding:4px 0">Çekici</td><td align="right">${dd.name} · ${dd.driver.plate}</td></tr>` : ''}
      ${j.price.lines.map((l) => `<tr><td style="padding:4px 0">${l.label}</td><td align="right">${fmtTL(l.amount)}</td></tr>`).join('')}
      ${j.price.discount ? `<tr><td style="padding:4px 0;color:#c2410c">İndirim</td><td align="right" style="color:#c2410c">−${fmtTL(j.price.discount)}</td></tr>` : ''}
      ${j.price.credit ? `<tr><td style="padding:4px 0;color:#c2410c">Kurtarma çeki</td><td align="right" style="color:#c2410c">−${fmtTL(j.price.credit)}</td></tr>` : ''}
      <tr><td style="padding:10px 0;border-top:1px dashed #ddd"><b>Toplam</b></td><td align="right" style="border-top:1px dashed #ddd"><b>${fmtTL(j.price.total)}</b></td></tr></table>
      <p style="color:#66767a;font-size:13px">Ödeme yöntemi: ${j.payment === 'card' ? 'Kredi kartı (POS)' : 'Nakit'}${j.kasko ? ' · Kasko güvenceli taşıma' : ''}</p>`,
    cta: { label: 'Çekicinizi puanlayın', url: (process.env.APP_URL || 'https://yolda-kaldik.onrender.com') + '/' },
    idem: 'receipt/' + j.id,
    tag: 'receipt',
  });
  broadcastJob(j);
}
function releaseCode(j) {
  if (!j.price.code) return;
  const c = db().codes.find((x) => x.code === j.price.code.code);
  if (c) {
    c.used = Math.max(0, c.used - 1);
    const i = (c.usedBy || []).lastIndexOf(j.customerId);
    if (i >= 0) c.usedBy.splice(i, 1);
  }
}
const fmtDate = (s) => new Date(s).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i.test(String(e || '').trim());
// Bird'e kişi senkronu (arka planda, uygulamayı bekletmez)
function birdSync(u) {
  if (!bird.configured() || !u?.email) return;
  bird.syncUser(u).then(() => store.save()).catch((e) => console.warn('Bird senkron:', e.message));
}
function birdMail(u, opts) {
  if (!bird.configured() || !u?.email) return;
  bird.sendEmail({ to: { email: u.email, name: u.name }, ...opts }).catch((e) => console.warn('Bird e-posta:', e.message));
}
const fmtTL = (n) => new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' TL';

// ---------- HTTP ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

app.disable('x-powered-by');
const jsonSmall = express.json({ limit: '200kb' });
const jsonLarge = express.json({ limit: '6mb' });
app.use((req, res, next) => (req.path === '/api/files' ? jsonLarge : jsonSmall)(req, res, next));
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders: (res, p) => {
      if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

app.use('/vendor/googlemutant', express.static(path.join(__dirname, 'node_modules', 'leaflet.gridlayer.googlemutant', 'dist'), { maxAge: '30d' }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist'), { maxAge: '30d' }));

app.get('/health', (req, res) => res.json({ ok: true, demo: DEMO_MODE, persistent: store.persistent() }));
app.get('/api/config', (req, res) =>
  res.json({ services: P.SERVICES, roadside: P.ROADSIDE, subscriptionPrice: P.SUBSCRIPTION_PRICE, vapidPublicKey: db().meta.vapid.publicKey, demo: DEMO_MODE, googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '', mapboxToken: process.env.MAPBOX_TOKEN || '', smsLive: !!sms.configured(), docTypes: DOC_TYPES, kaskoPrice: P.KASKO_PRICE, minPhotos: MIN_PHOTOS, fleetMax: FLEET_MAX, support: process.env.SUPPORT_PHONE || '4440000' })
);

// --- SMS doğrulama kodları (bellekte, 5 dk geçerli) ---
const otps = new Map();
const otpKey = (purpose, role, phone) => `${purpose}:${role}:${phone}`;
app.post('/api/auth/otp', wrap(async (req, res) => {
  const phone = normPhone(req.body?.phone);
  const purpose = req.body?.purpose === 'reset' ? 'reset' : 'register';
  const role = req.body?.role === 'driver' ? 'driver' : 'customer';
  if (phone.length !== 10 || phone[0] !== '5') throw new Error('Geçerli bir cep telefonu girin (5xx xxx xx xx)');
  const exists = db().users.some((u) => u.phone === phone && u.role === role);
  if (purpose === 'register' && exists) throw new Error('Bu numara ile kayıtlı hesap var. Giriş yapın veya “Şifremi unuttum”u kullanın.');
  if (purpose === 'reset' && !exists) throw new Error('Bu numarayla kayıtlı hesap bulunamadı');
  const key = otpKey(purpose, role, phone);
  const prev = otps.get(key);
  const now = Date.now();
  if (prev && now - prev.sentAt < 60 * 1000) throw new Error(`Yeni kod için ${Math.ceil((60 * 1000 - (now - prev.sentAt)) / 1000)} sn bekleyin`);
  const hourly = (prev?.history || []).filter((t) => now - t < 60 * 60 * 1000);
  if (hourly.length >= 5) throw new Error('Çok fazla kod istendi. Bir saat sonra tekrar deneyin.');
  const code = String(crypto.randomInt(100000, 1000000));
  await sms.send(phone, `Yolda Kaldık doğrulama kodunuz: ${code}. Kodu kimseyle paylaşmayın.`);
  otps.set(key, { code, exp: now + 5 * 60 * 1000, tries: 0, sentAt: now, history: [...hourly, now] });
  res.json({ ok: true, expiresIn: 300, demoCode: sms.configured() ? undefined : code });
}));
function checkOtp(purpose, role, phone, code) {
  const key = otpKey(purpose, role, phone);
  const o = otps.get(key);
  if (!o || o.exp < Date.now()) throw new Error('Doğrulama kodunun süresi doldu. Yeni kod isteyin.');
  if (o.tries >= 5) throw new Error('Çok fazla hatalı deneme. Yeni kod isteyin.');
  if (String(code || '').replace(/\D/g, '') !== o.code) {
    o.tries++;
    throw new Error(`Doğrulama kodu hatalı (${5 - o.tries} deneme hakkı kaldı)`);
  }
  otps.delete(key);
}
setInterval(() => { const n = Date.now(); for (const [k, o] of otps) if (o.exp < n - 60 * 60 * 1000) otps.delete(k); }, 10 * 60 * 1000);

// --- Hesaplar ---
app.post('/api/auth/register', wrap((req, res) => {
  const { role = 'customer', name, phone, password, referral, driver, otp, email, marketingConsent } = req.body || {};
  if (email && !validEmail(email)) throw new Error('Geçerli bir e-posta adresi girin');
  if (!['customer', 'driver'].includes(role)) throw new Error('Geçersiz hesap türü');
  if (!name || String(name).trim().length < 2) throw new Error('Ad soyad girin');
  if (normPhone(phone).length !== 10) throw new Error('Geçerli bir cep telefonu girin (5xx xxx xx xx)');
  if (!password || String(password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');
  if (db().users.some((u) => u.phone === normPhone(phone) && u.role === role)) throw new Error('Bu numara ile kayıtlı hesap var');
  const firm = role === 'driver' && !!driver?.firm;
  if (firm && String(driver?.company || '').trim().length < 2) throw new Error('Firma adını girin');
  if (referral && role === 'customer' && !db().users.some((x) => x.referralCode === String(referral).trim().toUpperCase())) throw new Error('Davet kodu bulunamadı');
  let driverData = null;
  if (role === 'driver') {
    const services = (driver?.services || []).filter((s) => P.SERVICES[s]);
    if (!driver?.plate || String(driver.plate).trim().length < 5) throw new Error('Plaka girin');
    if (!services.length) throw new Error('En az bir hizmet türü seçin');
    driverData = {
      plate: String(driver.plate).toUpperCase().trim().slice(0, 15),
      vehicle: String(driver.vehicle || '').slice(0, 60),
      company: String(driver.company || '').slice(0, 80),
      taxNo: String(driver.taxNo || '').slice(0, 20),
      services,
      online: false,
      lat: null,
      lng: null,
      earnings: 0,
      ratingSum: 0,
      ratingCount: 0,
      subscription: null,
      docs: {},
      isFirmOwner: firm,
      firmId: null,
    };
  }
  checkOtp('register', role, normPhone(phone), otp);
  const u = newUser({ role, name, phone, password, driver: driverData });
  u.phoneVerified = true;
  if (email) u.email = String(email).trim().toLowerCase();
  u.marketingConsent = { email: !!(email && marketingConsent), at: new Date().toISOString(), source: 'kayıt' };
  if (referral && role === 'customer') {
    const inviter = db().users.find((x) => x.referralCode === String(referral).trim().toUpperCase());
    if (!inviter) throw new Error('Davet kodu bulunamadı');
    u.referredBy = inviter.id;
    u.credits = 250;
  }
  db().users.push(u);
  store.save();
  birdSync(u);
  birdMail(u, {
    subject: role === 'driver' ? 'Yolda Kaldık çekici hesabınız açıldı' : 'Yolda Kaldık\'a hoş geldiniz',
    title: `Hoş geldiniz, ${u.name.split(' ')[0]}!`,
    html: role === 'driver'
      ? '<p>Çekici hesabınız oluşturuldu. İş almaya başlamak için çekici panelinden <b>ruhsat, K belgesi, sigorta ve ehliyet</b> fotoğraflarınızı yükleyin ve aylık paketinizi etkinleştirin.</p>'
      : `<p>Yolda kaldığınızda en yakın çekici dakikalar içinde yanınızda. Canlı takip, şeffaf fiyat ve 7/24 destek.</p>${u.credits ? `<p><b>${fmtTL(u.credits)} davet çekiniz</b> hesabınıza tanımlandı.</p>` : ''}<p>İlk kurtarmanızda <b>ILK30</b> koduyla %30 indirim kazanın.</p>`,
    cta: { label: role === 'driver' ? 'Çekici paneline git' : 'Uygulamayı aç', url: bird.status().from && (process.env.APP_URL || 'https://yolda-kaldik.onrender.com') + (role === 'driver' ? '/cekici' : '/') },
    idem: 'welcome/' + u.id,
    tag: 'welcome',
  });
  setTimeout(() => {
    if (role === 'driver') notify(u.id, 'Hoş geldiniz 👋', 'İş almak için belgelerinizi yükleyin ve aylık paketinizi etkinleştirin.', { url: '/cekici' });
    else notify(u.id, 'Yolda Kaldık\'a hoş geldiniz', u.credits ? '250 TL davet çekiniz hesabınızda. İlk kurtarmada ILK30 kodu ile %30 indirim!' : 'İlk kurtarmanızda ILK30 kodu ile %30 indirim kazanın.');
  }, 800);
  res.json({ token: sign(u), user: publicUser(u) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const { phone, password, role } = req.body || {};
  const candidates = db().users.filter((u) => u.phone === normPhone(phone) && (!role || u.role === role || u.role === 'admin'));
  const u = candidates.find((x) => bcrypt.compareSync(String(password || ''), x.passHash));
  if (!u) throw new Error('Telefon veya şifre hatalı');
  res.json({ token: sign(u), user: publicUser(u) });
}));

app.post('/api/auth/reset', wrap((req, res) => {
  const phone = normPhone(req.body?.phone);
  const role = req.body?.role === 'driver' ? 'driver' : 'customer';
  const pw = String(req.body?.password || '');
  if (pw.length < 6) throw new Error('Yeni şifre en az 6 karakter olmalı');
  const u = db().users.find((x) => x.phone === phone && x.role === role);
  if (!u) throw new Error('Bu numarayla kayıtlı hesap bulunamadı');
  checkOtp('reset', role, phone, req.body?.code);
  u.passHash = bcrypt.hashSync(pw, 10);
  u.phoneVerified = true;
  store.save();
  notify(u.id, 'Şifreniz değiştirildi', 'Bu işlemi siz yapmadıysanız hemen destek hattımızı arayın.');
  res.json({ token: sign(u), user: publicUser(u) });
}));

app.get('/api/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/me', auth(), wrap((req, res) => {
  const u = req.user;
  const b = req.body || {};
  if (b.name) u.name = String(b.name).trim().slice(0, 60);
  if (Array.isArray(b.addresses)) u.addresses = b.addresses.map(cleanPoint).filter(Boolean).slice(0, 8).map((a, i) => ({ ...a, label: String(b.addresses[i].label || 'Adres').slice(0, 30) }));
  if (b.settings) u.settings = { ...(u.settings || {}), ...b.settings };
  if (Array.isArray(b.emergencyContacts)) {
    u.emergencyContacts = b.emergencyContacts
      .map((c) => ({ name: String(c?.name || '').trim().slice(0, 40), phone: normPhone(c?.phone) }))
      .filter((c) => c.name && c.phone.length === 10)
      .slice(0, 3);
  }
  if (u.role === 'driver' && b.driver) {
    const d = b.driver;
    if (d.plate) u.driver.plate = String(d.plate).toUpperCase().slice(0, 15);
    if (d.vehicle != null) u.driver.vehicle = String(d.vehicle).slice(0, 60);
    if (d.company != null) u.driver.company = String(d.company).slice(0, 80);
    if (Array.isArray(d.services)) {
      const s = d.services.filter((x) => P.SERVICES[x]);
      if (s.length) u.driver.services = s;
    }
  }
  if (b.email !== undefined) {
    const e = String(b.email || '').trim().toLowerCase();
    if (e && !validEmail(e)) throw new Error('Geçerli bir e-posta adresi girin');
    u.email = e || null;
    if (!e) u.marketingConsent = { email: false, at: new Date().toISOString(), source: 'profil' };
  }
  if (b.marketingConsent !== undefined) {
    if (b.marketingConsent && !u.email) throw new Error('Önce e-posta adresinizi girin');
    u.marketingConsent = { email: !!b.marketingConsent, at: new Date().toISOString(), source: 'profil' };
  }
  if (b.email !== undefined || b.marketingConsent !== undefined) birdSync(u);
  if (b.password) {
    if (String(b.password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');
    u.passHash = bcrypt.hashSync(String(b.password), 10);
  }
  store.save();
  res.json({ user: publicUser(u) });
}));
app.delete('/api/me', auth('customer', 'driver'), (req, res) => {
  const d = db();
  d.users = d.users.filter((u) => u.id !== req.user.id);
  store.save();
  res.json({ ok: true });
});

// --- Push ---
app.post('/api/push/subscribe', auth(), wrap((req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) throw new Error('Geçersiz abonelik');
  const u = req.user;
  u.pushSubs = (u.pushSubs || []).filter((s) => s.endpoint !== sub.endpoint);
  u.pushSubs.push({ endpoint: sub.endpoint, keys: sub.keys, ua: String(sub.ua || '').slice(0, 120), at: new Date().toISOString() });
  u.pushSubs = u.pushSubs.slice(-5);
  store.save();
  res.json({ ok: true });
}));
app.post('/api/push/expo', auth(), wrap((req, res) => {
  const token = String(req.body?.token || '');
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new Error('Geçersiz cihaz anahtarı');
  // Aynı cihaz başka hesapta kayıtlıysa oradan kaldır (cihazda tek oturum)
  db().users.forEach((x) => { if (x.expoTokens?.some((t) => t.token === token)) x.expoTokens = x.expoTokens.filter((t) => t.token !== token); });
  const u = req.user;
  u.expoTokens = [...(u.expoTokens || []), { token, platform: String(req.body?.platform || '').slice(0, 10), at: new Date().toISOString() }].slice(-5);
  store.save();
  res.json({ ok: true });
}));
app.post('/api/push/test', auth(), (req, res) => {
  notify(req.user.id, 'Bildirimler açık 🔔', 'Kurtarma durumunuzu buradan anlık takip edeceksiniz.');
  res.json({ ok: true, devices: (req.user.pushSubs || []).length + (req.user.expoTokens || []).length });
});

app.get('/api/notifications', auth(), (req, res) => {
  const list = db().notifications.filter((n) => n.userId === req.user.id).slice(-50).reverse();
  res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
});
app.post('/api/notifications/read', auth(), (req, res) => {
  db().notifications.forEach((n) => n.userId === req.user.id && (n.read = true));
  store.save();
  res.json({ ok: true });
});

// --- Harita: yakındaki çekiciler ---
app.get('/api/nearby', async (req, res) => {
  const c = { lat: Number(req.query.lat), lng: Number(req.query.lng) };
  if (!isPoint(c)) return res.json({ drivers: [] });
  const service = P.SERVICES[req.query.service] ? req.query.service : null;
  await Promise.race([ensureBots(c, service).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
  const real = db().users.filter((u) => u.role === 'driver' && u.driver?.online && subActive(u) && u.driver.lat != null);
  const all = [...real, ...bots.values()]
    .filter((d) => !d.driver.busy && (!service || d.driver.services.includes(service)) && P.haversineKm(d.driver, c) < 8)
    .map((d) => ({ id: d.id, lat: d.driver.lat, lng: d.driver.lng, heading: d.driver.heading || 0, services: d.driver.services, eta: etaMin(d.driver, c) }))
    .sort((a, b) => a.eta - b.eta)
    .slice(0, 8);
  res.json({ drivers: all, nearestEta: all[0]?.eta || null });
});

// --- Fiyat & talep ---
app.post('/api/quote', auth('customer'), wrap(async (req, res) => {
  const b = req.body || {};
  const pickup = cleanPoint(b.pickup);
  const dropoff = P.SERVICES[b.service]?.needsDropoff ? cleanPoint(b.dropoff) : null;
  const distanceKm = dropoff ? await routeDistanceKm(pickup, dropoff) : null;
  res.json(P.quote(db(), { service: b.service, sub: b.sub, pickup, dropoff, code: b.code, user: req.user, at: b.scheduledAt, kasko: !!b.kasko, distanceKm }));
}));
app.post('/api/codes/check', auth(), wrap((req, res) => {
  const target = req.body.target === 'subscription' ? 'subscription' : 'ride';
  const v = P.validateCode(db(), req.body.code, { target, user: req.user });
  if (!v.ok) throw new Error(v.error || 'Kod geçersiz');
  res.json({ code: v.code.code, label: v.code.label, type: v.code.type, value: v.code.value });
}));

app.post('/api/jobs', auth('customer'), wrap(async (req, res) => {
  const b = req.body || {};
  const u = req.user;
  let scheduledAt = null;
  if (b.scheduledAt) {
    const t = new Date(b.scheduledAt);
    if (isNaN(t)) throw new Error('Randevu zamanı geçersiz');
    if (t - Date.now() < 30 * 60 * 1000) throw new Error('Randevu en az 30 dakika sonrası için olmalı');
    if (t - Date.now() > 14 * DAY) throw new Error('Randevu en fazla 14 gün sonrası için alınabilir');
    if (db().jobs.filter((j) => j.customerId === u.id && j.status === 'scheduled').length >= 3) throw new Error('En fazla 3 planlı talebiniz olabilir');
    scheduledAt = t.toISOString();
  } else if (db().jobs.some((j) => j.customerId === u.id && ACTIVE.includes(j.status))) throw new Error('Devam eden bir talebiniz var');
  const pickup = cleanPoint(b.pickup);
  const dropoff = P.SERVICES[b.service]?.needsDropoff ? cleanPoint(b.dropoff) : null;
  const distanceKm = dropoff ? await routeDistanceKm(pickup, dropoff) : null;
  const q = P.quote(db(), { service: b.service, sub: b.sub, pickup, dropoff, code: b.code, user: u, at: scheduledAt, kasko: !!b.kasko, distanceKm });
  if (b.code && q.codeError) throw new Error(q.codeError);
  if (q.code) {
    const c = db().codes.find((x) => x.code === q.code.code);
    c.used++;
    (c.usedBy = c.usedBy || []).push(u.id);
  }
  const j = {
    id: store.id('j_'),
    no: 'YK' + String(db().jobs.length + 1001),
    customerId: u.id,
    driverId: null,
    service: q.service,
    sub: q.sub,
    pickup,
    dropoff,
    distanceKm: q.distanceKm,
    price: { lines: q.lines, subtotal: q.subtotal, discount: q.discount, credit: q.credit, kasko: q.kasko, total: q.total, code: q.code },
    kasko: q.kasko > 0,
    payment: b.payment === 'card' ? 'card' : 'cash',
    vehicle: { plate: String(b.vehicle?.plate || '').toUpperCase().slice(0, 15), model: String(b.vehicle?.model || '').slice(0, 60) },
    note: String(b.note || '').slice(0, 300),
    contactPhone: normPhone(b.contactPhone || u.phone),
    status: scheduledAt ? 'scheduled' : 'searching',
    scheduledAt,
    pin: newPin(),
    verified: false,
    photos: { pickup: [], dropoff: [] },
    messages: [],
    timeline: [],
    createdAt: new Date().toISOString(),
  };
  db().jobs.push(j);
  if (scheduledAt) {
    pushTimeline(j, 'scheduled', 'Randevulu talep oluşturuldu: ' + fmtDate(scheduledAt));
    store.save();
    notify(u.id, 'Randevunuz oluşturuldu 📅', `${fmtDate(scheduledAt)} için ${P.SERVICES[j.service].name} talebiniz alındı. Saatinden önce çekici atanacak.`, { jobId: j.id });
  } else {
    pushTimeline(j, 'searching');
    dispatch(j);
  }
  res.json({ job: publicJob(j, true) });
}));

app.get('/api/jobs/active', auth('customer', 'driver'), (req, res) => {
  const key = req.user.role === 'driver' ? 'driverId' : 'customerId';
  const j = db().jobs.filter((x) => x[key] === req.user.id && ACTIVE.includes(x.status)).pop();
  res.json({ job: j ? publicJob(j, req.user.role === 'customer') : null });
});
app.get('/api/jobs', auth('customer', 'driver'), (req, res) => {
  const key = req.user.role === 'driver' ? 'driverId' : 'customerId';
  res.json({ jobs: db().jobs.filter((x) => x[key] === req.user.id).slice(-60).reverse().map((j) => publicJob(j, req.user.role === 'customer')) });
});
app.get('/api/jobs/offers', auth('driver'), (req, res) => {
  const u = req.user;
  if (!approved(u)) return res.json({ offers: [] });
  const offers = db().jobs
    .filter((j) => j.status === 'searching' && (u.driver.services || []).includes(j.service) && (u.driver.lat == null || P.haversineKm(u.driver, j.pickup) <= OFFER_RADIUS_KM))
    .map((j) => ({ ...publicJob(j), distanceToPickup: u.driver.lat != null ? Math.round(P.haversineKm(u.driver, j.pickup) * 10) / 10 : null }));
  res.json({ offers: subActive(u) && u.driver.online ? offers : [] });
});

function jobFor(req) {
  const j = db().jobs.find((x) => x.id === req.params.id);
  if (!j) throw new Error('Talep bulunamadı');
  return j;
}
app.post('/api/jobs/:id/accept', auth('driver'), wrap((req, res) => {
  const u = req.user;
  const j = jobFor(req);
  if (!subActive(u)) throw new Error(u.driver.firmId ? 'Firmanızın aylık paketi aktif değil' : 'İş almak için aylık paketinizi etkinleştirin');
  if (!approved(u)) throw new Error(approvalError(u));
  if (db().jobs.some((x) => x.driverId === u.id && ACTIVE.includes(x.status))) throw new Error('Önce aktif işinizi tamamlayın');
  if (j.status !== 'searching') throw new Error('Bu talep başka bir çekici tarafından alındı');
  if (!u.driver.services.includes(j.service)) throw new Error('Bu hizmet türü hesabınızda kapalı');
  if (isPoint(req.body?.location)) Object.assign(u.driver, { lat: +req.body.location.lat, lng: +req.body.location.lng });
  assignDriver(j, u);
  res.json({ job: publicJob(j) });
}));
app.post('/api/jobs/:id/status', auth('driver'), wrap((req, res) => {
  const j = jobFor(req);
  if (j.driverId !== req.user.id) throw new Error('Bu iş size ait değil');
  const next = req.body.status;
  const flow = { accepted: ['arrived'], arrived: [j.dropoff ? 'towing' : 'servicing'], towing: ['completed'], servicing: ['completed'] };
  if (!(flow[j.status] || []).includes(next)) throw new Error('Geçersiz durum geçişi');
  if (j.status === 'arrived' && !isVerified(j)) throw new Error('Önce müşterinin 4 haneli eşleşme kodunu girin');
  if (next === 'towing' && (j.photos?.pickup || []).length < MIN_PHOTOS) throw new Error(`Aracı yüklemeden önce en az ${MIN_PHOTOS} hasar fotoğrafı çekin`);
  if (next === 'completed' && j.dropoff && (j.photos?.dropoff || []).length < MIN_PHOTOS) throw new Error(`Teslimden önce en az ${MIN_PHOTOS} teslim fotoğrafı çekin`);
  if (next === 'completed') completeJob(j);
  else setStatus(j, next);
  res.json({ job: publicJob(j) });
}));
app.post('/api/jobs/:id/verify', auth('driver'), wrap((req, res) => {
  const j = jobFor(req);
  if (j.driverId !== req.user.id) throw new Error('Bu iş size ait değil');
  if (!['accepted', 'arrived'].includes(j.status)) throw new Error('Bu aşamada kod girilemez');
  if (isVerified(j)) return res.json({ job: publicJob(j) });
  if (j.pinLockedUntil && j.pinLockedUntil > Date.now()) {
    throw new Error(`Çok fazla hatalı deneme. ${Math.ceil((j.pinLockedUntil - Date.now()) / 60000)} dk sonra tekrar deneyin.`);
  }
  const given = String(req.body?.pin || '').replace(/\D/g, '');
  if (given !== j.pin) {
    j.pinTries = (j.pinTries || 0) + 1;
    const left = 5 - j.pinTries;
    if (left <= 0) {
      j.pinTries = 0;
      j.pinLockedUntil = Date.now() + 2 * 60 * 1000;
      notify(j.customerId, 'Güvenlik uyarısı ⚠️', 'Eşleşme kodu art arda 5 kez hatalı girildi. Kodunuzu yalnızca plakası eşleşen çekiciye söyleyin.', { jobId: j.id });
      store.save();
      throw new Error('Kod 5 kez hatalı girildi. 2 dakika bekleyin ve müşteriyle kodu teyit edin.');
    }
    store.save();
    throw new Error(`Kod hatalı. ${left} deneme hakkınız kaldı.`);
  }
  j.pinTries = 0;
  j.pinLockedUntil = null;
  verifyJob(j);
  res.json({ job: publicJob(j) });
}));
app.post('/api/jobs/:id/cancel', auth('customer', 'driver'), wrap((req, res) => {
  const j = jobFor(req);
  const u = req.user;
  const reason = String(req.body?.reason || '').slice(0, 120);
  if (u.role === 'customer') {
    if (j.customerId !== u.id) throw new Error('Bu talep size ait değil');
    if (!['scheduled', 'searching', 'accepted', 'arrived'].includes(j.status)) throw new Error('Bu aşamada iptal edilemez');
    const d = j.driverId ? findDriver(j.driverId) : null;
    pushTimeline(j, 'cancelled', 'Müşteri iptal etti' + (reason ? ': ' + reason : ''));
    releaseCode(j);
    if (d && d.bot) d.driver.busy = false;
    if (d && !d.bot) notify(d.id, 'Talep iptal edildi', `${j.no} numaralı talep müşteri tarafından iptal edildi.`, { jobId: j.id });
    io.to('role:driver').emit('job:gone', { id: j.id });
    broadcastJob(j);
  } else {
    if (j.driverId !== u.id) throw new Error('Bu iş size ait değil');
    if (!['accepted', 'arrived'].includes(j.status)) throw new Error('Bu aşamada bırakılamaz');
    j.driverId = null;
    pushTimeline(j, 'searching', 'Çekici işi bıraktı, yeni çekici aranıyor');
    notify(j.customerId, 'Yeni çekici aranıyor', 'Atanan çekici talebi bırakmak zorunda kaldı. Size en yakın çekiciyi arıyoruz.', { jobId: j.id });
    broadcastJob(j);
    j.verified = false;
    j.pinTries = 0;
    dispatch(j);
  }
  res.json({ job: publicJob(j, u.role === 'customer') });
}));
app.post('/api/jobs/:id/rate', auth('customer'), wrap((req, res) => {
  const j = jobFor(req);
  if (j.customerId !== req.user.id || j.status !== 'completed') throw new Error('Puanlanamaz');
  if (j.rating) throw new Error('Bu kurtarmayı zaten puanladınız');
  const stars = Math.min(5, Math.max(1, Math.round(Number(req.body.stars) || 0)));
  j.rating = { stars, comment: String(req.body.comment || '').slice(0, 300), at: new Date().toISOString() };
  const d = findDriver(j.driverId);
  if (d) {
    d.driver.ratingSum = (d.driver.ratingSum || 0) + stars;
    d.driver.ratingCount = (d.driver.ratingCount || 0) + 1;
    if (!d.bot) notify(d.id, `${'★'.repeat(stars)} yeni puan`, j.rating.comment || `${j.no} için ${stars} yıldız aldınız.`);
  }
  store.save();
  res.json({ job: publicJob(j, true) });
}));

// --- Çekici: durum, abonelik, istatistik ---
app.post('/api/driver/online', auth('driver'), wrap((req, res) => {
  const u = req.user;
  const on = !!req.body.online;
  if (on && !subActive(u)) throw new Error(u.driver.firmId ? 'Firmanızın aylık paketi aktif değil' : 'Çevrimiçi olmak için aylık paketinizi etkinleştirin');
  if (on && !approved(u)) throw new Error(approvalError(u));
  u.driver.online = on;
  if (isPoint(req.body.location)) Object.assign(u.driver, { lat: +req.body.location.lat, lng: +req.body.location.lng });
  store.save();
  res.json({ user: publicUser(u) });
}));
app.post('/api/driver/subscription/quote', auth('driver'), wrap((req, res) => res.json(P.subscriptionQuote(db(), { code: req.body.code, user: req.user }))));
app.use('/api/driver/subscription', (req, res, next) => {
  // Firma şoförleri paket satın almaz; firma sahibinin paketi geçerlidir
  if (req.method === 'POST' && req.path === '/' ) {
    try {
      const p = jwt.verify((req.headers.authorization || '').slice(7), db().meta.jwtSecret);
      const u = db().users.find((x) => x.id === p.uid);
      if (u?.driver?.firmId) return res.status(400).json({ error: 'Paketiniz firmanız tarafından karşılanıyor' });
    } catch {}
  }
  next();
});
app.post('/api/driver/subscription', auth('driver'), wrap((req, res) => {
  const u = req.user;
  const q = P.subscriptionQuote(db(), { code: req.body.code, user: u });
  if (req.body.code && q.codeError) throw new Error(q.codeError);
  let last4 = null;
  if (q.total > 0) {
    // Ödeme simülasyonu — gerçek ortamda iyzico / PayTR / Stripe entegrasyonu buraya bağlanır.
    const card = req.body.card || {};
    const num = String(card.number || '').replace(/\D/g, '');
    if (num.length < 15 || !luhn(num)) throw new Error('Kart numarası geçersiz');
    if (!/^\d{2}\/\d{2}$/.test(String(card.exp || ''))) throw new Error('Son kullanma tarihi AA/YY olmalı');
    if (!/^\d{3,4}$/.test(String(card.cvc || ''))) throw new Error('CVC geçersiz');
    last4 = num.slice(-4);
  }
  if (q.code) {
    const c = db().codes.find((x) => x.code === q.code.code);
    c.used++;
    (c.usedBy = c.usedBy || []).push(u.id);
  }
  const from = subActive(u) ? new Date(u.driver.subscription.until) : new Date();
  const until = new Date(from.getTime() + 30 * DAY);
  u.driver.subscription = { plan: 'aylik', since: u.driver.subscription?.since || new Date().toISOString(), until: until.toISOString(), autoRenew: req.body.autoRenew !== false, last4: last4 || u.driver.subscription?.last4 || null };
  const pay = { id: store.id('p_'), no: 'FT' + (db().payments.length + 20001), userId: u.id, kind: 'subscription', amount: q.price, discount: q.discount, total: q.total, code: q.code?.code || null, last4, period: { from: from.toISOString(), until: until.toISOString() }, createdAt: new Date().toISOString() };
  db().payments.push(pay);
  store.save();
  notify(u.id, 'Paketiniz aktif ✅', `Aylık çekici paketiniz ${until.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} tarihine kadar geçerli.`, { url: '/cekici' });
  birdMail(u, {
    subject: `Paket ödemeniz alındı · ${pay.no}`,
    title: 'Aylık çekici paketiniz aktif',
    html: `<p>Paketiniz <b>${until.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}</b> tarihine kadar geçerli.</p>
      <p>Ödeme no: <b>${pay.no}</b><br>Tutar: ${fmtTL(pay.amount)}${pay.discount ? `<br>İndirim (${pay.code}): −${fmtTL(pay.discount)}` : ''}<br><b>Ödenen: ${fmtTL(pay.total)}</b>${pay.last4 ? `<br>Kart: •••• ${pay.last4}` : ''}</p>`,
    cta: { label: 'Çekici paneline git', url: (process.env.APP_URL || 'https://yolda-kaldik.onrender.com') + '/cekici' },
    idem: 'invoice/' + pay.id,
    tag: 'invoice',
  });
  res.json({ user: publicUser(u), payment: pay });
}));
app.post('/api/driver/subscription/auto-renew', auth('driver'), wrap((req, res) => {
  if (!req.user.driver.subscription) throw new Error('Aktif paket yok');
  req.user.driver.subscription.autoRenew = !!req.body.autoRenew;
  store.save();
  res.json({ user: publicUser(req.user) });
}));
app.get('/api/driver/payments', auth('driver'), (req, res) => res.json({ payments: db().payments.filter((p) => p.userId === req.user.id).reverse() }));
app.get('/api/driver/stats', auth('driver'), (req, res) => {
  const mine = db().jobs.filter((j) => j.driverId === req.user.id && j.status === 'completed');
  const today = new Date().toDateString();
  const t = mine.filter((j) => new Date(j.completedAt).toDateString() === today);
  const month = mine.filter((j) => Date.now() - new Date(j.completedAt) < 30 * DAY);
  const sum = (a) => a.reduce((s, j) => s + driverShare(j), 0);
  const r = req.user.driver;
  // Son 7 gün kazanç
  const week = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    return { day: d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }), total: sum(mine.filter((j) => new Date(j.completedAt).toDateString() === d.toDateString())) };
  });
  res.json({ todayCount: t.length, todayTotal: sum(t), monthCount: month.length, monthTotal: sum(month), allCount: mine.length, rating: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null, ratingCount: r.ratingCount, week, net: sum(month) - (month.length ? P.SUBSCRIPTION_PRICE : 0) });
});

// --- Dosyalar (belge, hasar ve sohbet fotoğrafları) ---
app.post('/api/files', auth(), wrap(async (req, res) => {
  const kind = ['doc', 'damage', 'chat'].includes(req.body?.kind) ? req.body.kind : 'chat';
  const recent = (req.user._uploads || []).filter((t) => Date.now() - t < 60 * 1000);
  if (recent.length >= 20) throw new Error('Çok fazla yükleme, biraz bekleyin');
  req.user._uploads = [...recent, Date.now()];
  res.json(await files.save({ owner: req.user.id, kind, dataUrl: req.body?.dataUrl }));
}));
app.get('/api/files/:id', async (req, res) => {
  try {
    if (!files.verify(req.params.id, req.query.sig)) return res.status(403).end();
    const f = await files.read(req.params.id);
    if (!f) return res.status(404).end();
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(f.data);
  } catch {
    res.status(500).end();
  }
});

// --- Çekici belgeleri ---
app.post('/api/driver/docs', auth('driver'), wrap((req, res) => {
  const u = req.user;
  const type = req.body?.type;
  if (!DOC_TYPES[type]) throw new Error('Geçersiz belge türü');
  if (type === 'kbelgesi' && u.driver.firmId) throw new Error('K belgesi firma hesabından yüklenir');
  const fileId = String(req.body?.fileId || '');
  if (!/^f_[a-f0-9]{20}$/.test(fileId)) throw new Error('Önce fotoğraf yükleyin');
  u.driver.docs = u.driver.docs || {};
  u.driver.docs[type] = { fileId, status: 'pending', note: '', uploadedAt: new Date().toISOString() };
  store.save();
  db().users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, 'Yeni belge onay bekliyor', `${u.name} · ${DOC_TYPES[type]}`, { url: '/admin' }));
  io.to('role:admin').emit('admin:docs');
  res.json({ user: publicUser(u) });
}));

// --- Hasar fotoğrafları ---
app.post('/api/jobs/:id/photos', auth('driver'), wrap((req, res) => {
  const j = jobFor(req);
  if (j.driverId !== req.user.id) throw new Error('Bu iş size ait değil');
  const stage = req.body?.stage === 'dropoff' ? 'dropoff' : 'pickup';
  if (stage === 'pickup' && !['arrived'].includes(j.status)) throw new Error('Yükleme fotoğrafları araç başındayken çekilir');
  if (stage === 'dropoff' && !['towing', 'servicing'].includes(j.status)) throw new Error('Teslim fotoğrafları teslimde çekilir');
  const ids = (req.body?.fileIds || []).filter((x) => /^f_[a-f0-9]{20}$/.test(x)).slice(0, 8);
  if (!ids.length) throw new Error('Fotoğraf seçin');
  j.photos = j.photos || { pickup: [], dropoff: [] };
  j.photos[stage] = [...(j.photos[stage] || []), ...ids.map((id) => ({ id, at: new Date().toISOString() }))].slice(0, 12);
  j.timeline.push({ status: j.status, at: new Date().toISOString(), note: `${ids.length} ${stage === 'pickup' ? 'yükleme öncesi' : 'teslim'} fotoğrafı eklendi` });
  notify(j.customerId, stage === 'pickup' ? 'Aracınızın fotoğrafları çekildi 📷' : 'Teslim fotoğrafları eklendi 📷', 'Fotoğrafları takip ekranında görebilirsiniz.', { jobId: j.id });
  broadcastJob(j);
  res.json({ job: publicJob(j) });
}));

// --- Uygulama içi mesajlaşma ---
app.post('/api/jobs/:id/messages', auth('customer', 'driver'), wrap((req, res) => {
  const j = jobFor(req);
  const u = req.user;
  const from = j.customerId === u.id ? 'customer' : j.driverId === u.id ? 'driver' : null;
  if (!from) throw new Error('Bu talebin sohbetine erişiminiz yok');
  if (!['accepted', 'arrived', 'towing', 'servicing'].includes(j.status)) throw new Error('Sohbet yalnızca aktif kurtarma sırasında açıktır');
  const text = String(req.body?.text || '').trim().slice(0, 500);
  const file = /^f_[a-f0-9]{20}$/.test(req.body?.fileId || '') ? req.body.fileId : null;
  if (!text && !file) throw new Error('Mesaj boş olamaz');
  const m = { id: store.id('m_'), from, name: u.name, text, file, at: new Date().toISOString() };
  j.messages = [...(j.messages || []), m].slice(-300);
  store.save();
  const out = file ? { ...m, url: files.url(file) } : m;
  io.to(['user:' + j.customerId, ...(j.driverId ? ['user:' + j.driverId] : [])]).emit('job:message', { jobId: j.id, message: out });
  const to = from === 'customer' ? j.driverId : j.customerId;
  const toUser = to && db().users.find((x) => x.id === to);
  if (toUser) notifyPushOnly(toUser, `💬 ${u.name}`, text || '📷 Fotoğraf', { jobId: j.id, type: 'chat', url: toUser.role === 'driver' ? '/cekici' : '/' });
  // Demo çekici kısa bir yanıt verir
  const d = findDriver(j.driverId);
  if (d?.bot && from === 'customer') {
    setTimeout(() => {
      const reply = { id: store.id('m_'), from: 'driver', name: d.name, text: ['Tamamdır, yoldayım 👍', 'Anlaşıldı, birkaç dakikaya oradayım.', 'Not aldım, teşekkürler.'][crypto.randomInt(3)], file: null, at: new Date().toISOString() };
      j.messages = [...(j.messages || []), reply].slice(-300);
      store.save();
      io.to('user:' + j.customerId).emit('job:message', { jobId: j.id, message: reply });
    }, 2500);
  }
  res.json({ message: out });
}));

// --- Firma (filo) yönetimi ---
const fleetOwner = (req) => {
  const u = req.user;
  if (!u.driver?.isFirmOwner) throw new Error('Bu bölüm yalnızca firma hesapları içindir');
  return u;
};
const fleetMembers = (owner) => db().users.filter((x) => x.role === 'driver' && x.driver?.firmId === owner.id);
function fleetView(owner) {
  const all = [owner, ...fleetMembers(owner)];
  const members = all.map((m) => {
    const job = db().jobs.filter((j) => j.driverId === m.id && ACTIVE.includes(j.status)).pop();
    return {
      id: m.id, name: m.name, phone: m.phone, plate: m.driver.plate, vehicle: m.driver.vehicle, services: m.driver.services,
      online: !!m.driver.online, lat: m.driver.lat, lng: m.driver.lng, owner: m.id === owner.id, approval: approvalStatus(m),
      job: job ? { id: job.id, no: job.no, status: job.status, service: job.service, total: job.price.total, pickup: job.pickup } : null,
      earnings: m.driver.earnings || 0,
    };
  });
  const svc = new Set(all.flatMap((m) => m.driver.services));
  const near = (j) => all.some((m) => m.driver.lat == null || P.haversineKm(m.driver, j.pickup) <= OFFER_RADIUS_KM);
  const offers = db().jobs.filter((j) => j.status === 'searching' && svc.has(j.service) && near(j)).map((j) => publicJob(j));
  return { members, offers, max: FLEET_MAX, subscriptionActive: ownSubActive(owner) };
}
app.get('/api/fleet', auth('driver'), wrap((req, res) => res.json(fleetView(fleetOwner(req)))));
app.post('/api/fleet/members', auth('driver'), wrap((req, res) => {
  const owner = fleetOwner(req);
  const b = req.body || {};
  if (fleetMembers(owner).length + 1 >= FLEET_MAX) throw new Error(`Paketiniz en fazla ${FLEET_MAX} aracı kapsıyor`);
  if (!b.name || String(b.name).trim().length < 2) throw new Error('Şoför adını girin');
  if (normPhone(b.phone).length !== 10) throw new Error('Geçerli bir cep telefonu girin');
  if (!b.password || String(b.password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');
  if (db().users.some((u) => u.phone === normPhone(b.phone) && u.role === 'driver')) throw new Error('Bu numara ile kayıtlı çekici hesabı var');
  if (!b.plate || String(b.plate).trim().length < 5) throw new Error('Plaka girin');
  const services = (b.services || []).filter((s) => P.SERVICES[s]);
  if (!services.length) throw new Error('En az bir hizmet seçin');
  const m = newUser({
    role: 'driver', name: b.name, phone: b.phone, password: b.password,
    driver: { plate: String(b.plate).toUpperCase().trim().slice(0, 15), vehicle: String(b.vehicle || '').slice(0, 60), company: owner.driver.company, services, online: false, lat: null, lng: null, earnings: 0, ratingSum: 0, ratingCount: 0, subscription: null, docs: {}, isFirmOwner: false, firmId: owner.id },
  });
  db().users.push(m);
  store.save();
  res.json(fleetView(owner));
}));
app.delete('/api/fleet/members/:id', auth('driver'), wrap((req, res) => {
  const owner = fleetOwner(req);
  const m = fleetMembers(owner).find((x) => x.id === req.params.id);
  if (!m) throw new Error('Şoför bulunamadı');
  if (db().jobs.some((j) => j.driverId === m.id && ACTIVE.includes(j.status))) throw new Error('Şoförün devam eden işi var');
  db().users = db().users.filter((x) => x.id !== m.id);
  store.save();
  io.to('user:' + m.id).disconnectSockets(true);
  res.json(fleetView(owner));
}));
app.post('/api/fleet/assign', auth('driver'), wrap((req, res) => {
  const owner = fleetOwner(req);
  const j = db().jobs.find((x) => x.id === req.body?.jobId);
  const m = [owner, ...fleetMembers(owner)].find((x) => x.id === req.body?.driverId);
  if (!j || !m) throw new Error('Talep veya şoför bulunamadı');
  if (j.status !== 'searching') throw new Error('Bu talep artık açık değil');
  if (!ownSubActive(owner)) throw new Error('Firma paketiniz aktif değil');
  if (!approved(m)) throw new Error(`${m.name}: ${approvalError(m)}`);
  if (!m.driver.services.includes(j.service)) throw new Error(`${m.name} bu hizmeti vermiyor`);
  if (db().jobs.some((x) => x.driverId === m.id && ACTIVE.includes(x.status))) throw new Error(`${m.name} şu an başka bir işte`);
  assignDriver(j, m);
  if (m.id !== owner.id) notify(m.id, '📋 Firmanız size iş atadı', `${P.SERVICES[j.service].name} · ${j.pickup.address || ''} · ${fmtTL(j.price.total)}`, { jobId: j.id, url: '/cekici' });
  res.json(fleetView(owner));
}));

// --- Acil durum ---
app.post('/api/sos', auth('customer'), wrap(async (req, res) => {
  const u = req.user;
  const p = cleanPoint(req.body?.location);
  if (u._sosAt && Date.now() - u._sosAt < 60 * 1000) throw new Error('Acil durum bildirimi az önce gönderildi');
  u._sosAt = Date.now();
  const contacts = u.emergencyContacts || [];
  const link = p ? `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : '';
  const text = `ACİL: ${u.name} acil durum bildirdi.${p?.address ? ' ' + p.address + '.' : ''} Konum: ${link} - Yolda Kaldık`;
  let sent = 0;
  if (sms.configured()) {
    for (const c of contacts) {
      try { await sms.send(c.phone, text); sent++; } catch (e) { console.error('SOS SMS:', e.message); }
    }
  }
  db().users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, '🆘 Acil durum bildirimi', `${u.name} (0${u.phone}) · ${p?.address || link}`, { url: '/admin' }));
  res.json({ sent, contacts: contacts.length, smsLive: !!sms.configured(), text });
}));

function luhn(num) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// --- Yönetim paneli ---
const admin = auth('admin');
app.get('/api/admin/stats', admin, (req, res) => {
  const d = db();
  const drivers = d.users.filter((u) => u.role === 'driver');
  const month = (x) => Date.now() - new Date(x.createdAt) < 30 * DAY;
  res.json({
    customers: d.users.filter((u) => u.role === 'customer').length,
    drivers: drivers.length,
    activeSubs: drivers.filter(subActive).length,
    onlineDrivers: drivers.filter((u) => u.driver.online && subActive(u)).length,
    activeJobs: d.jobs.filter((j) => ACTIVE.includes(j.status)).length,
    scheduledJobs: d.jobs.filter((j) => j.status === 'scheduled').length,
    pendingApprovals: drivers.filter((u) => Object.values(u.driver.docs || {}).some((x) => x.status === 'pending')).length,
    smsLive: !!sms.configured(),
    completedJobs: d.jobs.filter((j) => j.status === 'completed').length,
    gmv: d.jobs.filter((j) => j.status === 'completed').reduce((s, j) => s + j.price.total, 0),
    kaskoRevenue: d.jobs.filter((j) => j.status === 'completed').reduce((s, j) => s + (j.price.kasko || 0), 0),
    kaskoJobs: d.jobs.filter((j) => j.kasko && !['cancelled', 'expired'].includes(j.status)).length,
    subRevenueMonth: d.payments.filter(month).reduce((s, p) => s + p.total, 0),
    subRevenueAll: d.payments.reduce((s, p) => s + p.total, 0),
    demo: DEMO_MODE,
  });
});
app.get('/api/admin/bird', admin, (req, res) => {
  const us = db().users.filter((u) => u.role !== 'admin');
  const withEmail = us.filter((u) => u.email);
  res.json({
    ...bird.status(),
    counts: {
      withEmail: withEmail.length,
      consentCustomers: withEmail.filter((u) => u.role === 'customer' && u.marketingConsent?.email).length,
      consentDrivers: withEmail.filter((u) => u.role === 'driver' && u.marketingConsent?.email).length,
      synced: withEmail.filter((u) => u.birdContactId).length,
    },
  });
});
app.post('/api/admin/bird/sync', admin, wrap(async (req, res) => {
  if (!bird.configured()) throw new Error('BIRD_API_KEY tanımlı değil');
  let ok = 0, failed = 0, lastError = null;
  for (const u of db().users.filter((x) => x.email && x.role !== 'admin')) {
    try { await bird.syncUser(u); ok++; } catch (e) { failed++; lastError = e.message; }
  }
  store.save();
  res.json({ ok, failed, lastError });
}));
app.post('/api/admin/bird/test', admin, wrap(async (req, res) => {
  if (!bird.configured()) throw new Error('BIRD_API_KEY tanımlı değil');
  const to = String(req.body?.to || '').trim();
  if (!validEmail(to)) throw new Error('Geçerli bir e-posta adresi girin');
  const r = await bird.sendEmail({ to, subject: 'Yolda Kaldık · test e-postası', title: 'Bird bağlantısı çalışıyor ✅', html: '<p>Bu e-posta Yolda Kaldık yönetim panelinden Bird üzerinden gönderildi.</p>', tag: 'test' });
  res.json({ id: r?.id, status: r?.status });
}));
app.get('/api/admin/approvals', admin, (req, res) => {
  const list = db().users.filter((u) => u.role === 'driver' && Object.values(u.driver.docs || {}).some((d) => d.status === 'pending')).map(publicUser);
  res.json({ drivers: list, docTypes: DOC_TYPES });
});
app.post('/api/admin/drivers/:id/docs', admin, wrap((req, res) => {
  const u = db().users.find((x) => x.id === req.params.id && x.role === 'driver');
  if (!u) throw new Error('Çekici bulunamadı');
  const status = req.body?.status === 'rejected' ? 'rejected' : 'approved';
  const types = req.body?.type === 'all' ? Object.keys(u.driver.docs || {}).filter((k) => u.driver.docs[k].status === 'pending') : [req.body?.type];
  types.forEach((t) => {
    const d = u.driver.docs?.[t];
    if (!d) return;
    d.status = status;
    d.note = String(req.body?.note || '').slice(0, 200);
    d.reviewedAt = new Date().toISOString();
  });
  store.save();
  const st = approvalStatus(u);
  if (st === 'approved') notify(u.id, 'Belgeleriniz onaylandı ✅', 'Artık çevrimiçi olup iş alabilirsiniz.', { url: '/cekici' });
  else if (status === 'rejected') notify(u.id, 'Belgeniz reddedildi', `${types.map((t) => DOC_TYPES[t]).join(', ')}${req.body?.note ? ': ' + req.body.note : ''}. Lütfen yeniden yükleyin.`, { url: '/cekici' });
  // Firma K belgesi onaylanınca şoförler de açılabilir
  if (u.driver.isFirmOwner && types.includes('kbelgesi')) fleetMembers(u).forEach((m) => approvalStatus(m) === 'approved' && notify(m.id, 'Hesabınız onaylandı ✅', 'Firmanızın belgeleri onaylandı, iş alabilirsiniz.'));
  res.json({ user: publicUser(u) });
}));
app.get('/api/admin/users', admin, (req, res) => {
  const role = req.query.role;
  res.json({ users: db().users.filter((u) => !role || u.role === role).map(publicUser).reverse() });
});
app.get('/api/admin/jobs', admin, (req, res) => res.json({ jobs: db().jobs.slice(-200).reverse().map((j) => publicJob(j)) }));
app.get('/api/admin/payments', admin, (req, res) => {
  const users = db().users;
  res.json({ payments: db().payments.slice().reverse().map((p) => ({ ...p, user: publicUser(users.find((u) => u.id === p.userId)) })) });
});
app.get('/api/admin/codes', admin, (req, res) => res.json({ codes: db().codes.slice().reverse() }));
app.post('/api/admin/codes', admin, wrap((req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) throw new Error('Kod en az 3 karakter olmalı (harf/rakam)');
  if (db().codes.some((c) => c.code === code)) throw new Error('Bu kod zaten var');
  const type = b.type === 'amount' ? 'amount' : 'percent';
  const value = Number(b.value);
  if (!(value > 0) || (type === 'percent' && value > 100)) throw new Error('İndirim değeri geçersiz');
  const c = {
    code,
    label: String(b.label || '').slice(0, 60) || (type === 'percent' ? `%${value} indirim` : `${value} TL indirim`),
    type,
    value,
    maxDiscount: Number(b.maxDiscount) || 0,
    target: ['ride', 'subscription', 'all'].includes(b.target) ? b.target : 'ride',
    firstRideOnly: !!b.firstRideOnly,
    perUser: Number(b.perUser) || 0,
    maxUses: Number(b.maxUses) || 0,
    expiresAt: b.expiresAt || null,
    used: 0,
    usedBy: [],
    active: true,
    createdAt: new Date().toISOString(),
  };
  db().codes.push(c);
  store.save();
  res.json({ code: c });
}));
app.patch('/api/admin/codes/:code', admin, wrap((req, res) => {
  const c = db().codes.find((x) => x.code === req.params.code);
  if (!c) throw new Error('Kod bulunamadı');
  if (typeof req.body.active === 'boolean') c.active = req.body.active;
  store.save();
  res.json({ code: c });
}));
app.delete('/api/admin/codes/:code', admin, (req, res) => {
  db().codes = db().codes.filter((x) => x.code !== req.params.code);
  store.save();
  res.json({ ok: true });
});
app.post('/api/admin/drivers/:id/subscription', admin, wrap((req, res) => {
  const u = db().users.find((x) => x.id === req.params.id && x.role === 'driver');
  if (!u) throw new Error('Çekici bulunamadı');
  const days = Math.round(Number(req.body.days) || 30);
  const from = subActive(u) ? new Date(u.driver.subscription.until) : new Date();
  const until = new Date(from.getTime() + days * DAY);
  if (days <= 0) u.driver.subscription = { ...(u.driver.subscription || {}), until: new Date().toISOString() };
  else u.driver.subscription = { plan: 'aylik', since: u.driver.subscription?.since || new Date().toISOString(), until: until.toISOString(), autoRenew: false, last4: u.driver.subscription?.last4 || null, grantedByAdmin: true };
  if (days <= 0) u.driver.online = false;
  store.save();
  notify(u.id, days > 0 ? 'Paketiniz uzatıldı' : 'Paketiniz durduruldu', days > 0 ? `Yönetici paketinizi ${days} gün uzattı.` : 'Paketiniz yönetici tarafından durduruldu.');
  res.json({ user: publicUser(u) });
}));
app.post('/api/admin/broadcast', admin, wrap((req, res) => {
  const { audience = 'all', title, body } = req.body || {};
  if (!title || !body) throw new Error('Başlık ve mesaj girin');
  const targets = db().users.filter((u) => u.role !== 'admin' && (audience === 'all' || u.role === audience));
  targets.forEach((u) => notify(u.id, String(title).slice(0, 80), String(body).slice(0, 300)));
  res.json({ sent: targets.length });
}));

app.get(['/cekici', '/cekici/{*rest}'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'cekici.html')));
app.get(['/admin', '/admin/{*rest}'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadı' }));
app.get('/{*rest}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- Socket.IO: canlı konum ve olaylar ----------
io.use((socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth?.token, db().meta.jwtSecret);
    const u = db().users.find((x) => x.id === p.uid);
    if (!u) return next(new Error('auth'));
    socket.data.uid = u.id;
    next();
  } catch {
    next(new Error('auth'));
  }
});
io.on('connection', (socket) => {
  const u = () => db().users.find((x) => x.id === socket.data.uid);
  const me = u();
  socket.join('user:' + me.id);
  if (me.role === 'driver') socket.join('role:driver');
  if (me.role === 'admin') socket.join('role:admin');

  socket.on('job:watch', (jobId) => {
    const j = db().jobs.find((x) => x.id === jobId);
    const user = u();
    if (j && user && (j.customerId === user.id || j.driverId === user.id || user.role === 'admin')) {
      socket.join('job:' + j.id);
      socket.emit('job:update', publicJob(j, j.customerId === user.id));
      const d = j.driverId && findDriver(j.driverId);
      if (d && d.driver.lat != null) emitDriverLoc(j, d);
    }
  });

  socket.on('driver:location', (p) => {
    const user = u();
    if (!user || user.role !== 'driver' || !isPoint(p)) return;
    user.driver.lat = +p.lat;
    user.driver.lng = +p.lng;
    user.driver.heading = Number(p.heading) || 0;
    user.driver.locAt = Date.now();
    const j = db().jobs.find((x) => x.driverId === user.id && ACTIVE.includes(x.status));
    if (j) emitDriverLoc(j, user);
    io.to('role:admin').emit('admin:driver', { id: user.id, lat: user.driver.lat, lng: user.driver.lng });
  });
});

// Randevulu talepler: saatinden 45 dk önce çekici aramaya başla, 2 saat kala hatırlat
setInterval(() => {
  const now = Date.now();
  db().jobs.forEach((j) => {
    if (j.status !== 'scheduled') return;
    const t = new Date(j.scheduledAt).getTime();
    if (!j.remindedAt && t - now <= 2 * 60 * 60 * 1000 && t - now > SCHEDULE_LEAD_MS) {
      j.remindedAt = new Date().toISOString();
      notify(j.customerId, 'Randevunuz yaklaşıyor ⏰', `${fmtDate(j.scheduledAt)} · ${P.SERVICES[j.service].name}. Çekiciniz saatinden önce atanacak.`, { jobId: j.id });
      store.save();
    }
    if (t - now <= SCHEDULE_LEAD_MS) {
      pushTimeline(j, 'searching', 'Randevu saati yaklaştı, çekici aranıyor');
      notify(j.customerId, 'Randevunuz için çekici aranıyor 🚛', `${fmtDate(j.scheduledAt)} randevunuz için en yakın çekici aranıyor.`, { jobId: j.id });
      broadcastJob(j);
      dispatch(j);
    }
  });
}, 30 * 1000);

// Konum güncellemesi 10 dk gelmeyen çekicileri çevrimdışı yap; paket süresi bitenleri kapat
setInterval(() => {
  let changed = false;
  db().users.forEach((u) => {
    if (u.role !== 'driver' || !u.driver.online) return;
    if (!subActive(u)) {
      u.driver.online = false;
      changed = true;
      notify(u.id, 'Paketinizin süresi doldu', 'İş almaya devam etmek için aylık paketinizi yenileyin.', { url: '/cekici#paket' });
    }
  });
  // Bitişe 3 gün kala hatırlatma
  db().users.forEach((u) => {
    if (u.role !== 'driver' || !subActive(u)) return;
    const left = new Date(u.driver.subscription.until) - Date.now();
    if (left < 3 * DAY && !u.driver.subscription.reminded) {
      u.driver.subscription.reminded = true;
      changed = true;
      notify(u.id, 'Paketiniz yakında bitiyor', '3 gün içinde paketinizin süresi doluyor. Kesintisiz iş almak için yenileyin.', { url: '/cekici#paket' });
    }
  });
  if (changed) store.save();
}, 60 * 1000);

async function shutdown(sig) {
  console.log(`${sig} alındı, veriler kaydediliyor…`);
  try { await store.flush(); } catch (e) { console.error(e.message); }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

store
  .load()
  .then(async () => {
    bootstrap();
    await files.init(store.pool(), db().meta.jwtSecret);
    if (!sms.configured()) console.warn('UYARI: SMS sağlayıcı tanımlı değil — doğrulama kodları ekranda gösterilecek (SMS_PROVIDER ayarlayın).');
    server.listen(PORT, () => console.log(`Yolda Kaldık çalışıyor: http://localhost:${PORT} (demo modu: ${DEMO_MODE ? 'açık' : 'kapalı'}, kalıcı veritabanı: ${store.persistent() ? 'evet' : 'HAYIR'})`));
  })
  .catch((e) => {
    console.error('Veritabanına bağlanılamadı:', e.message);
    process.exit(1);
  });
