// Fotoğraf/belge deposu. PostgreSQL varsa ayrı tabloda (bytea), yoksa diskte tutulur.
// Erişim imzalı URL ile: /api/files/<id>?sig=<hmac>. İmza yalnızca yetkili kişilere verilir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = path.join(DATA_DIR, 'files');
const TABLE = (process.env.DB_TABLE || 'yolda_kaldik_state').replace(/[^a-z0-9_]/gi, '') + '_files';
const MAX_BYTES = 3 * 1024 * 1024;
const MIME = ['image/jpeg', 'image/png', 'image/webp'];

let pool = null;
let secret = 'dev';

async function init(pgPool, signSecret) {
  secret = signSecret || secret;
  pool = pgPool || null;
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id text PRIMARY KEY, owner text NOT NULL, kind text NOT NULL, mime text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  } else {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

const sig = (id) => crypto.createHmac('sha256', secret).update('file:' + id).digest('base64url').slice(0, 24);
const url = (id) => (id ? `/api/files/${id}?sig=${sig(id)}` : null);
const verify = (id, s) => typeof s === 'string' && s.length === 24 && crypto.timingSafeEqual(Buffer.from(sig(id)), Buffer.from(s));

// dataUrl: "data:image/jpeg;base64,...."
async function save({ owner, kind, dataUrl }) {
  const m = /^data:([a-z/+-]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m || !MIME.includes(m[1])) throw new Error('Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw new Error('Dosya boş');
  if (buf.length > MAX_BYTES) throw new Error('Fotoğraf çok büyük (en fazla 3 MB)');
  const id = 'f_' + crypto.randomBytes(10).toString('hex');
  if (pool) {
    await pool.query(`INSERT INTO ${TABLE} (id, owner, kind, mime, data) VALUES ($1,$2,$3,$4,$5)`, [id, owner, kind, m[1], buf]);
  } else {
    fs.writeFileSync(path.join(DIR, id), buf);
    fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ owner, kind, mime: m[1] }));
  }
  return { id, url: url(id) };
}

async function read(id) {
  if (!/^f_[a-f0-9]{20}$/.test(id)) return null;
  if (pool) {
    const r = await pool.query(`SELECT mime, data FROM ${TABLE} WHERE id = $1`, [id]);
    return r.rows[0] ? { mime: r.rows[0].mime, data: r.rows[0].data } : null;
  }
  const f = path.join(DIR, id);
  if (!fs.existsSync(f)) return null;
  const meta = JSON.parse(fs.readFileSync(f + '.json', 'utf8'));
  return { mime: meta.mime, data: fs.readFileSync(f) };
}

module.exports = { init, save, read, url, verify };
