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
  'a[href*="/live/event/"]',
  (els) => {
    return els
      .map(e => ({
        title: e.querySelector("img")?.alt || "",
        href: e.href
      }))
      .filter(e => !e.href.includes("/recruiting"));
  }
);

    console.log(`${links.length} events found`);
    console.log(JSON.stringify(links.slice(0,5), null, 2));

    if (links.length > 0) {
      console.log(links[0]);
    }

    fs.writeFileSync(
      "debug.html",
      await page.content(),
      "utf8"
    );

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

        const m = item.href.match(/event\/(\d+)/);

        const id = m ? m[1] : "";

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
