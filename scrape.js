const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  try {
    console.log("Launching browser...");

    const browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage();

    console.log("Opening MixChannel...");

    await page.goto("https://mixch.tv/live/events", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("Page opened.");

    await page.waitForTimeout(5000);

    const html = await page.content();

    console.log(`HTML length: ${html.length}`);

    fs.mkdirSync("html", { recursive: true });
    fs.writeFileSync("html/events.html", html, "utf8");

    console.log("Saved HTML.");

    await browser.close();

  } catch (err) {
    console.error("ERROR:");
    console.error(err);
    process.exit(1);
  }
})();
