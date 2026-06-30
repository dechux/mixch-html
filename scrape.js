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

    const links = await page.$$eval(
      "a.thumb",
      els =>
        els.map(e => ({
          title: e.querySelector("img")?.alt || "",
          href: e.href
        }))
    );

    console.log(`${links.length} events found`);

    const events = [];

    for (const item of links) {

      console.log(`Opening ${item.href}`);

      await page.goto(item.href, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });

      const description = await page
        .locator('meta[property="og:description"]')
        .getAttribute("content");

      const id = item.href.split("/").pop();

      events.push({
        id,
        title: item.title,
        url: item.href,
        description
      });
    }

    fs.writeFileSync(
      "events.json",
      JSON.stringify(events, null, 2),
      "utf8"
    );

    console.log("Saved events.json");

    await browser.close();

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
