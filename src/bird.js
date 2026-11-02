// Bird (bird.com) e-posta entegrasyonu
// - Ticari ileti onayı veren kullanıcılar Bird kitlelerine (audience) eklenir; kampanyalar Bird panelinden gönderilir.
// - İşlem e-postaları (hoş geldin, kurtarma fişi, paket faturası) Bird e-posta API'si ile gönderilir.
// Ortam değişkenleri: BIRD_API_KEY, BIRD_FROM, BIRD_FROM_NAME, BIRD_AUDIENCE_CUSTOMERS, BIRD_AUDIENCE_DRIVERS
const KEY = process.env.BIRD_API_KEY || '';
const REGION = (/^b[km]_(\w+?)_/.exec(KEY) || [])[1] || 'us1';
const HOST = process.env.BIRD_API_HOST || `https://${REGION}.platform.bird.com`;
const FROM = process.env.BIRD_FROM || 'onboarding@messagebird.dev';
const FROM_NAME = process.env.BIRD_FROM_NAME || 'Yolda Kaldık';
const AUD = { customer: process.env.BIRD_AUDIENCE_CUSTOMERS || '', driver: process.env.BIRD_AUDIENCE_DRIVERS || '' };
const APP_URL = process.env.APP_URL || 'https://yolda-kaldik.onrender.com';

const configured = () => !!KEY;
const sharedSender = () => /@messagebird\.dev$/i.test(FROM);

async function call(method, path, body, idem) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(HOST + path, {
      method,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      const msg = j?.error?.message || j?.message || text.slice(0, 200) || r.status;
      const err = new Error(`Bird ${r.status}: ${msg}`);
      err.status = r.status;
      throw err;
    }
    return j;
  } finally {
    clearTimeout(t);
  }
}

const splitName = (n) => {
  const parts = String(n || '').trim().split(/\s+/);
  return { first_name: parts.slice(0, -1).join(' ') || parts[0] || '', last_name: parts.length > 1 ? parts[parts.length - 1] : '' };
};

// Kullanıcıyı Bird kişisi olarak oluştur/güncelle; onaya göre kitleye ekle veya çıkar
async function syncUser(u) {
  if (!configured() || !u || !u.email || u.role === 'admin') return null;
  const audience = AUD[u.role];
  const consent = !!u.marketingConsent?.email;
  const r = await call('POST', '/v1/contacts/batch', {
    contacts: [{ email: u.email, phone_number: u.phone ? '+90' + u.phone : undefined, external_id: u.id, ...splitName(u.name) }],
    audience_ids: consent && audience ? [audience] : [],
  });
  const row = r?.data?.[0];
  if (row?.status === 'failed') {
    // Telefon başka kişide kayıtlıysa telefonsuz dene
    if (row.error?.code === 'E04055') {
      const r2 = await call('POST', '/v1/contacts/batch', { contacts: [{ email: u.email, external_id: u.id, ...splitName(u.name) }], audience_ids: consent && audience ? [audience] : [] });
      if (r2?.data?.[0]?.contact_id) u.birdContactId = r2.data[0].contact_id;
    } else throw new Error('Bird kişi senkronu: ' + (row.error?.message || 'hata'));
  } else if (row?.contact_id) u.birdContactId = row.contact_id;
  if (!consent && audience && u.birdContactId) {
    await call('DELETE', `/v1/audiences/${audience}/contacts/${u.birdContactId}`).catch((e) => { if (e.status !== 404) throw e; });
  }
  u.birdSyncedAt = new Date().toISOString();
  return u.birdContactId;
}

// Basit, markalı e-posta şablonu
function layout(title, bodyHtml, cta) {
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#f2f4f3;font-family:Arial,Helvetica,sans-serif;color:#0f1f23">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f3;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#0b2b33;padding:18px 24px"><img src="${APP_URL}/icons/logo-64.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:9px">
      <span style="color:#fff;font-weight:800;font-size:18px;vertical-align:middle;margin-left:10px;letter-spacing:.02em">YOLDA KALDIK</span></td></tr>
    <tr><td style="padding:24px"><h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${bodyHtml}
      ${cta ? `<p style="margin:24px 0 4px"><a href="${cta.url}" style="background:#ea580c;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px;display:inline-block">${cta.label}</a></p>` : ''}</td></tr>
    <tr><td style="padding:16px 24px;background:#fafafa;color:#66767a;font-size:12px">Bu e-posta Yolda Kaldık hesabınızla ilgili bilgilendirme amacıyla gönderilmiştir.</td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendEmail({ to, subject, title, html, cta, category = 'transactional', idem, tag }) {
  if (!configured() || !to) return null;
  return call('POST', '/v1/email/messages', {
    from: { email: FROM, name: FROM_NAME },
    to: [to],
    subject,
    html: layout(title || subject, html, cta),
    category,
    tags: tag ? [{ name: 'type', value: tag }] : undefined,
  }, idem);
}

const status = () => ({
  configured: configured(),
  region: REGION,
  from: FROM,
  sharedSender: sharedSender(),
  audiences: AUD,
  dashboard: 'https://bird.com/dashboard',
});

module.exports = { configured, syncUser, sendEmail, status, layout };
