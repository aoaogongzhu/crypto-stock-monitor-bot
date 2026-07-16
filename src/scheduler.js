const db = require("./db");
const pricer = require("./pricer");
let bot = null, timer = null;

function start(b) {
  bot = b;
  timer = setInterval(check, 60000);
  console.log("📅 Daily scheduler started");
}
function stop() { if (timer) clearInterval(timer); }

async function check() {
  const now = new Date();
  if (now.getHours() !== 9 || now.getMinutes() !== 0) return;
  const users = db.getDailyUsers();
  if (!users || !users.length) return;

  const [btc, eth, global, fg] = await Promise.all([
    pricer.priceNow("BTC").catch(()=>null),
    pricer.priceNow("ETH").catch(()=>null),
    pricer.globalData().catch(()=>null),
    pricer.fearGreed().catch(()=>null)
  ]);

  const date = now.toLocaleDateString("zh-CN");
  let msg = "📅 *Daily Brief*\n" + date;
  if (btc) msg += "\n\n₿ BTC: $" + Number(btc).toLocaleString();
  if (eth) msg += "\nΞ ETH: $" + Number(eth).toLocaleString();
  if (global) msg += "\n\n📊 Total Cap: $" + (global.totalCap/1e12).toFixed(2) + "T";
  if (fg) msg += "\n😱 F&G: " + fg.value + " - " + fg.classification;
  msg += "\n\n📊 @crypto_circle_stock_market_bot";
  try {
    const tr = await pricer.trending().catch(()=>[]);
    if (tr && tr.length > 0) msg += "\n\n🔥 " + tr.slice(0,3).map(t=>t.symbol).join(", ");
  } catch(_) {}

  for (const u of users) {
    try { await bot.telegram.sendMessage(u.telegram_id, msg, { parse_mode: "Markdown" }); } catch(_) {}
  }
}

module.exports = { start, stop };
