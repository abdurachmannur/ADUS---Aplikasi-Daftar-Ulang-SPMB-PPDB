# Sistem Informasi Pengumuman Seleksi SPMB

Aplikasi web full-stack **Sistem Informasi Pengumuman Seleksi SPMB (Sistem Penerimaan Murid Baru)** yang ringan, cepat, dan siap produksi. Dibangun menggunakan **React + Vite + TypeScript + Tailwind CSS** di sisi frontend serta **Node.js 26 + Express + SQLite (`better-sqlite3`) + PDFKit + SheetJS (`xlsx`)** di sisi backend tanpa membutuhkan server database terpisah.

---

## Fitur Utama

### 1. Portal Publik / Calon Peserta Didik (`/`)
- **Kunci Jadwal Pengumuman Otomatis (WIB):**
  - Sebelum jadwal dibuka, halaman menampilkan *countdown timer* menuju tanggal & jam pengumuman yang dikonfigurasi Admin.
  - Setelah jadwal dibuka, calon siswa dapat memasukkan **NISN** untuk mengecek hasil seleksi secara instan.
- **Halaman Hasil Seleksi:**
  - Menampilkan Kop Surat resmi sekolah, judul pengumuman, **Nomor SK**, serta **uraian/detail keputusan SK** yang dapat diedit dari Panel Admin.
  - Tabel ringkas identitas hasil seleksi (`No Urut`, `No Pendaftaran`, `Nama Lengkap`, `NISN`, `Asal Sekolah`, `Jalur Pendaftaran`).
  - Status **DITERIMA** menampilkan tombol pengisian formulir daftar ulang dan tombol unduh dokumen PDF resmi otomatis; status **TIDAK DITERIMA** menampilkan pesan motivasi yang sopan.
- **Formulir Daftar Ulang Multi-Step (3 Tahap) & Keamanan PIN 6 Digit:**
  - Tahap 1: Data Pribadi Siswa · Tahap 2: Data Orang Tua/Wali & Kontak · Tahap 3: Data Periodik & Riwayat Sekolah.
  - Seluruh kolom dropdown (Agama, Kewarganegaraan, Tinggal Bersama, Moda Transportasi, Pendidikan, Pekerjaan, Jarak) diambil secara dinamis dari tabel `form_options`.
  - Seluruh kolom tanggal lahir menggunakan format baku Indonesia **`dd-mm-yyyy`** lengkap dengan kalender berbahasa Indonesia.
  - **Perlindungan Data Pribadi dengan PIN 6 Digit:** Saat pertama kali menyimpan formulir daftar ulang, siswa membuat PIN keamanan 6 digit pribadi (disimpan dalam bentuk *hash bcrypt*). Kunjungan ulang membutuhkan verifikasi PIN untuk melihat/mengedit formulir maupun mengunduh PDF yang memuat data pribadi (dilengkapi *rate limiting* percobaan PIN).
- **Unduh 4 Dokumen PDF Resmi Otomatis (Format A4):**
  1. **Surat Pernyataan Diterima** — terisi otomatis sesuai data siswa dengan Kop Surat (Logo Dinas / Gambar Kop), status coret otomatis (`DITERIMA / TIDAK DITERIMA*`), serta **Cap Sekolah & Tanda Tangan Kepala Sekolah** (PNG transparan bertumpuk).
  2. **Surat Pemanggilan Daftar Ulang** — terisi otomatis beserta tabel jadwal daftar ulang (`Hari`, `Tanggal`, `Waktu`, `Ruang`) per siswa (atau default global), Kop Surat, dan Cap + TTD Kepala Sekolah.
  3. **Surat Pernyataan Peserta Didik Baru** *(aktif & terlindungi PIN setelah formulir disimpan)* — bergaya *Modern Akademis Navy* dengan pilihan penanda tangan **Ayah / Ibu / Wali** secara dinamis.
  4. **Formulir Peserta Didik Baru** *(aktif & terlindungi PIN setelah formulir disimpan)* — bergaya *Modern Akademis Navy & Tabel Rapi* terisi lengkap dari isian 3 tahap siswa dengan pilihan penanda tangan **Ayah / Ibu / Wali**.
- **Lampiran PDF Tambahan:** Dokumen PDF tambahan yang diunggah Admin tampil otomatis apabila berstatus aktif.
- **Akses Admin Terpisah:** Tidak ada tautan Login Admin di halaman publik maupun halaman siswa; administrator mengakses panel secara manual melalui alamat `/admin`.

### 2. Panel Administrator (`/admin`)
- **Dashboard Ringkasan:** Statistik total pendaftar, siswa diterima/tidak diterima, progres pengisian formulir daftar ulang, dan rekap per jalur pendaftaran.
- **Atur Profil Sekolah & Jadwal:** Kelola nama sekolah, tahun pelajaran, alamat, Nomor SK, detail uraian SK, teks Kop Surat simetris, **Logo Sekolah**, **Logo Dinas (untuk Kop Surat)**, gambar kop surat opsional, serta tanggal & jam pembukaan pengumuman (WIB).
- **Template & Pengaturan Surat:**
  - Kelola Nama & NIP Kepala Sekolah, unggah PNG transparan **Cap Sekolah** dan **Tanda Tangan Kepala Sekolah** dengan **kanvas pratinjau interaktif geser (drag) & ubah ukuran (resize)** yang sinkron 1:1 dengan cetakan PDF.
  - Edit isi, nomor surat, titi mangsa, poin pernyataan, jadwal default daftar ulang (`Hari`, `Tanggal`, `Waktu`, `Ruang`), dan syarat berkas untuk seluruh template surat.
  - Unduh pratinjau PDF langsung untuk keempat jenis dokumen sebelum dipublikasikan.
- **Data Siswa & Hasil Seleksi:** Tambah/edit/hapus manual, **seleksi & hapus massal**, pengaturan jadwal daftar ulang khusus per siswa (opsional), unduh template Excel, serta **Impor massal dari Excel (`.xlsx`)**.
- **Formulir Masuk, Reset PIN & Rekap Excel:** Pantau status pengisian & status PIN siswa diterima, **seleksi & hapus massal isian formulir** (tanpa menghapus data induk siswa), **Reset PIN Siswa** apabila siswa lupa PIN (hapus PIN agar siswa membuat baru atau tetapkan PIN sementara 6 digit), lihat detail formulir, cetak ringkasan, unduh 4 PDF resmi per siswa, dan **Ekspor Rekap Excel (`.xlsx`)**.
- **Opsi Dropdown Formulir:** Kelola seluruh daftar pilihan dropdown formulir tanpa perlu mengubah kode.
- **Lampiran PDF Tambahan:** Unggah dokumen PDF pelengkap (tata tertib, panduan seragam, jadwal MPLS, dll.).
- **Backup, Restore & Tahun Pelajaran Baru:**
  - Unduh cadangan data dalam format **Arsip Lengkap (`.zip`)** *(database + seluruh unggahan Logo, Kop, Cap, TTD, dan PDF)* maupun **Database SQLite (`.db`)** saja, serta buat snapshot langsung di server.
  - **Pulihkan (Restore)** dari file `.zip`/`.db` atau dari **Riwayat Auto-Backup Server** secara langsung tanpa perlu restart server.
  - **Reset Tahun Pelajaran Baru** selektif berbasis kotak centang (pilih pembersihan Siswa, Formulir, Lampiran PDF, atau Dropdown) sambil mempertahankan Profil Sekolah, Aset Kop/Cap/TTD, Template Surat, dan Akun Admin.
  - Setiap aksi Reset Tahun Baru maupun Restore otomatis dilindungi **Auto-Backup `.zip` pengaman** (tersimpan persisten di `data/backups/`) dan **verifikasi kata sandi Administrator**.
- **Manajemen Akun Admin:** Tambah akun admin baru dan ubah kata sandi.

---

## Arsitektur & Persyaratan Sistem

- **Runtime Produksi:** **Node.js 26** (`>= 26.0.0`)
- **Database:** SQLite3 (`better-sqlite3`, mode WAL) tersimpan lokal di `./data/spmb.db` (atau `/app/data/spmb.db` pada Docker)
- **File Unggahan:** Tersimpan di `./uploads` (atau `/app/uploads` pada Docker)
- **Port Default:** `3000` (dapat diubah via variabel lingkungan `PORT`)

---

## Akses Awal Panel Admin

Panel Admin diakses secara manual melalui browser di:

```text
http://<alamat-server>:3000/admin
```

Akun administrator bawaan yang otomatis dibuat saat database pertama kali diinisialisasi:
- **Username:** `admin`
- **Password:** `admin123`

> **Penting untuk Keamanan Produksi:** Segera ubah kata sandi default melalui menu **Manajemen Akun Admin** setelah login pertama, dan pastikan variabel lingkungan `JWT_SECRET` diisi string acak yang kuat.

---

## Konfigurasi Variabel Lingkungan (`.env`)

Salin file `.env.example` menjadi `.env` sebelum menjalankan server di lingkungan produksi:

```env
PORT=3000
JWT_SECRET="ganti-dengan-string-acak-minimal-32-karakter"
SQLITE_DB_PATH="./data/spmb.db"
UPLOADS_DIR="./uploads"
```

---

## Panduan Instalasi & Produksi

### A. Instalasi di Docker (`node:26-alpine` dengan Penyimpanan Persisten) — Direkomendasikan

Konfigurasi Docker menggunakan image **`node:26-alpine`** (multi-stage build) serta **Docker Named Volumes** (`spmb_persistent_data` untuk database SQLite dan `spmb_persistent_uploads` untuk logo, cap sekolah, tanda tangan, dan lampiran PDF) sehingga **seluruh data tetap tersimpan aman meskipun container dimatikan (`docker compose down`), direstart, atau diperbarui**.

#### Prasyarat
- Docker Engine & Docker Compose plugin (`docker compose version`)

#### Langkah Menjalankan
1. Siapkan file `.env` di direktori proyek (isi `JWT_SECRET` rahasia produksi):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` lalu atur `JWT_SECRET` dengan kode acak yang kuat (misalnya hasil `openssl rand -hex 32`).

2. Build dan jalankan container di background:
   ```bash
   docker compose up -d --build
   ```

3. Cek status & kesehatan container:
   ```bash
   docker compose ps
   docker compose logs -f spmb-app
   ```

4. Akses aplikasi:
   - Halaman Siswa: `http://localhost:3000`
   - Panel Admin: `http://localhost:3000/admin`

#### Verifikasi Persistensi Data Docker
- Menghentikan container (`docker compose down`) lalu menyalakannya kembali (`docker compose up -d`) **tidak menghapus** volume `spmb_persistent_data` maupun `spmb_persistent_uploads`.
- **Perhatian:** Jangan menjalankan `docker compose down -v` di server produksi, karena opsi `-v` akan menghapus volume data.

#### Backup & Restore Data pada Docker
- **Melalui Panel Admin (Direkomendasikan):** Buka menu **Backup, Restore & Tahun Baru** di `/admin` untuk mengunduh arsip lengkap `.zip` atau `.db`, memulihkan cadangan tanpa restart container, dan mengakses riwayat Auto-Backup yang tersimpan otomatis di dalam volume persisten `/app/data/backups`.
- **Alternatif via CLI Docker (tar.gz):**
  ```bash
  mkdir -p backups
  docker run --rm -v spmb_persistent_data:/data -v "$(pwd)/backups:/backup" alpine \
    tar czf /backup/spmb-data-$(date +%Y%m%d-%H%M).tar.gz -C /data .
  docker run --rm -v spmb_persistent_uploads:/uploads -v "$(pwd)/backups:/backup" alpine \
    tar czf /backup/spmb-uploads-$(date +%Y%m%d-%H%M).tar.gz -C /uploads .
  ```
- **Update aplikasi tanpa kehilangan data:**
  ```bash
  git pull
  docker compose up -d --build
  ```

---

### B. Instalasi Produksi di Linux (Ubuntu / Debian) dengan Node.js 26

#### 1. Instal Node.js 26 dan Build Tools (untuk `better-sqlite3`)
```bash
sudo apt update
sudo apt install -y curl build-essential python3 git
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # Pastikan tampil v26.x.x
```

#### 2. Instal Dependensi & Build Frontend
```bash
cp .env.example .env
# Edit .env dan ubah JWT_SECRET untuk produksi
nano .env

npm install
npm run build
```

#### 3. Jalankan Mode Produksi
```bash
NODE_ENV=production npm start
```

#### 4. Menjalankan Otomatis sebagai Service (PM2 — Direkomendasikan)
```bash
sudo npm install -g pm2
NODE_ENV=production pm2 start npm --name "spmb-app" -- start
pm2 save
pm2 startup
```

> **Opsional (Reverse Proxy HTTPS):** Gunakan **Nginx** atau **Caddy** untuk meneruskan domain HTTPS (port 80/443) ke `http://127.0.0.1:3000` dengan `client_max_body_size 15M;` agar unggah PDF dan file Excel berjalan lancar.

---

### C. Instalasi Produksi di Windows (Windows 10 / 11 / Windows Server) dengan Node.js 26

#### 1. Instal Prasyarat
- Unduh dan instal **Node.js 26** (Windows Installer `.msi`) dari [https://nodejs.org](https://nodejs.org).
  - Saat proses instalasi, centang opsi **"Automatically install the necessary tools"** (atau pastikan *Visual Studio Build Tools / Desktop development with C++* tersedia jika `better-sqlite3` perlu kompilasi native).
- Verifikasi versi di **PowerShell** atau **Command Prompt**:
  ```powershell
  node -v
  npm -v
  ```

#### 2. Konfigurasi Lingkungan & Build Aplikasi
Buka PowerShell di folder proyek:
```powershell
Copy-Item .env.example .env
notepad .env
```
Ubah `JWT_SECRET` menjadi kode rahasia acak, lalu simpan file `.env`.

Instal dependensi dan build aplikasi produksi:
```powershell
npm install
npm run build
```

#### 3. Jalankan Server Produksi di Windows
Pada **PowerShell**:
```powershell
$env:NODE_ENV="production"
npm start
```
Atau pada **Command Prompt (CMD)**:
```cmd
set NODE_ENV=production
npm start
```

#### 4. Menjalankan di Background pada Windows (PM2)
```powershell
npm install -g pm2
$env:NODE_ENV="production"
pm2 start server.ts --name spmb-app --interpreter node
pm2 save
```

Database akan tersimpan secara otomatis di folder `data\spmb.db` dan file unggahan di folder `uploads\`. Pastikan kedua folder tersebut masuk dalam jadwal backup rutin sekolah.

---

## Pengembangan Lokal (Development)

```bash
npm install
npm run dev
```

Server development (Express + Vite middleware) akan berjalan di `http://localhost:3000`.
