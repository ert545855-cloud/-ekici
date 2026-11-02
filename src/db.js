// Basit JSON dosya veritabanı. Üretimde PostgreSQL'e taşınabilir; arayüz aynı kalır.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const empty = () => ({
  meta: {},
  users: [],
  jobs: [],
  codes: [],
  payments: [],
  notifications: [],
});

let state = empty();
let saveTimer = null;

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      state = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    }
  } catch (e) {
    console.error('DB okunamadı, boş başlatılıyor:', e.message);
    state = empty();
  }
  return state;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('DB yazılamadı:', e.message);
    }
  }, 150);
}

const id = (p = '') => p + crypto.randomBytes(6).toString('hex');

module.exports = { load, save, id, get db() { return state; } };
