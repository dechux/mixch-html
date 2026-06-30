const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  try {

    console.log("Launching browser...");

    const browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage();

    console.log("Opening event list...");

    await page.goto(
      "https://mixch.tv/live/events",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    await page.waitForTimeout(5000);

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

      try {

        console.log(`Processing ${item.href}`);

        await page.goto(
          item.href,
          {
            waitUntil: "domcontentloaded",
            timeout: 60000
          }
        );

        const description = await page
          .locator('meta[property="og:description"]')
          .getAttribute("content");

        console.log("description:");
        console.log(description);

        if (!description) {
          console.log("description not found");
          continue;
        }

        console.log(item.href);

        const match = description.match(
        /開催期間\s*(.*?)\s*~\s*(.*)/
        );

        if (!match) {
          console.log("date parse failed");
          continue;
        }

        const id = item.href.split("/").pop();

        events.push({
          id: id,
          title: item.title,
          url: item.href,
          start: match[1].trim(),
          end: match[2].trim()
        });

        console.log(`${id} OK`);

      } catch (e) {

        console.log(`ERROR ${item.href}`);
        console.log(e.message);

      }

    }

    fs.writeFileSync(
      "events.json",
      JSON.stringify(events, null, 2),
      "utf8"
    );

    console.log(`Saved ${events.length} events`);

    await browser.close();

  } catch (err) {

    console.error(err);
    process.exit(1);

  }
})();
