const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto("https://mixch.tv/live/events", {
    waitUntil: "networkidle",
    timeout: 60000
  });

  // 必要なら待機
  await page.waitForTimeout(3000);

  const html = await page.content();

  fs.mkdirSync("html", { recursive: true });
  fs.writeFileSync("html/events.html", html, "utf8");

  await browser.close();

  console.log("saved");
})();
