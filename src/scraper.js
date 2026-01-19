import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const DATA_DIR = path.resolve("data");

// Em cloud, prefira /tmp (configurável por env)
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

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`fetch failed: ${res.status} ${res.statusText} ${txt.slice(0, 200)}`);
  }

  return res.text();
}

async function scrapeProjects({ projectsUrl }) {
  ensureDirForFile(OUT_PATH);

  const html = await fetchHtml(projectsUrl);
  const $ = cheerio.load(html);

  const results = [];

  $("ul.result-list li.result-item").each((_, li) => {
    const el = $(li);

    const a = el.find("h1.title a[href^='/project/']").first();
    if (!a.length) return;

    const href = a.attr("href") || "";
    const link = absUrl("https://www.99freelas.com.br", href);

    const title = (a.text() || "").replace(/\s+/g, " ").trim() || "Projeto";

    const descEl = el.find(".item-text.description").first();
    const snippet = (descEl.text() || "").replace(/\s+/g, " ").trim().slice(0, 260);

    const id = el.attr("data-id") || null;

    if (!/\/project\//.test(link)) return;

    results.push({ id, title, link, snippet });
  });

  const projects = uniqBy(
    results
      .map((x) => ({
        id: x.id || null,
        title: String(x.title || "").trim(),
        link: String(x.link || "").trim(),
        snippet: String(x.snippet || "").trim(),
      }))
      .filter((x) => x.link),
    (x) => x.link
  );

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify({ fetchedAt: new Date().toISOString(), count: projects.length, projects }, null, 2),
    "utf8"
  );

  return projects;
}

export async function runScraperOnce({ projectsUrl, headless }) {
  // headless ignorado (sem browser). Mantido pra compatibilidade.
  return scrapeProjects({ projectsUrl });
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
