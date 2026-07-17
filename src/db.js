const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "contentbot.db");
let SQL, db;

async function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  SQL = await initSqlJs();
  try {
    const data = fs.readFileSync(DB_PATH);
    db = new SQL.Database(data);
  } catch (e) {
    db = new SQL.Database();
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER UNIQUE NOT NULL, username TEXT, subscription_end TEXT, is_active INTEGER DEFAULT 1, language TEXT DEFAULT 'zh', daily_summary INTEGER DEFAULT 0, created_at TEXT)");
    db.run("CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, feed_url TEXT NOT NULL, keywords TEXT DEFAULT '', source_name TEXT DEFAULT '', created_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id))");
    db.run("CREATE TABLE articles (id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT UNIQUE NOT NULL, feed_url TEXT NOT NULL, title TEXT, link TEXT, published_at TEXT, created_at TEXT)");
    db.run("CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, symbol TEXT NOT NULL, target_price REAL NOT NULL, direction TEXT NOT NULL, triggered INTEGER DEFAULT 0, created_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id))");
    _save();
  }
  try { db.run("ALTER TABLE subscriptions ADD COLUMN source_name TEXT DEFAULT ''"); _save(); } catch(_) {}
  try { db.run("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'zh'"); _save(); } catch(_) {}
  try { db.run("ALTER TABLE users ADD COLUMN daily_summary INTEGER DEFAULT 0"); _save(); } catch(_) {}
  return db;
}

function _save() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
function _get(q, p) { const s = db.prepare(q); if (p) s.bind(p); const r = s.step() ? s.getAsObject() : null; s.free(); return r; }
function _all(q, p) { const s = db.prepare(q); if (p) s.bind(p); const r = []; while (s.step()) r.push(s.getAsObject()); s.free(); return r; }
function _run(q, p) { db.run(q, p); _save(); }

function findOrCreateUser(tid, u) { if (!_get("SELECT 1 FROM users WHERE telegram_id=?", [tid])) { _run("INSERT INTO users (telegram_id,username,created_at) VALUES (?,?,datetime('now'))", [tid, u]); } return _get("SELECT * FROM users WHERE telegram_id=?", [tid]); }
function getUser(tid) { return _get("SELECT * FROM users WHERE telegram_id=?", [tid]); }
function getLang(tid) { const u = getUser(tid); return u?.language || "zh"; }
function setLang(tid, l) { _run("UPDATE users SET language=? WHERE telegram_id=?", [l, tid]); }
function getDaily(tid) { const u = getUser(tid); return u?.daily_summary || 0; }
function setDaily(tid, v) { _run("UPDATE users SET daily_summary=? WHERE telegram_id=?", [v, tid]); }
function getDailyUsers() { return _all("SELECT telegram_id FROM users WHERE daily_summary=1"); }
function subCount(tid) { const u = getUser(tid); if (!u) return 0; const r = _get("SELECT COUNT(*) as c FROM subscriptions WHERE user_id=?", [u.id]); return r ? r.c : 0; }
function isSubscribed(tid) { const u = getUser(tid); return u?.subscription_end ? new Date(u.subscription_end) > new Date() : false; }
function extendSubscription(tid, days) { const e = new Date(); e.setDate(e.getDate() + days); _run("UPDATE users SET subscription_end=? WHERE telegram_id=?", [e.toISOString(), tid]); return e; }
function addSubscription(tid, url, kws, sname) { const u = findOrCreateUser(tid, null); _run("INSERT INTO subscriptions (user_id,feed_url,keywords,source_name,created_at) VALUES (?,?,?,?,datetime('now'))", [u.id, url, kws||"", sname||""]); return true; }
function getUserSubs(tid) { const u = getUser(tid); return u ? _all("SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC", [u.id]) : []; }
function removeSub(id, tid) { const u = getUser(tid); if (!u) return false; _run("DELETE FROM subscriptions WHERE id=? AND user_id=?", [id, u.id]); return db.getRowsModified() > 0; }
function getAllSubs() { return _all("SELECT s.id,s.feed_url,s.keywords,s.source_name,u.telegram_id,u.username,u.subscription_end FROM subscriptions s JOIN users u ON s.user_id=u.id WHERE u.is_active=1"); }
function hasArticle(g) { return _get("SELECT 1 FROM articles WHERE guid=?", [g]); }
function saveArticle(g, url, title, link, pub) { try { _run("INSERT OR IGNORE INTO articles (guid,feed_url,title,link,published_at,created_at) VALUES (?,?,?,?,?,datetime('now'))", [g, url, title, link, pub]); } catch(_) {} }
function addAlert(tid, sym, price, dir) { const u = findOrCreateUser(tid, null); _run("INSERT INTO alerts (user_id,symbol,target_price,direction,created_at) VALUES (?,?,?,?,datetime('now'))", [u.id, sym, price, dir]); const r = _get("SELECT last_insert_rowid() as id"); return r ? r.id : null; }
function getActiveAlerts() { return _all("SELECT a.*,u.telegram_id FROM alerts a JOIN users u ON a.user_id=u.id WHERE a.triggered=0"); }
function getUserAlerts(tid) { const u = getUser(tid); return u ? _all("SELECT * FROM alerts WHERE user_id=? AND triggered=0 ORDER BY id DESC", [u.id]) : []; }
function removeAlert(id, tid) { const u = getUser(tid); if (!u) return false; _run("DELETE FROM alerts WHERE id=? AND user_id=?", [id, u.id]); return db.getRowsModified() > 0; }
function markAlert(id) { _run("UPDATE alerts SET triggered=1 WHERE id=?", [id]); }

module.exports = { init, getDb:()=>db, findOrCreateUser, getUser, getLang, setLang, isSubscribed, extendSubscription, addSubscription, getUserSubs, removeSub, getAllSubs, subCount, hasArticle, saveArticle, addAlert, getActiveAlerts, getUserAlerts, removeAlert, markAlert, getDaily, setDaily, getDailyUsers };
