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

    await page.goto("https://mixch.tv/live/events", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    console.log("Scrolling page...");

    let previousHeight = 0;

    for (let i = 0; i < 20; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        break;
      }

      previousHeight = currentHeight;

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const links = await page.$$eval(
      'a[href*="/live/event/"]',
      els => {
        return els
          .map(e => ({
            title: e.querySelector("img")?.alt || "",
            href: e.href
          }))
          .filter(e => !e.href.includes("/recruiting"));
      }
    );

    const uniqueLinks = [
      ...new Map(links.map(e => [e.href, e])).values()
    ];

    console.log(`${uniqueLinks.length} events found`);

    if (uniqueLinks.length > 0) {
      console.log(uniqueLinks[0]);
    }

    fs.writeFileSync(
      "debug.html",
      await page.content(),
      "utf8"
    );

    const events = [];

    for (const item of uniqueLinks) {
      try {
        console.log(`Processing ${item.href}`);

        await page.goto(item.href, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });

        const description = await page
          .locator('meta[property="og:description"]')
          .getAttribute("content");

        if (!description) {
          console.log("description not found");
          continue;
        }

        const match = description.match(
          /開催期間\s*(.*?)\s*~\s*(.*)/
        );

        if (!match) {
          console.log("date parse failed");
          console.log(description);
          continue;
        }

        const m = item.href.match(/event\/(\d+)/);
        const id = m ? m[1] : "";

        let start = match[1].trim();
        let end = match[2].trim();

        // 00:00 は前日24:00表記に変換
        if (end.endsWith("00:00")) {
          const d = new Date(end.replace(/\//g, "-"));
          d.setDate(d.getDate() - 1);

          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");

          end = `${yyyy}/${mm}/${dd} 24:00`;
        }

        events.push({
          id,
          title: item.title,
          url: item.href,
          start,
          end
        });

        console.log(`${id} OK`);

        await page.waitForTimeout(500);

      } catch (e) {
        console.log(`ERROR ${item.href}`);
        console.log(e.message);
      }
    }

    const uniqueEvents = [
      ...new Map(events.map(e => [e.id, e])).values()
    ];

    fs.writeFileSync(
      "events.json",
      JSON.stringify(uniqueEvents, null, 2),
      "utf8"
    );

    console.log(`Saved ${uniqueEvents.length} events`);

    await browser.close();

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
