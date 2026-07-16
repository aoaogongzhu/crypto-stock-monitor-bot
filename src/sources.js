// 🗂️ 内置内容源 — 加密/金融/科技
const sources = {
  crypto: {
    name: "加密货币",
    icon: "₿",
    feeds: [
      { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
      { name: "Decrypt", url: "https://decrypt.co/feed" },
      { name: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
      { name: "The Block", url: "https://www.theblock.co/rss.xml" },
    ]
  },
  stocks: {
    name: "美股行情",
    icon: "📈",
    feeds: [
      { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss" },
      { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories" },
      { name: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
      { name: "Reuters Business", url: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best&best-sectors=financials" },
    ]
  },
  economy: {
    name: "宏观经济",
    icon: "🌍",
    feeds: [
      { name: "WSJ Markets", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
      { name: "FT News", url: "http://www.ft.com/rss/companies/financial-services" },
      { name: "Investopedia", url: "https://www.investopedia.com/feedbuilder/feed/getfeed?feedName=rss_articles" },
    ]
  },
  tech: {
    name: "科技",
    icon: "💻",
    feeds: [
      { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
      { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
    ]
  }
};

function getAll() {
  return Object.entries(sources).map(function(kv) {
    return { key: kv[0], name: kv[1].name, icon: kv[1].icon, feeds: kv[1].feeds };
  });
}

function getCategory(key) {
  return sources[key] || null;
}

function findFeed(url) {
  for (var k in sources) {
    for (var f of sources[k].feeds) {
      if (f.url === url) return { category: k, feed: f };
    }
  }
  return null;
}

module.exports = { sources, getAll, getCategory, findFeed };
