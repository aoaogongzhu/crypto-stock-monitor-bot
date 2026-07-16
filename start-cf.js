const { spawn } = require("child_process");
const path = require("path");

const CLOUDFLARED = path.join(process.env.USERPROFILE, "cloudflared.exe");
const PORT = 3000;

console.log("Starting Cloudflare tunnel...");
const cf = spawn(CLOUDFLARED, ["tunnel", "--url", "http://localhost:" + PORT]);
let urlFound = false;

cf.stderr.on("data", (data) => {
  process.stdout.write(data.toString());
  const m = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !urlFound) {
    urlFound = true;
    const url = m[0];
    console.log("\n========================================");
    console.log("  TUNNEL_URL: " + url);
    console.log("========================================\n");
    process.env.APP_URL = url;
    require("./src/index.js");
  }
});

cf.on("error", (e) => { console.error("cloudflared error:", e.message); process.exit(1); });
cf.on("exit", (c) => { console.log("cloudflared exited:", c); process.exit(c); });

setInterval(() => {}, 60000);
