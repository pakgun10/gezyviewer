/**
 * GezyView — layanan penghitung "dibaca N kali" untuk blog Pak Gun.
 *
 * Stack: Bun + Bun.serve + bun:sqlite, tanpa dependensi luar, satu proses.
 * Dipakai blog https://pakgun.gezytech.web.id/ lewat skrip di halaman artikel.
 *
 * Endpoint:
 *   GET  /health            -> { ok: true }
 *   POST /hit  { path }     -> catat 1 kunjungan (dedup), balas { path, views }
 *   GET  /views?path=...    -> { path, views } (tanpa mencatat)
 *   GET  /stats?limit=20    -> 20 artikel teratas + total (untuk verifikasi)
 *
 * Aturan hitung:
 *   - Satu pengunjung dihitung MAKSIMAL 1 kali per artikel per hari (WIB).
 *   - Dedup memakai hash SHA-256(IP + salt); IP asli TIDAK disimpan.
 *   - User-Agent bot/crawler tidak dihitung (tetap dibalas angka berjalan).
 *   - Tanpa cookie, tanpa akun, tanpa data pribadi.
 *
 * Env:
 *   PORT              (default 3101)
 *   DB_PATH           (default ./data/gezyview.db)
 *   GEZYVIEW_SALT     (default "gezyview" — setel yang lebih acak di VPS)
 *   GEZYVIEW_ORIGINS  (daftar origin dipisah koma; default https://pakgun.gezytech.web.id)
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT || 3101);
const DB_PATH = process.env.DB_PATH || "./data/gezyview.db";
const SALT = process.env.GEZYVIEW_SALT || "gezyview";
const ORIGINS = new Set(
  (process.env.GEZYVIEW_ORIGINS || "https://pakgun.gezytech.web.id")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS hits (
    path TEXT NOT NULL,
    day TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    PRIMARY KEY (path, day, ip_hash)
  );
  CREATE TABLE IF NOT EXISTS counts (
    path TEXT PRIMARY KEY,
    views INTEGER NOT NULL DEFAULT 0
  );
`);

const catat = db.transaction((path: string, day: string, ipHash: string) => {
  const r = db
    .query("INSERT OR IGNORE INTO hits (path, day, ip_hash) VALUES (?, ?, ?)")
    .run(path, day, ipHash);
  if (r.changes > 0) {
    db.query(
      "INSERT INTO counts (path, views) VALUES (?, 1) " +
        "ON CONFLICT(path) DO UPDATE SET views = views + 1"
    ).run(path);
  }
  return (
    db.query("SELECT views FROM counts WHERE path = ?").get(path) as any
  )?.views ?? 0;
});

const BOT =
  /bot|crawler|spider|crawling|slurp|facebookexternal|preview|monitor|uptime|headless/i;

function hariWIB(): string {
  // WIB = UTC+7, tanpa DST: geser lalu ambil tanggal UTC-nya.
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function ipDari(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (Bun as any).requestIP?.(req)?.address || "unknown";
}

function normalisasiPath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const t = p.trim();
  if (!t.startsWith("/") || t.length > 512 || t.includes("..")) return null;
  return t;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
  }
  return {};
}

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health") return json({ ok: true }, 200, cors);

    if (url.pathname === "/views" && req.method === "GET") {
      const path = normalisasiPath(url.searchParams.get("path"));
      if (!path) return json({ error: "path tidak valid" }, 400, cors);
      const row = db.query("SELECT views FROM counts WHERE path = ?").get(path) as any;
      return json({ path, views: row?.views ?? 0 }, 200, cors);
    }

    if (url.pathname === "/hit" && req.method === "POST") {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        return json({ error: "body harus JSON" }, 400, cors);
      }
      const path = normalisasiPath(body?.path);
      if (!path) return json({ error: "path tidak valid" }, 400, cors);
      const ua = req.headers.get("user-agent") || "";
      const saatIni =
        (db.query("SELECT views FROM counts WHERE path = ?").get(path) as any)?.views ?? 0;
      if (BOT.test(ua)) return json({ path, views: saatIni }, 200, cors);
      const ipHash = createHash("sha256")
        .update(SALT + ":" + ipDari(req))
        .digest("hex");
      const views = catat(path, hariWIB(), ipHash);
      return json({ path, views }, 200, cors);
    }

    if (url.pathname === "/stats" && req.method === "GET") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      const rows = db
        .query("SELECT path, views FROM counts ORDER BY views DESC, path ASC LIMIT ?")
        .all(limit);
      const total = (db.query("SELECT COALESCE(SUM(views), 0) AS t FROM counts").get() as any).t;
      return json({ total, top: rows }, 200, cors);
    }

    return json({ error: "tidak ditemukan" }, 404, cors);
  },
});

console.log(`GezyView berjalan di http://localhost:${PORT} (DB: ${DB_PATH})`);
