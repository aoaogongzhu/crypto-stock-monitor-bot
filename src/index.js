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
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

botModule.register(bot);
poller.start(bot);
scheduler.start(bot);
pricer.start(bot);

app.get("/", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => {
  console.log("Server: http://localhost:" + PORT);
  console.log("Mini App: " + APP_URL);
});

bot.launch().then(() => console.log("Bot started")).catch(e => console.error(e));
process.once("SIGINT", () => { poller.stop(); scheduler.stop(); pricer.stop(); bot.stop("SIGINT"); process.exit(); });
process.once("SIGTERM", () => { poller.stop(); scheduler.stop(); pricer.stop(); bot.stop("SIGTERM"); process.exit(); });
