const yahooFinance = require("yahoo-finance2").default;
const db = require("./db");

// CoinGecko IDs
const CG = {
  BTC:"bitcoin",ETH:"ethereum",SOL:"solana",BNB:"binancecoin",
  XRP:"ripple",ADA:"cardano",DOGE:"dogecoin",DOT:"polkadot",
  MATIC:"matic-network",AVAX:"avalanche-2",LINK:"chainlink",
  UNI:"uniswap",ATOM:"cosmos",LTC:"litecoin",BCH:"bitcoin-cash",
  TRX:"tron",APT:"aptos",SUI:"sui",NEAR:"near",OP:"optimism",
  ARB:"arbitrum",PEPE:"pepe",SHIB:"shiba-inu",AAVE:"aave",
  MKR:"maker",STX:"stacks",FIL:"filecoin",ICP:"internet-computer",
  INJ:"injective",RUNE:"thorchain",FET:"fetch-ai",SEI:"sei",
  TIA:"celestia",WIF:"dogwifcoin",BONK:"bonk",JUP:"jupiter",
  IMX:"immutable-x",ONDO:"ondo-finance",ENA:"ethena",
  WLD:"worldcoin-org",ZRO:"layerzero"
};
const CRYPTO = new Set(Object.keys(CG));

let bot = null, timer = null;
function start(b) { bot = b; check(); timer = setInterval(check, 60000); }
function stop() { if (timer) clearInterval(timer); }

// ── Alert checker ────────────────────────────────
async function check() {
  const alerts = db.getActiveAlerts();
  if (!alerts || !alerts.length) return;
  const g = {};
  for (const a of alerts) (g[a.symbol] = g[a.symbol] || []).push(a);
  for (const [sym, list] of Object.entries(g)) {
    try {
      const price = await priceNow(sym);
      if (price == null) continue;
      for (const a of list) {
        const hit = a.direction === "above" ? price >= a.target_price : price <= a.target_price;
        if (hit) { db.markAlert(a.id); sendAlert(a.telegram_id, sym, a.target_price, a.direction, price); }
      }
    } catch (_) {}
  }
}

// ── Single price ─────────────────────────────────
async function priceNow(sym) {
  const u = sym.toUpperCase();
  return CRYPTO.has(u) ? cgPrice(u) : yfPrice(u);
}
async function cgPrice(sym) {
  const id = CG[sym]; if (!id) return null;
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + id + "&vs_currencies=usd", { signal: AbortSignal.timeout(8000) });
  const d = await r.json(); return d[id]?.usd || null;
}
async function yfPrice(sym) {
  const q = await yahooFinance.quote(sym); return q.regularMarketPrice || null;
}

// ── Detailed ──────────────────────────────────────
async function detail(sym) {
  const u = sym.toUpperCase();
  if (CRYPTO.has(u)) {
    const id = CG[u]; if (!id) return null;
    const r = await fetch("https://api.coingecko.com/api/v3/coins/" + id, { signal: AbortSignal.timeout(8000) });
    const d = await r.json(); const m = d.market_data;
    return { price: m?.current_price?.usd, chg: m?.price_change_percentage_24h, high: m?.high_24h?.usd, low: m?.low_24h?.usd, cap: m?.market_cap?.usd, name: d.name };
  }
  const q = await yahooFinance.quote(u);
  return { price: q.regularMarketPrice, chg: q.regularMarketChangePercent, high: q.regularMarketDayHigh, low: q.regularMarketDayLow, cap: q.marketCap, name: q.shortName || q.longName };
}

// ══════════════════════════════════════════════════
//  OVERVIEW (batch) — for the price table
// ══════════════════════════════════════════════════
const TOP_CRYPTO = ["BTC","ETH","SOL","BNB","XRP","ADA","DOGE","DOT","AVAX","LINK"];
const TOP_STOCKS = ["AAPL","TSLA","MSFT","GOOG","AMZN","NVDA"];

async function cryptoOverview() {
  const ids = TOP_CRYPTO.map(s => CG[s]).filter(Boolean);
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") + "&vs_currencies=usd&include_24hr_change=true";
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await r.json();
  return TOP_CRYPTO.map(s => {
    const id = CG[s]; const d = data[id];
    return d ? { symbol: s, price: d.usd, change24h: d.usd_24h_change } : null;
  }).filter(Boolean);
}

async function stockOverview() {
  const results = await Promise.all(TOP_STOCKS.map(async s => {
    try {
      const q = await yahooFinance.quote(s);
      return { symbol: s, price: q.regularMarketPrice, change24h: q.regularMarketChangePercent };
    } catch (_) { return null; }
  }));
  return results.filter(Boolean);
}

// ── Format overview as text ──────────────────────
function fmtOverview(data) {
  return data.map(d => {
    const p = d.price != null ? "$" + d.price.toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2}) : "N/A";
    const c = d.change24h != null ? (d.change24h > 0 ? "📈 +" : "📉 ") + d.change24h.toFixed(2) + "%" : "";
    return d.symbol.padEnd(6) + " " + p.padEnd(12) + " " + c;
  }).join("\n");
}

// ── Alert push ───────────────────────────────────
async function sendAlert(tid, sym, target, dir, cur) {
  try {
    await bot.telegram.sendMessage(tid,
      "🚨 *" + sym + " 价格提醒！*\n" + (dir === "above" ? "📈 突破" : "📉 跌破") + " $" + Number(target).toLocaleString() + "\n当前: *$" + Number(cur).toLocaleString() + "*\n" + new Date().toLocaleString("zh-CN"),
      { parse_mode: "Markdown" });
  } catch (_) {}
}


async function trending() {
  const r = await fetch("https://api.coingecko.com/api/v3/search/trending", { signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  return (d.coins || []).slice(0, 8).map(c => c.item).map(i => ({ symbol: i.symbol.toUpperCase(), name: i.name, rank: i.market_cap_rank }));
}
async function globalData() {
  const r = await fetch("https://api.coingecko.com/api/v3/global", { signal: AbortSignal.timeout(10000) });
  const d = await r.json(); const g = d.data;
  return { totalCap: g.total_market_cap?.usd, totalVol: g.total_volume?.usd, btcDominance: g.market_cap_percentage?.btc, ethDominance: g.market_cap_percentage?.eth, coins: g.active_cryptocurrencies };
}
// Extend crypto detail with more fields
const _origDetail = detail;
detail = async function(sym) {
  const u = sym.toUpperCase();
  if (CRYPTO.has(u)) {
    const id = CG[u]; if (!id) return null;
    const r = await fetch("https://api.coingecko.com/api/v3/coins/" + id + "?localization=false&tickers=false&community_data=false&developer_data=false", { signal: AbortSignal.timeout(10000) });
    const d = await r.json(); const m = d.market_data;
    return {
      price: m?.current_price?.usd, change1h: m?.price_change_percentage_1h_in_currency?.usd,
      change24h: m?.price_change_percentage_24h, change7d: m?.price_change_percentage_7d,
      marketCap: m?.market_cap?.usd, volume24h: m?.total_volume?.usd,
      circulatingSupply: m?.circulating_supply, ath: m?.ath?.usd,
      athDate: m?.ath_date?.usd ? m.ath_date.usd.slice(0,10) : null,
      rank: d?.market_cap_rank, name: d?.name
    };
  }
  return _origDetail(u);
};


async function chartDataUrl(sym, days) {
  const u = sym.toUpperCase();
  if (!CRYPTO.has(u)) return null;
  const id = CG[u]; if (!id) return null;
  const r = await fetch("https://api.coingecko.com/api/v3/coins/" + id + "/market_chart?vs_currency=usd&days=" + (days||7), {signal:AbortSignal.timeout(10000)});
  const d = await r.json();
  const prices = (d.prices||[]).map(p=>p[1]); if (prices.length<2) return null;
  const c = encodeURIComponent(JSON.stringify({type:"line",data:{labels:prices.map(()=>""),datasets:[{data:prices,borderColor:"#00ff88",backgroundColor:"rgba(0,255,136,0.1)",fill:true,pointRadius:0,borderWidth:2}]},options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:"#333"}}}}}));
  return {url:"https://quickchart.io/chart?width=600&height=300&c="+c, symbol:u};
}
async function convertNow(amount, fromSym, toSym) {
  if (!fromSym||!toSym) return null;
  if (fromSym==="USD") {
    const p = await priceNow(toSym);
    return p ? {from:fromSym,to:toSym,amount,result:amount/p,rate:p} : null;
  }
  if (toSym==="USD") {
    const p = await priceNow(fromSym);
    return p ? {from:fromSym,to:toSym,amount,result:amount*p,rate:p} : null;
  }
  const pf = await priceNow(fromSym);
  const pt = await priceNow(toSym);
  if (!pf||!pt) return null;
  return {from:fromSym,to:toSym,amount,result:(amount*pf)/pt,rate:pf/pt};
}


async function categories() {
  const r = await fetch("https://api.coingecko.com/api/v3/coins/categories", {signal:AbortSignal.timeout(10000)});
  const d = await r.json();
  return d.slice(0,15).map(c => ({id:c.id, name:c.name, coinCount:c.coins_count}));
}
async function categoryCoins(catId) {
  const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=" + catId + "&order=market_cap_desc&per_page=10&page=1&sparkline=false", {signal:AbortSignal.timeout(10000)});
  const d = await r.json(); if (!Array.isArray(d)) return [];
  return d.map(c => ({symbol:c.symbol.toUpperCase(), name:c.name, price:c.current_price, change24h:c.price_change_percentage_24h}));
}
async function fearGreed() {
  const r = await fetch("https://api.alternative.me/fng/?limit=1", {signal:AbortSignal.timeout(8000)});
  const d = await r.json(); const item = d.data?.[0];
  return item ? { value: item.value, classification: item.value_classification } : null;
}

async function exchanges(sym) {
  const u = sym.toUpperCase(); if (!CRYPTO.has(u)) return null;
  const id = CG[u]; if (!id) return null;
  const r = await fetch("https://api.coingecko.com/api/v3/coins/" + id + "/tickers", {signal:AbortSignal.timeout(10000)});
  const d = await r.json();
  return (d.tickers||[]).slice(0,5).map(t => ({ex:t.market.name, pair:t.base+"/"+t.target, price:t.last, vol:t.volume, trust:t.trust_score}));
}
async function ohlc(sym, days) {
  const u = sym.toUpperCase(); if (!CRYPTO.has(u)) return null;
  const id = CG[u]; if (!id) return null;
  const r = await fetch('https://api.coingecko.com/api/v3/coins/' + id + '/ohlc?vs_currency=usd&days=' + (days||7), {signal:AbortSignal.timeout(10000)});
  const d = await r.json(); if (!Array.isArray(d)) return null;
  return d.map(c => ({t:new Date(c[0]).toLocaleDateString(), o:c[1], h:c[2], l:c[3], c:c[4]}));
}

async function nftTop() {
  const r = await fetch("https://api.coingecko.com/api/v3/nfts/list?per_page=10&page=1&order=volume_usd_desc",{signal:AbortSignal.timeout(10000)});
  const d = await r.json(); if (!Array.isArray(d)) return [];
  return d.slice(0,10).map(n => ({name:n.name, floor:n.floor_price?.usd, vol:n.volume_24h?.usd, sym:n.symbol}));
}
module.exports = { start, stop, priceNow, detail, cryptoOverview, stockOverview, fmtOverview, CRYPTO };
