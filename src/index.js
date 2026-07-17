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
if (!BOT_TOKEN) { console.error("BOT_TOKEN not set"); process.exit(1); }

db.init();
const bot = new Telegraf(BOT_TOKEN, { pollingTimeout: 30000 });
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

botModule.register(bot);
poller.start(bot);
scheduler.start(bot);
pricer.start(bot);

bot.catch((e) => { console.error("Bot error:", e?.message || e); });

async function startBot(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log("Deleting webhook...");
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log("Starting bot polling...");
      await bot.launch();
      console.log("Bot started successfully");
      return;
    } catch (e) {
      console.error("Bot launch failed (attempt " + (i+1) + "/" + retries + "):", e?.message || e);
      if (i < retries - 1) {
        console.log("Retrying in 5 seconds...");
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  console.error("Bot failed to start after " + retries + " attempts");
}

app.get("/", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => {
  console.log("Server: http://localhost:" + PORT);
  console.log("Mini App: " + APP_URL);
  startBot();
});

process.once("SIGINT", () => { poller.stop(); scheduler.stop(); pricer.stop(); bot.stop("SIGINT"); process.exit(); });
process.once("SIGTERM", () => { poller.stop(); scheduler.stop(); pricer.stop(); bot.stop("SIGTERM"); process.exit(); });
