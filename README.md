# GezyView

Layanan penghitung "👁 dibaca N kali" untuk artikel blog
https://pakgun.gezytech.web.id/.

## Isi folder

- `server.ts` — layanan (Bun + SQLite, tanpa dependensi). Jalankan:
  `PORT=3101 DB_PATH=./data/gezyview.db bun server.ts`
- `gezyview.service` — unit systemd untuk VPS.
- `DEPLOY.md` — langkah deploy lengkap (DNS, reverse proxy + HTTPS,
  systemd, uji, rollback).
- `blog-patch/` — perubahan sisi blog (lihat `blog-patch/README.md`).

## Endpoint

- `GET /health` → `{ ok: true }`
- `POST /hit` body `{ path }` → mencatat 1 kunjungan, balas `{ path, views }`
- `GET /views?path=...` → `{ path, views }` tanpa mencatat
- `GET /stats?limit=20` → artikel teratas + total

## Aturan hitung

- Maksimal 1 kali per pengunjung per artikel per hari (WIB).
- Dedup via hash SHA-256(IP + salt); IP asli tidak disimpan.
- Bot/crawler tidak dihitung. Tanpa cookie, tanpa data pribadi.
- CORS hanya mengizinkan origin blog (`GEZYVIEW_ORIGINS`).

## Uji lokal (sudah lolos 11/11 saat pembuatan)

health, hit pertama = 1, hit ulang IP sama = tetap 1, IP beda = 2,
bot = tidak menambah, path beda = terpisah, views path kosong = 0,
path tidak valid = ditolak, stats, CORS origin blog diizinkan,
CORS origin asing ditolak.
