// Hizmetler, fiyatlandırma ve indirim kodu doğrulama
const SERVICES = {
  oto: { key: 'oto', name: 'Oto Çekici', desc: 'Binek araçlar için kurtarma', base: 1500, perKm: 55, needsDropoff: true, eta: 1 },
  agir: { key: 'agir', name: 'Ağır Vasıta', desc: 'Kamyon ve tırlar için çekme', base: 4500, perKm: 140, needsDropoff: true, eta: 1.4 },
  moto: { key: 'moto', name: 'Motosiklet', desc: 'Özel motor platformu', base: 900, perKm: 35, needsDropoff: true, eta: 0.9 },
  yol: { key: 'yol', name: 'Yol Yardım', desc: 'Akü, yakıt, lastik, çilingir', base: 0, perKm: 0, needsDropoff: false, eta: 0.8 },
};

const ROADSIDE = {
  aku: { key: 'aku', name: 'Akü takviyesi', price: 750 },
  yakit: { key: 'yakit', name: 'Yakıt getirme', price: 650 },
  lastik: { key: 'lastik', name: 'Lastik değişimi', price: 850 },
  cilingir: { key: 'cilingir', name: 'Kapı açma (çilingir)', price: 900 },
};

const SUBSCRIPTION_PRICE = Number(process.env.SUBSCRIPTION_PRICE || 10000);
const COMMISSION_RATE = 0; // Abonelik modelinde çekiciden komisyon alınmaz

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Kuş uçuşu mesafeyi yol mesafesine yaklaştırmak için 1.3 katsayısı
const roadKm = (a, b) => Math.round(haversineKm(a, b) * 1.3 * 10) / 10;

function isNight(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' }).format(date));
  return h >= 22 || h < 6;
}

// Kod doğrulama: { ok, code, error }
function validateCode(db, rawCode, { target, user }) {
  if (!rawCode) return { ok: false };
  const c = db.codes.find((x) => x.code.toUpperCase() === String(rawCode).trim().toUpperCase());
  if (!c || !c.active) return { ok: false, error: 'Kod geçersiz' };
  if (c.target !== 'all' && c.target !== target) {
    return { ok: false, error: target === 'ride' ? 'Bu kod çekici aboneliği içindir' : 'Bu kod kurtarma talepleri içindir' };
  }
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return { ok: false, error: 'Kodun süresi dolmuş' };
  if (c.maxUses && c.used >= c.maxUses) return { ok: false, error: 'Kod kullanım limiti doldu' };
  if (user) {
    const usedByUser = (c.usedBy || []).filter((u) => u === user.id).length;
    if (c.perUser && usedByUser >= c.perUser) return { ok: false, error: 'Bu kodu daha önce kullandınız' };
    if (c.firstRideOnly) {
      const done = db.jobs.some((j) => j.customerId === user.id && j.status === 'completed');
      if (done) return { ok: false, error: 'Bu kod yalnızca ilk kurtarmada geçerli' };
    }
  }
  return { ok: true, code: c };
}

function applyDiscount(amount, code) {
  if (!code) return 0;
  let d = code.type === 'percent' ? (amount * code.value) / 100 : code.value;
  if (code.maxDiscount) d = Math.min(d, code.maxDiscount);
  return Math.round(Math.min(d, amount));
}

function quote(db, { service, sub, pickup, dropoff, code, user }) {
  const s = SERVICES[service];
  if (!s) throw new Error('Geçersiz hizmet');
  if (!pickup || typeof pickup.lat !== 'number') throw new Error('Konum gerekli');
  let distanceKm = 0;
  let subtotal;
  const lines = [];
  if (s.needsDropoff) {
    if (!dropoff || typeof dropoff.lat !== 'number') throw new Error('Varış noktası gerekli');
    distanceKm = Math.max(1, roadKm(pickup, dropoff));
    lines.push({ label: 'Açılış ücreti', amount: s.base });
    lines.push({ label: `Mesafe (${distanceKm} km)`, amount: Math.round(distanceKm * s.perKm) });
    subtotal = s.base + Math.round(distanceKm * s.perKm);
  } else {
    const r = ROADSIDE[sub] || ROADSIDE.aku;
    lines.push({ label: r.name, amount: r.price });
    subtotal = r.price;
  }
  if (isNight()) {
    const n = Math.round(subtotal * 0.2);
    lines.push({ label: 'Gece tarifesi (+%20)', amount: n });
    subtotal += n;
  }
  let discount = 0;
  let codeInfo = null;
  let codeError = null;
  if (code) {
    const v = validateCode(db, code, { target: 'ride', user });
    if (v.ok) {
      discount = applyDiscount(subtotal, v.code);
      codeInfo = { code: v.code.code, label: v.code.label || v.code.code };
    } else codeError = v.error;
  }
  let credit = 0;
  if (user && user.credits > 0) credit = Math.min(user.credits, subtotal - discount);
  const total = Math.max(0, subtotal - discount - credit);
  return { service: s.key, sub: s.needsDropoff ? null : (ROADSIDE[sub] ? sub : 'aku'), distanceKm, lines, subtotal, discount, credit, total, code: codeInfo, codeError, night: isNight() };
}

function subscriptionQuote(db, { code, user }) {
  let discount = 0;
  let codeInfo = null;
  let codeError = null;
  if (code) {
    const v = validateCode(db, code, { target: 'subscription', user });
    if (v.ok) {
      discount = applyDiscount(SUBSCRIPTION_PRICE, v.code);
      codeInfo = { code: v.code.code, label: v.code.label || v.code.code };
    } else codeError = v.error;
  }
  return { price: SUBSCRIPTION_PRICE, discount, total: SUBSCRIPTION_PRICE - discount, code: codeInfo, codeError };
}

module.exports = { SERVICES, ROADSIDE, SUBSCRIPTION_PRICE, COMMISSION_RATE, haversineKm, roadKm, quote, subscriptionQuote, validateCode, applyDiscount };
