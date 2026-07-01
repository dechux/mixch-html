const { chromium } = require("playwright");
const fs = require("fs");

const LIST_URL = "https://mixch.tv/live/events";
const JSON_PATH = "events.json";

function getEventId(url) {
  const m = url.match(/event\/(\d+)/);
  return m ? m[1] : "";
}

function convertEndTime(end) {
  // 2026/07/06 00:00 → 2026/07/05 24:00
  if (!end.endsWith("00:00")) return end;

  const d = new Date(end.replace(/\//g, "-"));
  d.setDate(d.getDate() - 1);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} 24:00`;
}

function parseEndForCompare(end) {
  // 24:00 は同日23:59として比較
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

    let events = [];

    for (const item of uniqueLinks) {
      const id = getEventId(item.href);

      if (!id) {
        console.log(`ID not found: ${item.href}`);
        continue;
      }

      // 既存イベントは詳細ページへアクセスしない
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

      // 新規イベントだけ詳細ページへアクセス
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

    // 重複削除
    events = [
      ...new Map(events.map(e => [String(e.id), e])).values()
    ];

    // 終了済みイベントを削除
    const now = new Date();

    events = events.filter(e => {
      const endDate = parseEndForCompare(e.end);
      return endDate >= now;
    });

    // 終了日順に並び替え
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
