const Parser = require("rss-parser");
const db = require("./db");

const parser = new Parser();
let bot = null, timer = null;

function start(b) { bot = b; poll(); timer = setInterval(poll, 10*60*1000); }
function stop() { if (timer) clearInterval(timer); }

async function poll() {
  const subs = db.getAllSubs();
  if (!subs || !subs.length) return;

  const seen = new Set();
  for (const s of subs) {
    if (seen.has(s.feed_url)) continue;
    seen.add(s.feed_url);
    try {
      const feed = await parser.parseURL(s.feed_url);
      for (const item of (feed.items || []).slice(0, 10)) {
        const guid = item.guid || item.link || item.title;
        if (!guid || db.hasArticle(guid)) continue;
        db.saveArticle(guid, s.feed_url, item.title||"", item.link||"", item.pubDate||item.isoDate||"");
        if (match(item.title + " " + item.link, s.keywords)) push(s.telegram_id, item.title, item.link, s.feed_url);
      }
    } catch (_) {}
  }
}

function match(text, kw) {
  if (!kw) return true;
  const words = kw.split(",").filter(Boolean);
  if (!words.length) return true;
  const t = (text||"").toLowerCase();
  return words.some(w => t.includes(w.trim().toLowerCase()));
}

async function push(tid, title, link, src) {
  try {
    await bot.telegram.sendMessage(tid,
      "📰 *" + (title||"(无标题)") + "*\n" + src + "\n[打开](" + (link||"") + ")",
      { parse_mode: "Markdown", disable_web_page_preview: true });
  } catch (_) {}
}

module.exports = { start, stop };
