const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "contentbot.db");
let db;

function init() {
  const exists = fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  if (!exists) {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER UNIQUE NOT NULL, username TEXT, subscription_end TEXT, is_active INTEGER DEFAULT 1, language TEXT DEFAULT "zh", created_at TEXT);
      CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, feed_url TEXT NOT NULL, keywords TEXT DEFAULT "", source_name TEXT DEFAULT "", created_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id));
      CREATE TABLE articles (id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, feed_url TEXT NOT NULL, title TEXT, link TEXT, published_at TEXT, created_at TEXT);
      CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, symbol TEXT NOT NULL, target_price REAL NOT NULL, direction TEXT NOT NULL, triggered INTEGER DEFAULT 0, created_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id));
    `);
  } else {
    try { db.exec("ALTER TABLE subscriptions ADD COLUMN source_name TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'zh'"); } catch (_) {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,symbol TEXT NOT NULL,target_price REAL NOT NULL,direction TEXT NOT NULL,triggered INTEGER DEFAULT 0,created_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id))`); } catch (_) {}
  }
  return db;
}

function getDb() { return db; }

function findOrCreateUser(tid, username) {
  let u = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(tid);
  if (!u) {
    db.prepare("INSERT INTO users (telegram_id,username,created_at) VALUES (?,?,datetime('now'))").run(tid, username);
    u = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(tid);
  }
  return u;
}
function getUser(tid) { return db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(tid); }

// ── Language ──────────────────────────────────────
function getLang(tid) {
  const u = getUser(tid);
  return u?.language || "zh";
}
function setLang(tid, lang) {
  db.prepare("UPDATE users SET language=? WHERE telegram_id=?").run(lang, tid);
}

// ── Subscriptions ─────────────────────────────────
function addSubscription(tid, url, kws, sname) {
  const u = findOrCreateUser(tid, null);
  return db.prepare("INSERT INTO subscriptions (user_id,feed_url,keywords,source_name,created_at) VALUES (?,?,?,?,datetime('now'))").run(u.id, url, kws||"", sname||"").lastInsertRowid > 0;
}
function getUserSubs(tid) {
  const u = getUser(tid); if (!u) return [];
  return db.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC").all(u.id);
}
function removeSub(id, tid) {
  const u = getUser(tid); if (!u) return false;
  return db.prepare("DELETE FROM subscriptions WHERE id=? AND user_id=?").run(id, u.id).changes > 0;
}
function getAllSubs() {
  return db.prepare("SELECT s.id,s.feed_url,s.keywords,s.source_name,u.telegram_id,u.username,u.subscription_end FROM subscriptions s JOIN users u ON s.user_id=u.id WHERE u.is_active=1").all();
}
function subCount(tid) {
  const u = getUser(tid); if (!u) return 0;
  return db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE user_id=?").get(u.id).c;
}

// ── Articles ──────────────────────────────────────
function hasArticle(g) { return db.prepare("SELECT 1 FROM articles WHERE guid=?").get(g); }
function saveArticle(g, url, title, link, pub) {
  try { db.prepare("INSERT OR IGNORE INTO articles (guid,feed_url,title,link,published_at,created_at) VALUES (?,?,?,?,?,datetime('now'))").run(g,url,title,link,pub); } catch(_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN daily_summary INTEGER DEFAULT 0"); } catch(_) {}
}

// ── Alerts ────────────────────────────────────────
function addAlert(tid, sym, price, dir) {
  const u = findOrCreateUser(tid, null);
  return db.prepare("INSERT INTO alerts (user_id,symbol,target_price,direction,created_at) VALUES (?,?,?,?,datetime('now'))").run(u.id,sym,price,dir).lastInsertRowid;
}
function getActiveAlerts() {
  return db.prepare("SELECT a.*,u.telegram_id FROM alerts a JOIN users u ON a.user_id=u.id WHERE a.triggered=0").all();
}
function getUserAlerts(tid) {
  const u = getUser(tid); if (!u) return [];
  return db.prepare("SELECT * FROM alerts WHERE user_id=? AND triggered=0 ORDER BY id DESC").all(u.id);
}
function removeAlert(id, tid) {
  const u = getUser(tid); if (!u) return false;
  return db.prepare("DELETE FROM alerts WHERE id=? AND user_id=?").run(id, u.id).changes > 0;
}
function markAlert(id) { db.prepare("UPDATE alerts SET triggered=1 WHERE id=?").run(id); }

function getDaily(tid) { const u=getUser(tid); return u?.daily_summary||0; }
function setDaily(tid,v) { db.prepare("UPDATE users SET daily_summary=? WHERE telegram_id=?").run(v,tid); }
function getDailyUsers() { return db.prepare("SELECT telegram_id FROM users WHERE daily_summary=1").all(); }
module.exports = { init,getDb,findOrCreateUser,getUser,getLang,setLang,addSubscription,getUserSubs,removeSub,getAllSubs,subCount,hasArticle,saveArticle,addAlert,getActiveAlerts,getUserAlerts,removeAlert,markAlert };
