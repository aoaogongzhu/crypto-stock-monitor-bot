require("dotenv").config();
const express = require("express");
const { Telegraf } = require("telegraf");
const path = require("path");
const db = require("./db");
const botModule = require("./bot");
const poller = require("./poller");
const scheduler = require("./scheduler");
const pricer = require("./pricer");

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const PORT = process.env.PORT || 3000;

async function main() {
  if (!BOT_TOKEN) { console.error("BOT_TOKEN not set"); process.exit(1); }
  
  await db.init();
  console.log("Database initialized");
  
  const bot = new Telegraf(BOT_TOKEN, { pollingTimeout: 30000 });
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  botModule.register(bot);
  poller.start(bot);
  scheduler.start(bot);
  pricer.start(bot);

  bot.catch((e) => { console.error("Bot error:", e?.message || e); });

  app.get("/", (req, res) => res.json({ status: "ok" }));
  app.listen(PORT, () => {
    console.log("Server: http://localhost:" + PORT);
    console.log("Mini App: " + APP_URL);
  });

  console.log("Deleting webhook...");
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  console.log("Starting bot polling...");
  await bot.launch();
  console.log("Bot started");
}

main().catch(e => { console.error("Fatal:", e?.message || e); process.exit(1); });

process.on("SIGINT", () => { poller.stop(); scheduler.stop(); pricer.stop(); process.exit(0); });
process.on("SIGTERM", () => { poller.stop(); scheduler.stop(); pricer.stop(); process.exit(0); });
