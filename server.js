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

const PORT = process.env.PORT || 3000;
const DEMO_MODE = (process.env.DEMO_MODE || 'true') !== 'false';
const OFFER_RADIUS_KM = Number(process.env.OFFER_RADIUS_KM || 40);
const SEARCH_TIMEOUT_MS = 3 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

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
const subActive = (u) => !!(u && u.driver && u.driver.subscription && new Date(u.driver.subscription.until) > new Date());

function publicUser(u) {
  if (!u) return null;
  const { passHash, pushSubs, ...rest } = u;
  return { ...rest, pushEnabled: (pushSubs || []).length > 0, subscriptionActive: subActive(u) };
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
    webpush.sendNotification(sub, payload, { TTL: 300, urgency: 'high' }).catch((err) => {
      if (err.statusCode === 404 || err.statusCode === 410) {
        u.pushSubs = u.pushSubs.filter((s) => s.endpoint !== sub.endpoint);
        store.save();
      }
    });
  });
}

// ---------- Demo çekiciler (gerçek çekici yokken akışı göstermek için) ----------
const bots = new Map();
const BOT_NAMES = ['Murat Yıldız', 'Hakan Çelik', 'Emre Kaya', 'Serkan Aydın', 'Volkan Şahin', 'Burak Demir', 'Okan Arslan', 'Cem Koç'];
const BOT_VEHICLES = { oto: 'Ford Cargo Kayar Kasa', agir: 'Mercedes Actros Ahtapot', moto: 'Isuzu NPR Moto Platform', yol: 'Fiat Doblo Servis' };
function findDriver(id) {
  return bots.get(id) || db().users.find((u) => u.id === id && u.role === 'driver');
}
function ensureBots(center, service) {
  if (!DEMO_MODE || !isPoint(center)) return;
  const near = [...bots.values()].filter((b) => P.haversineKm(b.driver, center) < 6 && b.driver.services.includes(service || 'oto'));
  if (near.length >= 4) return;
  for (let i = near.length; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 3.5;
    const svc = service || ['oto', 'oto', 'agir', 'moto', 'yol'][i % 5];
    const id = 'bot_' + crypto.randomBytes(4).toString('hex');
    bots.set(id, {
      id,
      bot: true,
      role: 'driver',
      name: BOT_NAMES[crypto.randomInt(BOT_NAMES.length)],
      phone: '5' + String(crypto.randomInt(100000000, 999999999)),
      driver: {
        lat: center.lat + (r / 111) * Math.sin(ang),
        lng: center.lng + (r / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(ang),
        heading: Math.round(Math.random() * 360),
        online: true,
        busy: false,
        services: svc === 'oto' ? ['oto', 'moto'] : [svc],
        plate: `34 ${'ABCDEFGHKLMNPRSTVYZ'[crypto.randomInt(19)]}${'ABCDEFGHKLMNPRSTVYZ'[crypto.randomInt(19)]} ${crypto.randomInt(100, 999)}`,
        vehicle: BOT_VEHICLES[svc],
        ratingSum: 46 + crypto.randomInt(4),
        ratingCount: 10,
      },
    });
  }
  if (bots.size > 400) [...bots.keys()].slice(0, 100).forEach((k) => !bots.get(k).driver.busy && bots.delete(k));
}

function moveBotTo(bot, job, target, onArrive) {
  const startKm = P.haversineKm(bot.driver, target);
  const steps = Math.min(45, Math.max(12, Math.round(startKm * 6)));
  const dLat = (target.lat - bot.driver.lat) / steps;
  const dLng = (target.lng - bot.driver.lng) / steps;
  let i = 0;
  const t = setInterval(() => {
    const j = db().jobs.find((x) => x.id === job.id);
    if (!j || ['cancelled', 'completed', 'expired'].includes(j.status) || j.driverId !== bot.id) {
      clearInterval(t);
      bot.driver.busy = false;
      return;
    }
    i++;
    bot.driver.lat += dLat + (Math.random() - 0.5) * 0.00008;
    bot.driver.lng += dLng + (Math.random() - 0.5) * 0.00008;
    bot.driver.heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
    emitDriverLoc(j, bot);
    if (i >= steps) {
      clearInterval(t);
      bot.driver.lat = target.lat;
      bot.driver.lng = target.lng;
      emitDriverLoc(j, bot);
      onArrive();
    }
  }, 1200);
}

function runBot(job) {
  const j = db().jobs.find((x) => x.id === job.id);
  if (!j || j.status !== 'searching') return;
  ensureBots(j.pickup, j.service);
  const candidates = [...bots.values()].filter((b) => !b.driver.busy && b.driver.services.includes(j.service));
  candidates.sort((a, b) => P.haversineKm(a.driver, j.pickup) - P.haversineKm(b.driver, j.pickup));
  const bot = candidates[0];
  if (!bot) return;
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
    notify(d.id, '🚨 Yeni kurtarma talebi', `${P.SERVICES[j.service].name} · ${km != null ? km + ' km uzakta · ' : ''}${fmtTL(j.price.total)}`, { jobId: j.id, type: 'offer', url: '/cekici' });
  });
  store.save();
  if (DEMO_MODE) {
    const delay = drivers.length ? 25000 : 6000 + crypto.randomInt(4000);
    setTimeout(() => runBot(j), delay);
  }
  setTimeout(() => {
    if (j.status === 'searching') {
      pushTimeline(j, 'expired');
      releaseCode(j);
      notify(j.customerId, 'Çekici bulunamadı', 'Şu an yakınınızda müsait çekici yok. Lütfen tekrar deneyin.', { jobId: j.id });
      io.to('role:driver').emit('job:gone', { id: j.id });
      broadcastJob(j);
    }
  }, SEARCH_TIMEOUT_MS);
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
  if (d && !d.bot) d.driver.earnings = (d.driver.earnings || 0) + j.price.total;
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
const fmtTL = (n) => new Intl.NumberFormat('tr-TR').format(Math.round(n)) + ' TL';

// ---------- HTTP ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });

app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
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
  res.json({ services: P.SERVICES, roadside: P.ROADSIDE, subscriptionPrice: P.SUBSCRIPTION_PRICE, vapidPublicKey: db().meta.vapid.publicKey, demo: DEMO_MODE, googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '', mapboxToken: process.env.MAPBOX_TOKEN || '', support: process.env.SUPPORT_PHONE || '4440000' })
);

// --- Hesaplar ---
app.post('/api/auth/register', wrap((req, res) => {
  const { role = 'customer', name, phone, password, referral, driver } = req.body || {};
  if (!['customer', 'driver'].includes(role)) throw new Error('Geçersiz hesap türü');
  if (!name || String(name).trim().length < 2) throw new Error('Ad soyad girin');
  if (normPhone(phone).length !== 10) throw new Error('Geçerli bir cep telefonu girin (5xx xxx xx xx)');
  if (!password || String(password).length < 6) throw new Error('Şifre en az 6 karakter olmalı');
  if (db().users.some((u) => u.phone === normPhone(phone) && u.role === role)) throw new Error('Bu numara ile kayıtlı hesap var');
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
    };
  }
  const u = newUser({ role, name, phone, password, driver: driverData });
  if (referral && role === 'customer') {
    const inviter = db().users.find((x) => x.referralCode === String(referral).trim().toUpperCase());
    if (!inviter) throw new Error('Davet kodu bulunamadı');
    u.referredBy = inviter.id;
    u.credits = 250;
  }
  db().users.push(u);
  store.save();
  setTimeout(() => {
    if (role === 'driver') notify(u.id, 'Hoş geldiniz 👋', 'Aylık çekici paketinizi etkinleştirerek iş almaya başlayabilirsiniz.', { url: '/cekici#paket' });
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

app.get('/api/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/me', auth(), wrap((req, res) => {
  const u = req.user;
  const b = req.body || {};
  if (b.name) u.name = String(b.name).trim().slice(0, 60);
  if (Array.isArray(b.addresses)) u.addresses = b.addresses.map(cleanPoint).filter(Boolean).slice(0, 8).map((a, i) => ({ ...a, label: String(b.addresses[i].label || 'Adres').slice(0, 30) }));
  if (b.settings) u.settings = { ...(u.settings || {}), ...b.settings };
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
  u.pushSubs.push({ endpoint: sub.endpoint, keys: sub.keys });
  u.pushSubs = u.pushSubs.slice(-5);
  store.save();
  res.json({ ok: true });
}));
app.post('/api/push/test', auth(), (req, res) => {
  notify(req.user.id, 'Bildirimler açık 🔔', 'Kurtarma durumunuzu buradan anlık takip edeceksiniz.');
  res.json({ ok: true });
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
app.get('/api/nearby', (req, res) => {
  const c = { lat: Number(req.query.lat), lng: Number(req.query.lng) };
  if (!isPoint(c)) return res.json({ drivers: [] });
  const service = P.SERVICES[req.query.service] ? req.query.service : null;
  ensureBots(c, service);
  const real = db().users.filter((u) => u.role === 'driver' && u.driver?.online && subActive(u) && u.driver.lat != null);
  const all = [...real, ...bots.values()]
    .filter((d) => !d.driver.busy && (!service || d.driver.services.includes(service)) && P.haversineKm(d.driver, c) < 15)
    .map((d) => ({ id: d.id, lat: d.driver.lat, lng: d.driver.lng, heading: d.driver.heading || 0, services: d.driver.services, eta: etaMin(d.driver, c) }))
    .sort((a, b) => a.eta - b.eta)
    .slice(0, 25);
  res.json({ drivers: all, nearestEta: all[0]?.eta || null });
});

// --- Fiyat & talep ---
app.post('/api/quote', auth('customer'), wrap((req, res) => {
  const b = req.body || {};
  res.json(P.quote(db(), { service: b.service, sub: b.sub, pickup: cleanPoint(b.pickup), dropoff: cleanPoint(b.dropoff), code: b.code, user: req.user }));
}));
app.post('/api/codes/check', auth(), wrap((req, res) => {
  const target = req.body.target === 'subscription' ? 'subscription' : 'ride';
  const v = P.validateCode(db(), req.body.code, { target, user: req.user });
  if (!v.ok) throw new Error(v.error || 'Kod geçersiz');
  res.json({ code: v.code.code, label: v.code.label, type: v.code.type, value: v.code.value });
}));

app.post('/api/jobs', auth('customer'), wrap((req, res) => {
  const b = req.body || {};
  const u = req.user;
  if (db().jobs.some((j) => j.customerId === u.id && ACTIVE.includes(j.status))) throw new Error('Devam eden bir talebiniz var');
  const pickup = cleanPoint(b.pickup);
  const dropoff = P.SERVICES[b.service]?.needsDropoff ? cleanPoint(b.dropoff) : null;
  const q = P.quote(db(), { service: b.service, sub: b.sub, pickup, dropoff, code: b.code, user: u });
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
    price: { lines: q.lines, subtotal: q.subtotal, discount: q.discount, credit: q.credit, total: q.total, code: q.code },
    payment: b.payment === 'card' ? 'card' : 'cash',
    vehicle: { plate: String(b.vehicle?.plate || '').toUpperCase().slice(0, 15), model: String(b.vehicle?.model || '').slice(0, 60) },
    note: String(b.note || '').slice(0, 300),
    contactPhone: normPhone(b.contactPhone || u.phone),
    status: 'searching',
    pin: newPin(),
    verified: false,
    timeline: [],
    createdAt: new Date().toISOString(),
  };
  pushTimeline(j, 'searching');
  db().jobs.push(j);
  dispatch(j);
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
  if (!subActive(u)) throw new Error('İş almak için aylık paketinizi etkinleştirin');
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
    if (!['searching', 'accepted', 'arrived'].includes(j.status)) throw new Error('Bu aşamada iptal edilemez');
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
  if (on && !subActive(u)) throw new Error('Çevrimiçi olmak için aylık paketinizi etkinleştirin');
  u.driver.online = on;
  if (isPoint(req.body.location)) Object.assign(u.driver, { lat: +req.body.location.lat, lng: +req.body.location.lng });
  store.save();
  res.json({ user: publicUser(u) });
}));
app.post('/api/driver/subscription/quote', auth('driver'), wrap((req, res) => res.json(P.subscriptionQuote(db(), { code: req.body.code, user: req.user }))));
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
  const sum = (a) => a.reduce((s, j) => s + j.price.total, 0);
  const r = req.user.driver;
  // Son 7 gün kazanç
  const week = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    return { day: d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }), total: sum(mine.filter((j) => new Date(j.completedAt).toDateString() === d.toDateString())) };
  });
  res.json({ todayCount: t.length, todayTotal: sum(t), monthCount: month.length, monthTotal: sum(month), allCount: mine.length, rating: r.ratingCount ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null, ratingCount: r.ratingCount, week, net: sum(month) - (month.length ? P.SUBSCRIPTION_PRICE : 0) });
});

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
    completedJobs: d.jobs.filter((j) => j.status === 'completed').length,
    gmv: d.jobs.filter((j) => j.status === 'completed').reduce((s, j) => s + j.price.total, 0),
    subRevenueMonth: d.payments.filter(month).reduce((s, p) => s + p.total, 0),
    subRevenueAll: d.payments.reduce((s, p) => s + p.total, 0),
    demo: DEMO_MODE,
  });
});
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
  .then(() => {
    bootstrap();
    server.listen(PORT, () => console.log(`Yolda Kaldık çalışıyor: http://localhost:${PORT} (demo modu: ${DEMO_MODE ? 'açık' : 'kapalı'}, kalıcı veritabanı: ${store.persistent() ? 'evet' : 'HAYIR'})`));
  })
  .catch((e) => {
    console.error('Veritabanına bağlanılamadı:', e.message);
    process.exit(1);
  });
