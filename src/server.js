import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

import { initFirebaseAdmin, registerDeviceToken, sendNewProjectPush } from "./fcm.js";
import { generateProposal } from "./proposal.js";
import { runScraperOnce, getSeenLinksSet, persistSeenLinks } from "./scraper.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3333);
const PROJECTS_URL = process.env.PROJECTS_URL;
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() === "true";
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 60);

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (FIREBASE_SERVICE_ACCOUNT) {
  initFirebaseAdmin(path.resolve(FIREBASE_SERVICE_ACCOUNT));
  console.log("✅ Firebase Admin inicializado");
} else {
  console.log("⚠️ FIREBASE_SERVICE_ACCOUNT não definido. Push desativado.");
}

let lastProjects = [];

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/projects", (_, res) => {
  res.json({ count: lastProjects.length, projects: lastProjects });
});

app.post("/devices/register", (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "token_required" });

  const total = registerDeviceToken(token);
  res.json({ ok: true, total });
});

app.post("/proposal", async (req, res) => {
  const { projectTitle, projectSnippet, projectUrl, value, prazoDias } = req.body || {};

  const text = await generateProposal({
    apiKey: OPENAI_API_KEY,
    projectTitle: String(projectTitle || "Projeto"),
    projectSnippet: String(projectSnippet || ""),
    projectUrl: String(projectUrl || ""),
    value: value != null ? Number(value) : null,
    prazoDias: prazoDias != null ? Number(prazoDias) : null,
  });

  res.json({ ok: true, text });
});

async function poll() {
  const seenLinks = getSeenLinksSet();

  while (true) {
    try {
      const projects = await runScraperOnce({ projectsUrl: PROJECTS_URL, headless: HEADLESS });
      lastProjects = projects;

      const news = projects.filter((p) => !seenLinks.has(p.link));
      if (news.length) {
        console.log(`🚀 Novos projetos: ${news.length}`);

        for (const n of news) {
          seenLinks.add(n.link);

          if (FIREBASE_SERVICE_ACCOUNT) {
            await sendNewProjectPush({
              title: "Novo projeto no 99Freelas",
              body: n.title,
              url: n.link,
            });
          }
        }

        persistSeenLinks(seenLinks);
      } else {
        console.log("… nenhum novo projeto agora.");
      }
    } catch (e) {
      console.log("❌ Erro no poll:", e?.message || e);
    }

    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API rodando em http://0.0.0.0:${PORT}`);
  poll();
});

