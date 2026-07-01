const { chromium } = require("playwright");
const fs = require("fs");

const LIST_URL = "https://mixch.tv/live/events";
const JSON_PATH = "events.json";
const MIN_EVENTS = 50;

function getEventId(url) {
  const m = url.match(/event\/(\d+)/);
  return m ? m[1] : "";
}

function convertEndTime(end) {
  if (!end.endsWith("00:00")) return end;

  const d = new Date(end.replace(/\//g, "-"));
  d.setDate(d.getDate() - 1);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} 24:00`;
}

function parseEndForCompare(end) {
  if (end.endsWith("24:00")) {
    return new Date(end.replace("24:00", "23:59").replace(/\//g, "-"));
  }
  return new Date(end.replace(/\//g, "-"));
}

function loadOldEvents() {
  if (!fs.existsSync(JSON_PATH)) return [];

  try {
    return JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  } catch (e) {
    console.log("Old events.json read failed. Start empty.");
    return [];
  }
}

(async () => {
  try {
    console.log("Launching browser...");

    const oldEvents = loadOldEvents();
    const oldMap = new Map(oldEvents.map(e => [String(e.id), e]));

    console.log(`Loaded old events: ${oldEvents.length}`);

    const browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage();

    console.log("Opening event list...");

    await page.goto(LIST_URL, {
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

    console.log(`${uniqueLinks.length} event links found`);

    if (uniqueLinks.length < MIN_EVENTS) {
      throw new Error(
        `Only ${uniqueLinks.length} event links found. Expected at least ${MIN_EVENTS}.`
      );
    }

    let events = [];

    for (const item of uniqueLinks) {
      const id = getEventId(item.href);

      if (!id) {
        console.log(`ID not found: ${item.href}`);
        continue;
      }

      if (oldMap.has(id)) {
        const old = oldMap.get(id);

        events.push({
          ...old,
          title: item.title || old.title,
          url: item.href
        });

        console.log(`${id} reused`);
        continue;
      }

      try {
        console.log(`New event. Processing ${item.href}`);

        await page.goto(item.href, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });

        const description = await page
          .locator('meta[property="og:description"]')
          .getAttribute("content");

        if (!description) {
          console.log(`description not found: ${item.href}`);
          continue;
        }

        const match = description.match(
          /開催期間\s*(.*?)\s*~\s*(.*)/
        );

        if (!match) {
          console.log(`date parse failed: ${item.href}`);
          console.log(description);
          continue;
        }

        const start = match[1].trim();
        const end = convertEndTime(match[2].trim());

        events.push({
          id,
          title: item.title,
          url: item.href,
          start,
          end
        });

        console.log(`${id} added`);

        await page.waitForTimeout(500);

      } catch (e) {
        console.log(`ERROR ${item.href}`);
        console.log(e.message);
      }
    }

    events = [
      ...new Map(events.map(e => [String(e.id), e])).values()
    ];

    if (events.length < MIN_EVENTS) {
      console.error(
        `ERROR: Only ${events.length} events were scraped. ` +
        `Expected at least ${MIN_EVENTS}. Skip updating events.json.`
      );

      await browser.close();
      process.exit(1);
    }

    const now = new Date();

    events = events.filter(e => {
      const endDate = parseEndForCompare(e.end);
      return endDate >= now;
    });

    events.sort((a, b) => {
      return parseEndForCompare(a.end) - parseEndForCompare(b.end);
    });

    fs.writeFileSync(
      JSON_PATH,
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
