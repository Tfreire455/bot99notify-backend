import fs from "fs";
import path from "path";
import admin from "firebase-admin";

// Em cloud, prefira /tmp (configurável por env)
const TOKENS_PATH = process.env.TOKENS_PATH
  ? path.resolve(process.env.TOKENS_PATH)
  : path.resolve("data/device_tokens.json");

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  } catch {
    return { tokens: [] };
  }
}

function saveTokens(tokens) {
  ensureDirForFile(TOKENS_PATH);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify({ tokens }, null, 2), "utf8");
}

/**
 * Inicializa o Firebase Admin:
 * - Preferência: FIREBASE_SERVICE_ACCOUNT (JSON)
 * - NÃO usa arquivo em cloud
 */
export function initFirebaseAdmin() {
  try {
    let envJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!envJson) {
      console.log("⚠️ Firebase: FIREBASE_SERVICE_ACCOUNT ausente/ inválida (não é JSON).");
      return false;
    }

    // remove aspas externas se vierem do painel/arquivo
    envJson = envJson.trim();
    if (
      (envJson.startsWith("'") && envJson.endsWith("'")) ||
      (envJson.startsWith('"') && envJson.endsWith('"'))
    ) {
      envJson = envJson.slice(1, -1).trim();
    }

    if (!envJson.startsWith("{")) {
      console.log("⚠️ Firebase: FIREBASE_SERVICE_ACCOUNT ausente/ inválida (não é JSON).");
      return false;
    }

    const serviceAccount = JSON.parse(envJson);

    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    if (!serviceAccount?.project_id || typeof serviceAccount.project_id !== "string") {
      console.log("⚠️ Firebase: service account inválido (sem project_id).");
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
