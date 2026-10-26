# Deploy GezyView di VPS

GezyView = layanan penghitung "👁 dibaca N kali" untuk artikel di
https://pakgun.gezytech.web.id/. Satu proses Bun + SQLite, tanpa dependensi.

## 1. DNS (di Cloudflare, akun Pak Gun)

Buat record untuk layanan ini, diarahkan ke IP VPS (ikuti pola proxy
aplikasi Bapak yang lain):

- Type: `A`, Name: `view`, Content: `<IP VPS>`, TTL: Auto

Hasil akhir: `https://view.gezytech.web.id` harus menunjuk ke VPS.

## 2. Salin kode ke VPS

```bash
sudo mkdir -p /opt/gezyview
# salin server.ts ke /opt/gezyview/ (scp/rsync dari mesin Bapak)
cd /opt/gezyview
```

## 3. Reverse proxy + HTTPS (WAJIB)

Blog memakai HTTPS, jadi layanan ini **wajib HTTPS juga** — kalau masih
HTTP, browser memblokir panggilan dari halaman HTTPS dan angkanya tidak
tampil. Contoh nginx (sesuaikan dengan proxy yang sudah ada di VPS):

```nginx
server {
    server_name view.gezytech.web.id;

    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl; # sertifikat via certbot
}
```

Lalu: `sudo certbot --nginx -d view.gezytech.web.id` (atau cara TLS
yang biasa Bapak pakai).

## 4. systemd

```bash
sudo cp gezyview.service /etc/systemd/system/gezyview.service
# 1) sesuaikan path bun di ExecStart dengan hasil `which bun`
# 2) isi GEZYVIEW_SALT dengan: openssl rand -hex 16
sudo systemctl daemon-reload
sudo systemctl enable --now gezyview
sudo systemctl status gezyview
```

## 5. Uji dari VPS

```bash
curl http://127.0.0.1:3101/health
# -> {"ok":true}
curl -X POST https://view.gezytech.web.id/hit \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{"path":"/tes/"}'
# -> {"path":"/tes/","views":1}
curl "https://view.gezytech.web.id/stats"
```

## 6. Pasang perubahan blog (SETELAH layanan jalan)

1. Di repo blog, terapkan patch: `git apply gezyview.patch`
   (file `blog-patch/gezyview.patch` — hanya berisi perubahan GezyView;
   perubahan lain di working tree tidak ikut).
2. Uji build di salinan (`hugo --gc --minify`) seperti biasa.
3. Commit + push — **menunggu kata Pak Gun**.
4. Cloudflare Pages deploy otomatis. Buka satu artikel: di baris meta
   bawah judul harus muncul "👁 dibaca 1 kali" (kunjungan pertama).
5. Cek angka dari sisi server: `curl https://view.gezytech.web.id/stats`

## 7. Rollback

- Matikan tampilan tanpa mematikan layanan: kosongkan `url` di
  `[gezyview]` pada `params.toml` (span & skrip tidak dirender).
- Matikan layanan: `sudo systemctl stop gezyview`
- Data tersimpan di `data/gezyview.db` (SQLite satu file — cukup
  disalin untuk backup).

## Catatan

- Aturan hitung: 1 pengunjung = maks 1 kali per artikel per hari (WIB).
  IP asli tidak disimpan, hanya hash SHA-256(IP + salt) untuk dedup.
- User-Agent bot/crawler tidak dihitung.
- Angka mulai dari nol saat layanan tayang; kunjungan lama tidak bisa
  dihitung mundur.
- Kalau layanan mati, skrip blog gagal diam-diam: artikel tetap bisa
  dibaca normal, hanya angkanya tidak tampil.
