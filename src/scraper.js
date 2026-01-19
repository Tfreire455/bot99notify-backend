import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const DATA_DIR = path.resolve("data");

// Em cloud, prefira /tmp. Você pode sobrescrever por env.
const OUT_PATH = process.env.PROJECTS_OUT_PATH
  ? path.resolve(process.env.PROJECTS_OUT_PATH)
  : path.resolve(DATA_DIR, "projects.json");

const SEEN_PATH = process.env.SEEN_PATH
  ? path.resolve(process.env.SEEN_PATH)
  : path.resolve(DATA_DIR, "seen.json");

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
  } catch {
    return { links: [] };
  }
}

function saveSeen(links) {
  ensureDirForFile(SEEN_PATH);
  fs.writeFileSync(SEEN_PATH, JSON.stringify({ links }, null, 2), "utf8");
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const k = keyFn(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function scrapeProjects({ projectsUrl, headless }) {
  ensureDirForFile(OUT_PATH);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    await page.goto(projectsUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("ul.result-list li.result-item", { timeout: 20000 });

    const items = await page.evaluate(() => {
      const abs = (href) => {
        try {
          return new URL(href, location.origin).toString();
        } catch {
          return href;
        }
      };

      const lis = Array.from(document.querySelectorAll("ul.result-list li.result-item"));
      const results = [];

      for (const li of lis) {
        const a = li.querySelector("h1.title a[href^='/project/']");
        if (!a) continue;

        const link = abs(a.getAttribute("href") || "");
        const title = (a.textContent || "").replace(/\s+/g, " ").trim();

        const descEl = li.querySelector(".item-text.description");
        const snippet = (descEl?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260);

        const id = li.getAttribute("data-id") || null;

        results.push({ id, title: title || "Projeto", link, snippet });
      }

      return results;
    });

    const projects = uniqBy(
      items
        .map((x) => ({
          id: x.id || null,
          title: String(x.title || "").trim(),
          link: String(x.link || "").trim(),
          snippet: String(x.snippet || "").trim(),
        }))
        .filter((x) => /\/project\//.test(x.link)),
      (x) => x.link
    );

    fs.writeFileSync(
      OUT_PATH,
      JSON.stringify({ fetchedAt: new Date().toISOString(), count: projects.length, projects }, null, 2),
      "utf8"
    );

    return projects;
  } finally {
    await browser.close();
  }
}

export async function runScraperOnce({ projectsUrl, headless }) {
  return scrapeProjects({ projectsUrl, headless });
}

export function getSeenLinksSet() {
  const seen = loadSeen();
  return new Set(seen.links || []);
}

export function persistSeenLinks(setLinks, keepLast = 2000) {
  const arr = Array.from(setLinks).slice(-keepLast);
  saveSeen(arr);
}

export const paths = { OUT_PATH, SEEN_PATH };
