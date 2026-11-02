// Veri katmanı.
// DATABASE_URL tanımlıysa tüm durum PostgreSQL'de (JSONB) kalıcı tutulur; sunucu yeniden
// başlasa, uyusa ya da yeniden deploy edilse de hesaplar ve kayıtlar silinmez.
// DATABASE_URL yoksa yerel JSON dosyası kullanılır (yalnızca geliştirme için).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const TABLE = (process.env.DB_TABLE || 'yolda_kaldik_state').replace(/[^a-z0-9_]/gi, '');
const ROW = 'main';

const empty = () => ({ meta: {}, users: [], jobs: [], codes: [], payments: [], notifications: [] });

let state = empty();
let pool = null;
let saveTimer = null;
let writing = false;
let dirty = false;
let lastSaved = null;

function readFile() {
  try {
    if (fs.existsSync(FILE)) return { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch (e) {
    console.error('Yerel veri okunamadı:', e.message);
  }
  return null;
}

async function load() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
    // Render iç ağ adresinde (nokta içermeyen host) SSL gerekmez; dış adreslerde gerekir
    const ssl = host.includes('.') && !/localhost|127\.0\.0\.1/.test(host) ? { rejectUnauthorized: false } : false;
    pool = new Pool({ connectionString: url, ssl, max: 3 });
    await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    const r = await pool.query(`SELECT data FROM ${TABLE} WHERE id = $1`, [ROW]);
    if (r.rows[0]) {
      state = { ...empty(), ...r.rows[0].data };
      console.log(`Veritabanı yüklendi: ${state.users.length} kullanıcı, ${state.jobs.length} talep`);
    } else {
      state = readFile() || empty();
      await writeNow();
      console.log('Veritabanı ilk kez oluşturuldu');
    }
    return state;
  }
  console.warn('UYARI: DATABASE_URL tanımlı değil — veriler yerel dosyada tutuluyor ve sunucu yeniden başlayınca kaybolabilir.');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  state = readFile() || empty();
  return state;
}

async function writeNow() {
  if (pool) {
    if (writing) { dirty = true; return; }
    writing = true;
    try {
      do {
        dirty = false;
        const json = JSON.stringify(state);
        if (json === lastSaved) continue;
        await pool.query(
          `INSERT INTO ${TABLE} (id, data, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [ROW, json]
        );
        lastSaved = json;
      } while (dirty);
    } catch (e) {
      console.error('Veritabanına yazılamadı, tekrar denenecek:', e.message);
      setTimeout(save, 3000);
    } finally {
      writing = false;
    }
    return;
  }
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('DB yazılamadı:', e.message);
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}

// Kapanışta bekleyen yazmayı tamamla (Render deploy/uyku öncesi SIGTERM gönderir)
async function flush() {
  clearTimeout(saveTimer);
  await writeNow();
  while (writing) await new Promise((r) => setTimeout(r, 50));
}

const id = (p = '') => p + crypto.randomBytes(6).toString('hex');
const persistent = () => !!pool;

module.exports = { load, save, flush, id, persistent, pool: () => pool, get db() { return state; } };
