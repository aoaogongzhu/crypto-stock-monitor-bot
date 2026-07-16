const { Markup } = require("telegraf");
const db = require("./db");
const sources = require("./sources");
const pricer = require("./pricer");
const { t } = require("./lang");

const waits = new Map();
function btn(text, data) { return Markup.button.callback(text, data); }

// ══════════════════════════════════════════════════
//  MENU BUILDERS (lang => menu)
// ══════════════════════════════════════════════════
function mainMenu(lang) {
  return {
    text: t(lang, "main_title"),
    kb: Markup.inlineKeyboard([
      [btn(t(lang,"btn_prices"),"m.p"), btn(t(lang,"btn_trending"),"m.trending")],
      [btn(t(lang,"btn_alerts"),"m.a"), btn(t(lang,"btn_global"),"m.global")],
      [btn(t(lang,"btn_overview"),"m.ov"), btn(t(lang,"btn_news"),"m.n")],
      [btn(t(lang,"btn_ad"),"m.ad"), btn(t(lang,"lang_btn"),"m.lang")]
    ])
  };
}
function priceMenu(lang) {
  return {
    text: t(lang,"price_title"),
    kb: Markup.inlineKeyboard([
      [btn("₿ BTC","p.BTC"), btn("Ξ ETH","p.ETH"), btn("◎ SOL","p.SOL")],
      [btn("Ð DOGE","p.DOGE"), btn("💎 XRP","p.XRP"), btn("🔷 ADA","p.ADA")],
      [btn(t(lang,"btn_stock"),"m.stocks"), btn(t(lang,"convert"),"m.conv"), btn(t(lang,"custom"),"m.custom")],
      [btn(t(lang,"back"),"m.back")]
    ])
  };
}
function stockMenu(lang) {
  return {
    text: t(lang,"stock_title"),
    kb: Markup.inlineKeyboard([
      [btn("AAPL","p.AAPL"), btn("TSLA","p.TSLA"), btn("MSFT","p.MSFT")],
      [btn("GOOG","p.GOOG"), btn("AMZN","p.AMZN"), btn("NVDA","p.NVDA")],
      [btn(t(lang,"custom"),"m.custom"), btn(t(lang,"back"),"m.back")]
    ])
  };
}
function alertMenu(lang) {
  return {
    text: t(lang,"alert_title") + "\n" + t(lang,"alert_desc"),
    kb: Markup.inlineKeyboard([
      [btn(t(lang,"my_alerts"),"a.list"), btn(t(lang,"new_alert"),"a.new")],
      [btn(t(lang,"daly"),"m.daly")],
      [btn(t(lang,"back"),"m.back")]
    ])
  };
}
function newsMenu(lang) {
  const cats = sources.getAll();
  const rows = [];
  for (let i = 0; i < cats.length; i += 2) {
    const r = [btn(cats[i].icon+" "+cats[i].name,"n."+cats[i].key)];
    if (cats[i+1]) r.push(btn(cats[i+1].icon+" "+cats[i+1].name,"n."+cats[i+1].key));
    rows.push(r);
  }
  rows.push([btn(t(lang,"add_feed"),"n.add"), btn(t(lang,"back"),"m.back")]);
  return { text: t(lang,"news_title"), kb: Markup.inlineKeyboard(rows) };
}
function symbolChoice(lang, pref) {
  return {
    text: t(lang,"sel_sym"),
    kb: Markup.inlineKeyboard([
      [btn("₿ BTC",pref+".BTC"), btn("Ξ ETH",pref+".ETH"), btn("◎ SOL",pref+".SOL")],
      [btn("Ð DOGE",pref+".DOGE"), btn("💎 XRP",pref+".XRP")],
      [btn(t(lang,"btn_stock"),pref+".us")],
      [btn(t(lang,"custom"),pref+".xx"), btn(t(lang,"cancel"),"m.back")]
    ])
  };
}

function render(ctx, obj, lang) {
  if (ctx.updateType === "callback_query")
    return ctx.editMessageText(obj.text, { parse_mode:"Markdown", reply_markup:obj.kb.reply_markup }).catch(()=>{});
  return ctx.reply(obj.text, { parse_mode:"Markdown", reply_markup:obj.kb.reply_markup });
}

// ══════════════════════════════════════════════════
//  REGISTER
// ══════════════════════════════════════════════════
function register(bot) {

  bot.start(async (ctx) => {
    db.findOrCreateUser(ctx.from.id, ctx.from.username);
    if (ctx.chat.type !== "private") {
      return ctx.reply("📡 *Crypto/Stock Monitor*\n\n群组中可查价格，完整功能请私聊：@crypto_circle_stock_market_bot", { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn("💰 BTC","g.BTC"),btn("💰 ETH","g.ETH"),btn("💰 AAPL","g.AAPL")]]).reply_markup });
    }
    waits.delete(ctx.from.id);
    const lang = db.getLang(ctx.from.id);
    await ctx.reply(t(lang,"welcome"), { parse_mode:"Markdown" });
    await render(ctx, mainMenu(lang));
  });

  // ── Navigation ─────────────────────────────────
  bot.action("m.back", async (ctx) => {
    waits.delete(ctx.from.id);
    await render(ctx, mainMenu(db.getLang(ctx.from.id)));
  });
  bot.action("m.p", async (ctx) => { await render(ctx, priceMenu(db.getLang(ctx.from.id))); });
  bot.action("m.a", async (ctx) => { await render(ctx, alertMenu(db.getLang(ctx.from.id))); });
  bot.action("m.n", async (ctx) => { await render(ctx, newsMenu(db.getLang(ctx.from.id))); });
  bot.action("m.stocks", async (ctx) => { await render(ctx, stockMenu(db.getLang(ctx.from.id))); });

  // ── Language toggle ────────────────────────────
  bot.action("m.lang", async (ctx) => {
    const cur = db.getLang(ctx.from.id);
    const next = cur === "zh" ? "en" : "zh";
    db.setLang(ctx.from.id, next);
    await ctx.answerCbQuery(t(next, "lang_done"));
    await render(ctx, mainMenu(next));
  });

  // ── Custom symbol ──────────────────────────────
  bot.action("m.custom", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    waits.set(ctx.from.id, { step:"awaiting_symbol" });
    await ctx.editMessageText(t(lang,"prompt_symbol"));
    await ctx.answerCbQuery();
  });

  // ═══════════════════════════════════════════════
  //  📊 OVERVIEW
  // ═══════════════════════════════════════════════
  bot.action("m.ov", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.cryptoOverview();
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const msg = t(lang,"ov_crypto") + "\n" + new Date().toLocaleString(lang==="zh"?"zh-CN":"en-US") + "\n\n" + pricer.fmtOverview(data);
      await ctx.editMessageText(msg, { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.ov")],[btn(t(lang,"btn_ov_stock"),"m.ovstk")],[Markup.button.url("💬 @pincess_aoao","https://t.me/pincess_aoao")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  bot.action("m.ovstk", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.stockOverview();
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const msg = t(lang,"ov_stock") + "\n" + new Date().toLocaleString(lang==="zh"?"zh-CN":"en-US") + "\n\n" + pricer.fmtOverview(data);
      await ctx.editMessageText(msg, { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.ovstk")],[btn(t(lang,"btn_ov_crypto"),"m.ov")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  
  // ═══════════════════════════════════════════════
  //  🔥 TRENDING
  // ═══════════════════════════════════════════════
  bot.action("m.trending", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.trending();
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"trending_empty")); return; }
      const lines = data.map((c,i) => (i+1)+". *"+c.name+"* ("+c.symbol+")" + (c.rank ? " #"+c.rank : ""));
      await ctx.editMessageText(t(lang,"trending_title")+"\n\n"+lines.join("\n"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.trending")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  // ═══════════════════════════════════════════════
  //  🌐 GLOBAL DATA
  // ═══════════════════════════════════════════════
  bot.action("m.global", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const g = await pricer.globalData();
      if (!g) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const fmt = (n) => n != null ? "$"+(n/1e12).toFixed(2)+"T" : "N/A";
      const msg = t(lang,"global_title")+"\n\n"+
        t(lang,"global_cap")+fmt(g.totalCap)+"\n"+
        t(lang,"global_vol")+fmt(g.totalVol)+"\n"+
        t(lang,"global_btc")+(g.btcDominance!=null?g.btcDominance.toFixed(1)+"%":"N/A")+"\n"+
        t(lang,"global_eth")+(g.ethDominance!=null?g.ethDominance.toFixed(1)+"%":"N/A")+"\n"+
        t(lang,"global_coins")+(g.coins||"N/A");
      await ctx.editMessageText(msg+"\n\n📊 @crypto_circle_stock_market_bot", { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.global")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  
  // ═══════════════════════════════════════════════
  //  📈 CHART
  // ═══════════════════════════════════════════════
  bot.action(/^c\.(\w+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const chart = await pricer.chartDataUrl(ctx.match[1]);
      if (!chart) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      await ctx.replyWithPhoto(chart.url);
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  // ═══════════════════════════════════════════════
  //  🔄 CONVERT
  // ═══════════════════════════════════════════════
  bot.action("m.conv", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    waits.set(ctx.from.id, { step:"awaiting_convert" });
    await ctx.editMessageText(t(lang,"prompt_convert"));
    await ctx.answerCbQuery();
  });

  
  // ═══════════════════════════════════════════════
  //  🏷️ CATEGORIES
  // ═══════════════════════════════════════════════
  bot.action("m.cats", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.categories();
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const rows = [];
      for (let i=0; i<data.length; i+=2) {
        const r = [btn(data[i].name, "m.cat."+data[i].id)];
        if (data[i+1]) r.push(btn(data[i+1].name, "m.cat."+data[i+1].id));
        rows.push(r);
      }
      rows.push([btn(t(lang,"nft"),"m.nft"), btn(t(lang,"back"),"m.ov")]);
      await ctx.editMessageText(t(lang,"cat_title"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard(rows).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  bot.action(/^m\.cat\.(.+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const catId = ctx.match[1];
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.categoryCoins(catId);
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const lines = data.map((c,i) => (i+1)+". *"+c.name+"* ("+c.symbol+") $"+(c.price||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6})+(c.change24h!=null?(c.change24h>0?" 📈 +"+c.change24h.toFixed(2)+"%":" 📉 "+c.change24h.toFixed(2)+"%"):""));
      await ctx.editMessageText(t(lang,"cat_title")+"\n\n"+lines.join("\n"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.cat."+catId)],[btn(t(lang,"back"),"m.cats")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  // ═══════════════════════════════════════════════
  //  😱 FEAR & GREED
  // ═══════════════════════════════════════════════
  bot.action("m.fng", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const fg = await pricer.fearGreed();
      if (!fg) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const em = parseInt(fg.value) < 25 ? "😱" : parseInt(fg.value) < 45 ? "😰" : parseInt(fg.value) < 55 ? "😐" : parseInt(fg.value) < 75 ? "😊" : "😎";
      const msg = em+" *"+t(lang,"fng")+"*\n\n"+t(lang,"fng_value")+"*"+fg.value+"* / 100\n"+t(lang,"fng_class")+"*"+fg.classification+"*";
      await ctx.editMessageText(msg, { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"m.fng")],[btn(t(lang,"back"),"m.ov")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  
  // ═══════════════════════════════════════════════
  //  🏛️ EXCHANGES
  // ═══════════════════════════════════════════════
  bot.action(/^e\.(\w+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"loading"));
    try {
      const data = await pricer.exchanges(ctx.match[1]);
      if (!data||!data.length) { await ctx.editMessageText(t(lang,"err_fetch")); return; }
      const lines = data.map((t,i) => (i+1)+". *"+t.ex+"* "+t.pair+"\n   $"+t.price.toLocaleString()+" Vol:"+(t.vol/1e6).toFixed(0)+"M"+(t.trust==="green"?" ✅":""));
      await ctx.editMessageText("🏛️ *"+ctx.match[1].toUpperCase()+" Exchanges*\n\n"+lines.join("\n"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"e."+ctx.match[1])],[btn(t(lang,"back"),"m.p")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_fetch")); }
  });

  // ═══════════════════════════════════════════════
  //  📅 DAILY BRIEF TOGGLE
  // ═══════════════════════════════════════════════
  bot.action("m.daly", async (ctx) => {
    const lang = db.getLang(ctx.from.id); const cur = db.getDaily(ctx.from.id);
    db.setDaily(ctx.from.id, cur ? 0 : 1);
    await ctx.answerCbQuery(cur ? "❌ Daily OFF" : "✅ Daily ON");
    await ctx.editMessageText(t(lang,cur?"daly_off":"daly_on"), { reply_markup:Markup.inlineKeyboard([[btn(t(lang,"back"),"m.a")]]).reply_markup });
  });

  
  // ═══════════════════════════════════════════════
  //  👥 GROUP PRICE
  // ═══════════════════════════════════════════════
  bot.action(/^g\.(\w+)$/, async (ctx) => {
    const sym = ctx.match[1].toUpperCase();
    const name = ctx.from.first_name || ctx.from.username || "User";
    await ctx.editMessageText("🔍 " + name + " 查询 " + sym + "...");
    try {
      const d = await pricer.detail(sym);
      if (!d||d.price==null) { await ctx.editMessageText(name + ": ❌ " + sym); return; }
      const chg = d.change24h!=null?(d.change24h>0?"📈 +":"📉 ")+d.change24h.toFixed(2)+"%":"";
      await ctx.editMessageText(name + " 查询:\\n*"+(d.name||sym)+"*  $*"+d.price.toLocaleString()+"*  "+chg, { parse_mode:"Markdown" });
    } catch(_) { await ctx.editMessageText(name + ": ❌"); }
  });

  // ═══════════════════════════════════════════════
  //  📊 K-LINE
  // ═══════════════════════════════════════════════
  bot.action(/^k\.(\w+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText("📊 选择周期:", { reply_markup:Markup.inlineKeyboard([[btn("1d","k."+ctx.match[1]+".1"),btn("7d","k."+ctx.match[1]+".7"),btn("30d","k."+ctx.match[1]+".30")],[btn(t(lang,"back"),"m.p")]]).reply_markup });
  });
  bot.action(/^k\.(\w+)\.(\d+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id), sym = ctx.match[1].toUpperCase(), days = parseInt(ctx.match[2]);
    await ctx.editMessageText("📊 加载 K线...");
    try {
      const data = await pricer.ohlc(sym, days);
      if (!data||!data.length) { await ctx.editMessageText("❌"); return; }
      const lines = data.map(d => { const c = d.c-d.o; return d.t+"  O$"+Number(d.o).toLocaleString()+"  H$"+Number(d.h).toLocaleString()+"  L$"+Number(d.l).toLocaleString()+"  C$"+Number(d.c).toLocaleString()+"  "+(c>0?"📈":c<0?"📉":"➖"); });
      await ctx.editMessageText("📊 *"+sym+" K-line ("+days+"d)*\n\n"+lines.join("\n"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn("📈 Chart","c."+sym),btn("📥 CSV","x."+sym)],[btn("1d","k."+sym+".1"),btn("7d","k."+sym+".7"),btn("30d","k."+sym+".30")],[btn(t(lang,"back"),"m.p")]]).reply_markup }); } catch(_) { await ctx.editMessageText("❌"); }

  });

  // ═══════════════════════════════════════════════
  //  📥 CSV EXPORT
  // ═══════════════════════════════════════════════
  bot.action(/^x\.(\w+)$/, async (ctx) => {
    await ctx.editMessageText("📥 选择周期:", { reply_markup:Markup.inlineKeyboard([[btn("1d","x."+ctx.match[1]+".1"),btn("7d","x."+ctx.match[1]+".7"),btn("30d","x."+ctx.match[1]+".30")],[btn(t(db.getLang(ctx.from.id),"back"),"m.p")]]).reply_markup });
  });
  bot.action(/^x\.(\w+)\.(\d+)$/, async (ctx) => {
    const sym = ctx.match[1], days = parseInt(ctx.match[2]);
    try {
      const data = await pricer.ohlc(sym, days);
      if (!data) { await ctx.editMessageText("❌"); return; }
      const csv = "Date,Open,High,Low,Close\n" + data.map(d => d.t+","+d.o+","+d.h+","+d.l+","+d.c).join("\n");
      await ctx.replyWithDocument({source:Buffer.from(csv,"utf-8"), filename:sym+"_"+days+"d.csv"});
      await ctx.editMessageText("✅ 文件已发送");
    } catch(_) { await ctx.editMessageText("❌"); }
  });

  // ═══════════════════════════════════════════════
  //  📢 ADVERTISING
  // ═══════════════════════════════════════════════
  bot.action("m.ad", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"ad_title") + "\n\n" + t(lang,"ad_body"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"back"),"m.back")]]).reply_markup });
    await ctx.answerCbQuery();
  });

  // ═══════════════════════════════════════════════
  //  💰 PRICE
  // ═══════════════════════════════════════════════
  bot.action(/^p\.(\w+)$/, async (ctx) => {
    const sym = ctx.match[1].toUpperCase();
    const lang = db.getLang(ctx.from.id);
    await ctx.editMessageText(t(lang,"fetching") + sym + "...");
    try {
      const d = await pricer.detail(sym);
      if (!d||d.price==null) { await ctx.editMessageText(t(lang,"not_found")+sym); return; }
      const chg = d.chg!=null ? (d.chg>0?"📈 +":"📉 ")+d.chg.toFixed(2)+"%" : "N/A";
      const cap = d.cap!=null ? "$"+(d.cap/1e9).toFixed(2)+"B" : "N/A";
      const ps = d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      const hs = d.high!=null ? d.high.toLocaleString() : "N/A";
      const ls = d.low!=null ? d.low.toLocaleString() : "N/A";
      const rankStr = d.rank ? " #"+d.rank : "";
      const ch1 = d.change1h!=null ? t(lang,"label_1h")+(d.change1h>0?"📈 +":"📉 ")+d.change1h.toFixed(2)+"%" : "";
      const ch24 = d.change24h!=null ? (d.change24h>0?"📈 +":"📉 ")+d.change24h.toFixed(2)+"%" : "N/A";
      const ch7 = d.change7d!=null ? t(lang,"label_7d")+(d.change7d>0?"📈 +":"📉 ")+d.change7d.toFixed(2)+"%" : "";
      const vol = d.volume24h!=null ? t(lang,"label_vol")+"$"+(d.volume24h/1e9).toFixed(2)+"B" : "";
      const sup = d.circulatingSupply!=null ? t(lang,"label_supply")+(d.circulatingSupply/1e6).toFixed(1)+"M" : "";
      const ath = d.ath!=null ? t(lang,"label_ath")+"$"+d.ath.toLocaleString()+(d.athDate?" ("+d.athDate+")":"") : "";
      const msg = "*"+(d.name||sym)+" ("+sym+")*"+rankStr+"\n💰 $*"+ps+"*\n"+ch1+(ch1?" | ":"")+ch24+(ch7?" | "+ch7:"")+"\n"+t(lang,"label_cap")+cap+(vol?" | "+vol:"")+"\n"+(sup?sup:"")+(ath?"\n"+ath:"");
      await ctx.editMessageText(msg+"\n\n📊 @crypto_circle_stock_market_bot", { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"chart"),"c."+sym), btn(t(lang,"exchanges"),"e."+sym)],[btn(t(lang,"back"),"m.p")]]).reply_markup });
    } catch(_) { await ctx.editMessageText(t(lang,"err_q")); }
  });

  // ═══════════════════════════════════════════════
  //  🚨 ALERTS
  // ═══════════════════════════════════════════════
  bot.action("a.list", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const list = db.getUserAlerts(ctx.from.id);
    if (!list.length) {
      await ctx.editMessageText(t(lang,"no_alerts"), { reply_markup:Markup.inlineKeyboard([[btn(t(lang,"new_alert"),"a.new")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
      return;
    }
    const lines = list.map((a,i) => (i+1)+". "+a.symbol+" "+(a.direction==="above"?"📈 >":"📉 <")+" $"+Number(a.target_price).toLocaleString()+"    [❌](del."+a.id+")");
    await ctx.editMessageText(t(lang,"alert_list")+"\n\n"+lines.join("\n")+"\n\n点击 ❌ 删除", { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"new_alert"),"a.new")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
  });

  bot.action("a.new", async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const s = symbolChoice(lang, "a.s");
    await ctx.editMessageText(s.text, { parse_mode:"Markdown", reply_markup:s.kb.reply_markup });
    await ctx.answerCbQuery();
  });

  bot.action(/^a\.s\.(\w+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const sym = ctx.match[1].toUpperCase();
    if (sym === "US") {
      await ctx.editMessageText(t(lang,"sel_stock"), { reply_markup:Markup.inlineKeyboard([[btn("AAPL","a.s.AAPL"),btn("TSLA","a.s.TSLA"),btn("MSFT","a.s.MSFT")],[btn(t(lang,"custom"),"a.s.xx"),btn(t(lang,"cancel"),"m.back")]]).reply_markup });
      await ctx.answerCbQuery();
      return;
    }
    if (sym === "XX") {
      waits.set(ctx.from.id, { step:"awaiting_alert_symbol" });
      await ctx.editMessageText(t(lang,"prompt_asym"));
      await ctx.answerCbQuery();
      return;
    }
    waits.set(ctx.from.id, { step:"awaiting_alert_price", symbol:sym });
    await ctx.editMessageText("🚨 "+sym+"\n"+t(lang,"prompt_price"));
    await ctx.answerCbQuery();
  });

  bot.action(/^a\.d\.(.+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const dir = ctx.match[1];
    const state = waits.get(ctx.from.id);
    if (!state||!state.symbol||state.price==null) { waits.delete(ctx.from.id); await render(ctx, alertMenu(lang)); return; }
    db.addAlert(ctx.from.id, state.symbol, state.price, dir);
    waits.delete(ctx.from.id);
    const dirT = dir==="above" ? t(lang,"above") : t(lang,"below");
    await ctx.editMessageText(t(lang,"alert_created")+"\n"+state.symbol+" "+dirT+" $"+Number(state.price).toLocaleString(), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"again"),"a.new")],[btn(t(lang,"back"),"m.back")]]).reply_markup });
  });

  bot.action(/^del\.(\d+)$/, async (ctx) => {
    db.removeAlert(parseInt(ctx.match[1]), ctx.from.id);
    await ctx.answerCbQuery(t(db.getLang(ctx.from.id),"del_ok"));
    const list = db.getUserAlerts(ctx.from.id);
    if (!list.length) {
      await ctx.editMessageText(t(db.getLang(ctx.from.id),"no_alerts"), { reply_markup:Markup.inlineKeyboard([[btn(t(db.getLang(ctx.from.id),"new_alert"),"a.new")],[btn(t(db.getLang(ctx.from.id),"back"),"m.back")]]).reply_markup });
    } else {
      const lines = list.map((a,i) => (i+1)+". "+a.symbol+" "+(a.direction==="above"?"📈 >":"📉 <")+" $"+Number(a.target_price).toLocaleString());
      await ctx.editMessageText(t(db.getLang(ctx.from.id),"alert_list")+"\n\n"+lines.join("\n"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(db.getLang(ctx.from.id),"new_alert"),"a.new")],[btn(t(db.getLang(ctx.from.id),"back"),"m.back")]]).reply_markup });
    }
  });

  // ═══════════════════════════════════════════════
  //  📡 NEWS
  // ═══════════════════════════════════════════════
  bot.action(/^n\.(.+)$/, async (ctx) => {
    const lang = db.getLang(ctx.from.id);
    const key = ctx.match[1];
    if (key === "add") {
      waits.set(ctx.from.id, { step:"awaiting_feed_url" });
      await ctx.editMessageText(t(lang,"prompt_feed"));
      await ctx.answerCbQuery();
      return;
    }
    const cat = sources.getCategory(key);
    if (!cat) { await ctx.answerCbQuery("Invalid", true); return; }
    const rows = cat.feeds.map((f,i) => [btn("📌 "+f.name,"n.sub."+key+"."+i)]);
    rows.push([btn("📥 "+(lang==="zh"?"全部订阅":"Subscribe All"),"n.sc."+key)]);
    rows.push([btn(t(lang,"back"),"m.n")]);
    await ctx.editMessageText(cat.icon+" *"+cat.name+"*\n"+(lang==="zh"?"点击订阅：":"Tap to subscribe:"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard(rows).reply_markup });
    await ctx.answerCbQuery();
  });

  bot.action(/^n\.sub\.(.+)\.(\d+)$/, async (ctx) => {
    const cat = sources.getCategory(ctx.match[1]); const idx = parseInt(ctx.match[2]);
    if (!cat||!cat.feeds[idx]) return;
    const f = cat.feeds[idx];
    if (db.addSubscription(ctx.from.id, f.url, "", f.name)) await ctx.answerCbQuery("✅ "+f.name);
    else await ctx.answerCbQuery("❌", true);
  });

  bot.action(/^n\.sc\.(.+)$/, async (ctx) => {
    const cat = sources.getCategory(ctx.match[1]); if (!cat) return;
    let c=0; for (const f of cat.feeds) { if (db.addSubscription(ctx.from.id, f.url, "", f.name)) c++; }
    await ctx.answerCbQuery("✅ "+(c>0?"Added "+c:"❌"));
  });

  // ═══════════════════════════════════════════════
  //  TEXT INPUT
  // ═══════════════════════════════════════════════
  bot.on("text", async (ctx) => {
    if (ctx.chat.type!=="private") return;
    const tid = ctx.from.id, state = waits.get(tid);
    if (!state) return;
    const lang = db.getLang(tid);
    const txt = ctx.message.text.trim();

    if (state.step==="awaiting_symbol") {
      waits.delete(tid);
      const sym = txt.toUpperCase();
      await ctx.reply(t(lang,"fetching")+sym+"...");
      try {
        const d = await pricer.detail(sym);
        if (!d||d.price==null) { await ctx.reply(t(lang,"not_found")+sym); return; }
        const chg = d.chg!=null ? (d.chg>0?"📈 +":"📉 ")+d.chg.toFixed(2)+"%" : "N/A";
        await ctx.reply("*"+(d.name||sym)+" ("+sym+")*"+(d.rank?" #"+d.rank:"")+"\n💰 $*"+d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+"*\n"+t(lang,"label_1h")+(d.change1h!=null?(d.change1h>0?"📈 +":"📉 ")+d.change1h.toFixed(2)+"%":"")+" | "+ch24, { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"refresh"),"p."+sym)],[btn(t(lang,"back"),"m.p")]]).reply_markup });
      } catch(_) { await ctx.reply(t(lang,"err_q")); }
      return;
    }

    if (state.step==="awaiting_alert_symbol") {
      waits.set(tid, { step:"awaiting_alert_price", symbol:txt.toUpperCase() });
      await ctx.reply("🚨 "+txt.toUpperCase()+"\n"+t(lang,"prompt_price"));
      return;
    }

    if (state.step==="awaiting_alert_price") {
      const price = parseFloat(txt.replace(/,/g,""));
      if (isNaN(price)||price<=0) { await ctx.reply(t(lang,"err_price")); return; }
      state.price=price; state.step="awaiting_direction";
      await ctx.reply("🚨 "+state.symbol+" $"+Number(price).toLocaleString()+"\n"+t(lang,"prompt_dir"), { reply_markup:Markup.inlineKeyboard([[btn(t(lang,"above"),"a.d.above")],[btn(t(lang,"below"),"a.d.below")]]).reply_markup });
      return;
    }

    
if (state.step==="awaiting_convert") {
  const parts = txt.split(/\s+/);
  if (parts.length<4||parts[2].toLowerCase()!=="to") { await ctx.reply(t(lang,"err_price")+"\n"+t(lang,"prompt_convert")); return; }
  const amount = parseFloat(parts[0].replace(/,/g,""));
  if (isNaN(amount)||amount<=0) { await ctx.reply(t(lang,"err_price")); return; }
  const from = parts[1].toUpperCase();
  const to = parts[3].toUpperCase();
  const r = await pricer.convertNow(amount, from, to);
  if (!r) { await ctx.reply(t(lang,"not_found")+from+" or "+to); return; }
  const fmt = (n) => n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6});
  waits.delete(ctx.from.id);
  await ctx.reply("🔄 *"+t(lang,"convert_result")+"*\n\n"+fmt(amount)+" "+from+" = *"+fmt(r.result)+" "+to+"*\n1 "+from+" = "+fmt(r.rate)+" "+to, { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn("🔄 "+t(lang,"convert"),"m.conv")],[btn(t(lang,"back"),"m.p")]]).reply_markup });
  return;
}

if (state.step==="awaiting_feed_url") {
      try { new URL(txt); } catch(_) { await ctx.reply(t(lang,"err_url")); return; }
      waits.delete(tid);
      if (db.addSubscription(ctx.from.id, txt, "", "")) await ctx.reply(t(lang,"feed_ok"), { parse_mode:"Markdown", reply_markup:Markup.inlineKeyboard([[btn(t(lang,"back"),"m.back")]]).reply_markup });
      else await ctx.reply(t(lang,"err_sub"));
      return;
    }

    waits.delete(tid);
  });
}

module.exports = { register };
