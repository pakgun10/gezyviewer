# Patch blog untuk GezyView

## Isi perubahan (`gezyview.patch`)

1. `config/_default/params.toml` — tambah di akhir file:
   ```toml
   [gezyview]
     url = "https://view.gezytech.web.id"
   ```
   Kosongkan `url` untuk menonaktifkan tampilan sepenuhnya.
2. `themes/DoIt/layouts/posts/single.html` — di baris meta bawah judul
   (setelah waktu baca), tambah span tersembunyi + skrip kecil:
   `👁 dibaca <angka> kali`. Skrip memanggil layanan GezyView:
   `POST /hit` sekali per sesi browser per artikel (sisanya `GET /views`),
   lalu menampilkan angkanya. Kalau layanan gagal/tidak terjangkau, span
   tetap tersembunyi dan artikel tampil normal.

## Menerapkan

Dari root repo blog (pastikan tidak ada perubahan lain yang belum
di-commit ikut terbawa — patch ini hanya berisi GezyView):

```bash
git apply gezyview.patch
hugo --gc --minify   # uji di salinan dulu, seperti biasa
git add config/_default/params.toml themes/DoIt/layouts/posts/single.html
git commit -m "Blog: tampilkan penghitung dibaca (GezyView)"
git push origin main   # menunggu kata Pak Gun
```

## Yang sudah diuji

- Build Hugo penuh lolos (tanpa error) dengan patch ini.
- Artikel `menguji-soal-dengan-ai` hasil build memuat span + skrip +
  URL layanan; homepage TIDAK memuat span (hanya halaman artikel).
- Sintaks skrip lolos `node --check`.
- Varian `url = ""` menghasilkan artikel TANPA span sama sekali.
- Catatan: patch ini sengaja TIDAK memuat perubahan Utterances
  (milik Pak Gun, masih uncommitted di working tree) — perubahan itu
  tidak disentuh dan tetap seperti semula.
