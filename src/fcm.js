import fs from "fs";
import path from "path";
import admin from "firebase-admin";

const TOKENS_PATH = path.resolve("data/device_tokens.json");

function ensureDataDir() {
  const dir = path.resolve("data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTokens() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  } catch {
    return { tokens: [] };
  }
}

function saveTokens(tokens) {
  ensureDataDir();
  fs.writeFileSync(TOKENS_PATH, JSON.stringify({ tokens }, null, 2), "utf8");
}

export function initFirebaseAdmin(serviceAccountPath) {
  try {
    const full = path.resolve(serviceAccountPath);
    if (!fs.existsSync(full)) {
      console.log(`⚠️ Firebase: arquivo não encontrado: ${full}`);
      return false;
    }

    const raw = fs.readFileSync(full, "utf8");
    const serviceAccount = JSON.parse(raw);

    // validação mínima para evitar crash com json errado
    if (!serviceAccount.project_id || typeof serviceAccount.project_id !== "string") {
      console.log("⚠️ Firebase: serviceAccountKey.json inválido (sem project_id). Baixe o JSON correto em Project settings > Service accounts.");
      return false;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    console.log(`✅ Firebase Admin OK (project_id: ${serviceAccount.project_id})`);
    return true;
  } catch (e) {
    console.log("⚠️ Firebase: falhou ao inicializar:", e?.message || e);
    return false;
  }
}

export function registerDeviceToken(token) {
  const db = loadTokens();
  const set = new Set(db.tokens || []);
  set.add(token);
  const tokens = Array.from(set);
  saveTokens(tokens);
  return tokens.length;
}

export async function sendNewProjectPush({ title, body, url }) {
  // se firebase não inicializou, não tenta
  if (admin.apps.length === 0) return { sent: 0, reason: "firebase_not_initialized" };

  const db = loadTokens();
  const tokens = (db.tokens || []).filter(Boolean);
  if (!tokens.length) return { sent: 0, reason: "no_tokens" };

  const message = {
    notification: {
      title: title || "Novo projeto no 99Freelas",
      body: body || "Toque para abrir",
    },
    data: {
      url: String(url || ""),
      type: "NEW_PROJECT",
    },
    tokens,
  };

  const res = await admin.messaging().sendEachForMulticast(message);

  const invalid = [];
  res.responses.forEach((r, idx) => {
    if (!r.success) invalid.push(tokens[idx]);
  });

  if (invalid.length) {
    const filtered = tokens.filter((t) => !invalid.includes(t));
    saveTokens(filtered);
  }

  return { sent: res.successCount, failed: res.failureCount, removed: invalid.length };
}
