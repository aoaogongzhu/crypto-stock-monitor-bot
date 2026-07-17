const fs=require("fs");
const c=fs.readFileSync("C:/Users/19927/tg-content-bot/src/bot.js","utf8");
const lines=c.split("\n");
const si=lines.findIndex(l=>l.includes("function render"));
const ei=lines.findIndex((l,i)=>i>si&&l.startsWith("function register"));
const newFunc=[
"function render(ctx, obj, lang) {\r",
"  if (ctx.updateType === \"callback_query\")\r",
"    return ctx.editMessageText(obj.text, { parse_mode:\"Markdown\", reply_markup:obj.kb.reply_markup }).catch(()=>{});\r",
"  return ctx.reply(obj.text, { parse_mode:\"Markdown\", reply_markup:obj.kb.reply_markup });\r",
"}\r"
];
lines.splice(si, ei-si, ...newFunc);
fs.writeFileSync("C:/Users/19927/tg-content-bot/src/bot.js",lines.join("\n"),"utf8");
console.log("OK render lines", si, "to", ei);
