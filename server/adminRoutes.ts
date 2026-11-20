import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import {
  db,
  DEFAULT_LOGO_URL,
  DOCS_UPLOAD_DIR,
  IMAGES_UPLOAD_DIR,
  parseWibAnnouncementTimestamp,
  seedDefaultFormOptions,
  UPLOADS_DIR,
} from './db.ts';
import {
  createAtomicDbSnapshot,
  createAutoSafetyBackup,
  createFullZipBackup,
  deleteServerBackup,
  getMaintenanceSummary,
  getSafeBackupFilePath,
  restoreFromLocalBackup,
  restoreFromUploadedBuffer,
} from './backupService.ts';
import { requireAdminAuth, signAdminToken } from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import {
  streamFormulirPdbPdf,
  streamSuratPemanggilanPdf,
  streamSuratPernyataanDiterimaPdf,
  streamSuratPernyataanPdbPdf,
} from './pdfGenerator.ts';
import type {
  PdfLetterSettings,
  PdfSchoolProfile,
  PdfStudent,
  PdfStudentForm,
  SignerType,
} from './pdfGenerator.ts';

export const adminRouter = Router();

const VALID_OPTION_CATEGORIES = new Set([
  'jenis_kelamin',
  'agama',
  'kewarganegaraan',
  'tinggal_bersama',
  'moda_transportasi',
  'pendidikan',
  'pekerjaan',
  'jarak_sekolah',
]);

// Multer storage for images (logo, kop surat, cap sekolah, ttd kepsek)
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, IMAGES_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format gambar harus PNG, JPG, WEBP, atau SVG.'));
    }
  },
});

// Multer storage for transparent PNG/JPG Cap & TTD (PDFKit compatible)
const stampUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, IMAGES_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format gambar Cap/Tanda Tangan harus PNG (disarankan transparan) atau JPG.'));
    }
  },
});

// Multer storage for PDF documents
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCS_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const base = path
        .basename(file.originalname, path.extname(file.originalname))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 48);
      cb(null, `${base || 'dokumen'}-${Date.now()}.pdf`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      path.extname(file.originalname).toLowerCase() === '.pdf';
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file berformat PDF (.pdf) yang diperbolehkan.'));
    }
  },
});

// Multer memory storage for Excel import
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Multer memory storage for Backup Restore (.zip or .db, up to 100MB)
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.zip' || ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      cb(null, true);
    } else {
      cb(new Error('Format file cadangan harus berupa arsip lengkap (.zip) atau database SQLite (.db).'));
    }
  },
});

function verifyCurrentAdminPassword(userId: number | undefined, password: string): boolean {
  if (!userId || !password) return false;
  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(userId) as { id: number; password_hash: string } | undefined;
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

function safeRemoveUpload(publicUrlPath: string | null | undefined): void {
  if (!publicUrlPath || !publicUrlPath.startsWith('/uploads/')) return;
  const rel = publicUrlPath.replace(/^\/uploads\//, '');
  const full = path.resolve(UPLOADS_DIR, rel);
  if (full.startsWith(UPLOADS_DIR) && fs.existsSync(full)) {
    try {
      fs.unlinkSync(full);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// POST /api/admin/login (unauthenticated)
adminRouter.post('/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const user = db
    .prepare('SELECT id, username, full_name, password_hash FROM users WHERE username = ?')
    .get(username) as
    | { id: number; username: string; full_name: string; password_hash: string }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Username atau password tidak sesuai.' });
    return;
  }

  const token = signAdminToken({
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
    },
  });
});

// Protect all subsequent admin routes
adminRouter.use(requireAdminAuth);

// GET /api/admin/me
adminRouter.get('/me', (req: AuthenticatedRequest, res) => {
  const user = db
    .prepare('SELECT id, username, full_name, created_at FROM users WHERE id = ?')
    .get(req.adminUser?.userId);

  if (!user) {
    res.status(401).json({ error: 'Akun admin tidak ditemukan.' });
    return;
  }

  res.json({ user });
});

// GET /api/admin/dashboard
adminRouter.get('/dashboard', (_req, res) => {
  const totalStudents = (
    db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }
  ).count;
  const acceptedCount = (
    db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'DITERIMA'").get() as {
      count: number;
    }
  ).count;
  const rejectedCount = (
    db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'TIDAK DITERIMA'").get() as {
      count: number;
    }
  ).count;
  const formsSubmittedCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM student_forms sf INNER JOIN students s ON s.id = sf.student_id WHERE s.status = 'DITERIMA'"
      )
      .get() as { count: number }
  ).count;
  const activeDocumentsCount = (
    db.prepare('SELECT COUNT(*) as count FROM documents WHERE is_active = 1').get() as {
      count: number;
    }
  ).count;

  const recentForms = db
    .prepare(
      `SELECT sf.student_id, s.nama_lengkap, s.nisn, s.jalur_pendaftaran, s.asal_sekolah, sf.updated_at
       FROM student_forms sf
       INNER JOIN students s ON s.id = sf.student_id
       ORDER BY sf.updated_at DESC
       LIMIT 8`
    )
    .all();

  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as {
    announcement_date: string;
    announcement_time: string;
  };
  const announcementTimestampMs = parseWibAnnouncementTimestamp(
    profile.announcement_date,
    profile.announcement_time
  );

  res.json({
    stats: {
      total_students: totalStudents,
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      forms_submitted_count: formsSubmittedCount,
      active_documents_count: activeDocumentsCount,
      recent_forms: recentForms,
    },
    profile,
    server_now_ms: Date.now(),
    announcement_timestamp_ms: announcementTimestampMs,
    is_open: Date.now() >= announcementTimestampMs,
  });
});

// ==================== SCHOOL PROFILE ====================

adminRouter.get('/school-profile', (_req, res) => {
  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as {
    announcement_date: string;
    announcement_time: string;
  };
  const announcementTimestampMs = parseWibAnnouncementTimestamp(
    profile.announcement_date,
    profile.announcement_time
  );
  res.json({
    profile,
    server_now_ms: Date.now(),
    announcement_timestamp_ms: announcementTimestampMs,
    is_open: Date.now() >= announcementTimestampMs,
  });
});

adminRouter.put(
  '/school-profile',
  imageUpload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'logo_dinas', maxCount: 1 },
    { name: 'kop_surat', maxCount: 1 },
  ]),
  (req, res) => {
    const existing = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as {
      logo_path: string;
      logo_dinas_path: string;
      kop_surat_path: string;
    };

    const schoolName = String(req.body?.school_name || '').trim();
    const appName = String(req.body?.app_name || '').trim();
    const academicYear = String(req.body?.academic_year || '').trim();
    const announcementDate = String(req.body?.announcement_date || '').trim();
    const announcementTime = String(req.body?.announcement_time || '').trim();
    const skNumber = String(req.body?.sk_number || '').trim();
    const skDetail = String(req.body?.sk_detail || '').trim();
    const kopInstansi = String(req.body?.kop_instansi || '').trim();
    const kopDinas = String(req.body?.kop_dinas || '').trim();
    const kopCabang = String(req.body?.kop_cabang || '').trim();
    const kopAlamat = String(req.body?.kop_alamat || '').trim();
    const kopEmail = String(req.body?.kop_email || '').trim();

    if (!schoolName || !appName || !academicYear || !announcementDate || !announcementTime) {
      res
        .status(400)
        .json({ error: 'Nama sekolah, aplikasi, tahun pelajaran, dan jadwal pengumuman wajib diisi.' });
      return;
    }

    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    let logoPath = existing.logo_path;
    let logoDinasPath = existing.logo_dinas_path || '';
    let kopSuratPath = existing.kop_surat_path;

    if (files.logo?.[0]) {
      safeRemoveUpload(existing.logo_path);
      logoPath = `/uploads/images/${files.logo[0].filename}`;
    } else if (req.body?.reset_logo === 'true') {
      safeRemoveUpload(existing.logo_path);
      logoPath = DEFAULT_LOGO_URL;
    }

    if (files.logo_dinas?.[0]) {
      safeRemoveUpload(existing.logo_dinas_path);
      logoDinasPath = `/uploads/images/${files.logo_dinas[0].filename}`;
    } else if (req.body?.remove_logo_dinas === 'true') {
      safeRemoveUpload(existing.logo_dinas_path);
      logoDinasPath = '';
    }

    if (files.kop_surat?.[0]) {
      safeRemoveUpload(existing.kop_surat_path);
      kopSuratPath = `/uploads/images/${files.kop_surat[0].filename}`;
    } else if (req.body?.remove_kop_surat === 'true') {
      safeRemoveUpload(existing.kop_surat_path);
      kopSuratPath = '';
    }

    db.prepare(
      `UPDATE school_profile SET
        school_name = ?,
        app_name = ?,
        academic_year = ?,
        announcement_date = ?,
        announcement_time = ?,
        sk_number = ?,
        sk_detail = ?,
        kop_instansi = ?,
        kop_dinas = ?,
        kop_cabang = ?,
        kop_alamat = ?,
        kop_email = ?,
        logo_path = ?,
        logo_dinas_path = ?,
        kop_surat_path = ?,
        updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      schoolName,
      appName,
      academicYear,
      announcementDate,
      announcementTime,
      skNumber,
      skDetail,
      kopInstansi,
      kopDinas,
      kopCabang,
      kopAlamat,
      kopEmail,
      logoPath,
      logoDinasPath,
      kopSuratPath
    );

    const updated = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as {
      announcement_date: string;
      announcement_time: string;
    };
    const announcementTimestampMs = parseWibAnnouncementTimestamp(
      updated.announcement_date,
      updated.announcement_time
    );

    res.json({
      message: 'Profil sekolah dan jadwal pengumuman berhasil diperbarui.',
      profile: updated,
      server_now_ms: Date.now(),
      announcement_timestamp_ms: announcementTimestampMs,
      is_open: Date.now() >= announcementTimestampMs,
    });
  }
);

// ==================== LETTER SETTINGS (CAP, TTD, TEMPLATES & PREVIEW) ====================

adminRouter.get('/letter-settings', (_req, res) => {
  const settings = db.prepare('SELECT * FROM letter_settings WHERE id = 1').get();
  res.json({ settings });
});
adminRouter.get('/letter-settings/asset/:type', (req, res) => {
  const type = req.params.type === 'cap' ? 'cap_path' : req.params.type === 'ttd' ? 'ttd_path' : null;
  if (!type) {
    res.status(400).json({ error: 'Jenis aset tidak valid.' });
    return;
  }

  const row = db.prepare(`SELECT ${type} as asset_path FROM letter_settings WHERE id = 1`).get() as
    | { asset_path?: string }
    | undefined;

  if (!row?.asset_path || !row.asset_path.startsWith('/uploads/')) {
    res.status(404).end();
    return;
  }

  const rel = row.asset_path.replace(/^\/uploads\//, '');
  const fullPath = path.resolve(UPLOADS_DIR, rel);
  if (!fullPath.startsWith(UPLOADS_DIR) || !fs.existsSync(fullPath)) {
    res.status(404).end();
    return;
  }

  res.sendFile(fullPath);
});
adminRouter.put(
  '/letter-settings',
  stampUpload.fields([
    { name: 'cap_sekolah', maxCount: 1 },
    { name: 'ttd_kepsek', maxCount: 1 },
  ]),
  (req, res) => {
    const existing = db.prepare('SELECT * FROM letter_settings WHERE id = 1').get() as {
      cap_path: string;
      ttd_path: string;
    };

    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    let capPath = existing.cap_path;
    let ttdPath = existing.ttd_path;

    if (files.cap_sekolah?.[0]) {
      safeRemoveUpload(existing.cap_path);
      capPath = `/uploads/images/${files.cap_sekolah[0].filename}`;
    } else if (req.body?.remove_cap === 'true') {
      safeRemoveUpload(existing.cap_path);
      capPath = '';
    }

    if (files.ttd_kepsek?.[0]) {
      safeRemoveUpload(existing.ttd_path);
      ttdPath = `/uploads/images/${files.ttd_kepsek[0].filename}`;
    } else if (req.body?.remove_ttd === 'true') {
      safeRemoveUpload(existing.ttd_path);
      ttdPath = '';
    }

    const str = (key: string) => String(req.body?.[key] ?? '').trim();
    const numClamp = (key: string, fallback: number, min: number, max: number) => {
      const parsed = Number(req.body?.[key]);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.round(Math.max(min, Math.min(max, parsed)));
    };

    const capX = numClamp('cap_x', -46, -120, 180);
    const capY = numClamp('cap_y', 6, -40, 110);
    const capWidth = numClamp('cap_width', 86, 32, 180);
    const ttdX = numClamp('ttd_x', 0, -100, 180);
    const ttdY = numClamp('ttd_y', 18, -40, 110);
    const ttdWidth = numClamp('ttd_width', 124, 36, 210);

    db.prepare(
      `UPDATE letter_settings SET
        kepsek_nama = ?,
        kepsek_nip = ?,
        cap_path = ?,
        ttd_path = ?,
        cap_x = ?,
        cap_y = ?,
        cap_width = ?,
        ttd_x = ?,
        ttd_y = ?,
        ttd_width = ?,
        diterima_nomor = ?,
        diterima_pembuka = ?,
        diterima_penutup = ?,
        diterima_titimangsa = ?,
        diterima_jabatan = ?,
        pemanggilan_judul = ?,
        pemanggilan_titimangsa = ?,
        pemanggilan_jabatan = ?,
        default_du_hari = ?,
        default_du_tanggal = ?,
        default_du_waktu = ?,
        default_du_ruang = ?,
        pemanggilan_catatan_1 = ?,
        pemanggilan_kelengkapan = ?,
        pemanggilan_catatan_3 = ?,
        pernyataan_pdb_judul = ?,
        pernyataan_pdb_pengantar = ?,
        pernyataan_pdb_isi = ?,
        pernyataan_pdb_penutup = ?,
        pernyataan_pdb_titimangsa = ?,
        pernyataan_pdb_materai = ?,
        updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      str('kepsek_nama'),
      str('kepsek_nip'),
      capPath,
      ttdPath,
      capX,
      capY,
      capWidth,
      ttdX,
      ttdY,
      ttdWidth,
      str('diterima_nomor'),
      str('diterima_pembuka'),
      str('diterima_penutup'),
      str('diterima_titimangsa'),
      str('diterima_jabatan') || 'Kepala,',
      str('pemanggilan_judul'),
      str('pemanggilan_titimangsa'),
      str('pemanggilan_jabatan') || 'Kepala Sekolah,',
      str('default_du_hari'),
      str('default_du_tanggal'),
      str('default_du_waktu'),
      str('default_du_ruang'),
      str('pemanggilan_catatan_1'),
      str('pemanggilan_kelengkapan'),
      str('pemanggilan_catatan_3'),
      str('pernyataan_pdb_judul'),
      str('pernyataan_pdb_pengantar'),
      str('pernyataan_pdb_isi'),
      str('pernyataan_pdb_penutup'),
      str('pernyataan_pdb_titimangsa'),
      str('pernyataan_pdb_materai')
    );

    const updated = db.prepare('SELECT * FROM letter_settings WHERE id = 1').get();
    res.json({
      message: 'Pengaturan template surat, cap sekolah, dan tanda tangan berhasil disimpan.',
      settings: updated,
    });
  }
);

adminRouter.get('/letter-settings/preview/:docType', (req, res) => {
  const docType = String(req.params.docType || '').trim();
  const inline = String(req.query.inline || '') === '1' || String(req.query.inline || '') === 'true';
  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as PdfSchoolProfile;
  const savedSettings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;

  // Optional live query overrides so Admin can preview unsaved drag/resize positions immediately
  const numOverride = (key: string, fallback: number | undefined, min: number, max: number) => {
    const raw = req.query[key];
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.max(min, Math.min(max, parsed)));
  };
  const strOverride = (key: string, fallback: string) => {
    const raw = req.query[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
  };

  const settings: PdfLetterSettings = {
    ...savedSettings,
    cap_x: numOverride('cap_x', savedSettings.cap_x, -120, 180),
    cap_y: numOverride('cap_y', savedSettings.cap_y, -40, 110),
    cap_width: numOverride('cap_width', savedSettings.cap_width, 32, 180),
    ttd_x: numOverride('ttd_x', savedSettings.ttd_x, -100, 180),
    ttd_y: numOverride('ttd_y', savedSettings.ttd_y, -40, 110),
    ttd_width: numOverride('ttd_width', savedSettings.ttd_width, 36, 210),
    kepsek_nama: strOverride('kepsek_nama', savedSettings.kepsek_nama),
    kepsek_nip: strOverride('kepsek_nip', savedSettings.kepsek_nip),
    diterima_titimangsa: strOverride('diterima_titimangsa', savedSettings.diterima_titimangsa),
    diterima_jabatan: strOverride('diterima_jabatan', savedSettings.diterima_jabatan),
    pemanggilan_titimangsa: strOverride('pemanggilan_titimangsa', savedSettings.pemanggilan_titimangsa),
    pemanggilan_jabatan: strOverride('pemanggilan_jabatan', savedSettings.pemanggilan_jabatan),
  };

  const sampleStudent: PdfStudent = {
    no_urut: 'T1-021',
    no_pendaftaran: 'SPMB-2026-0021',
    nama_lengkap: 'ALYSHA BAZLA KALILA',
    nisn: '0101368202',
    asal_sekolah: 'SMPN 1 PANUMBANGAN',
    jalur_pendaftaran: 'JALUR MUTASI',
    status: 'DITERIMA',
    daftar_ulang_hari: settings.default_du_hari,
    daftar_ulang_tanggal: settings.default_du_tanggal,
    daftar_ulang_waktu: settings.default_du_waktu,
    daftar_ulang_ruang: settings.default_du_ruang,
  };

  const sampleForm: PdfStudentForm = {
    nama_lengkap: 'ALYSHA BAZLA KALILA',
    jenis_kelamin: 'Perempuan',
    nis: '23240012',
    nik: '3207076909100001',
    no_kk: '3207070909070095',
    tempat_lahir: 'Ciamis',
    tanggal_lahir: '29-09-2010',
    no_akta_lahir: '8844/2010',
    agama: 'Islam',
    kewarganegaraan: 'Indonesia (WNI)',
    alamat_jalan: 'Dusun Sukasari',
    rt: '04',
    rw: '02',
    dusun: 'Sukasari',
    desa_kelurahan: 'Sukakerta',
    kecamatan: 'Panumbangan',
    kabupaten_kota: 'Kabupaten Ciamis',
    provinsi: 'Jawa Barat',
    kode_pos: '46263',
    tinggal_bersama: 'Bersama Orang Tua',
    moda_transportasi: 'Kendaraan Pribadi',
    anak_ke: '2',
    ayah_nama: 'Yadi Indrawan',
    ayah_tempat_lahir: 'Tangerang',
    ayah_tanggal_lahir: '01-05-1978',
    ayah_pendidikan: 'D4 / S1',
    ayah_pekerjaan: 'PNS / TNI / Polri',
    ibu_nama: 'Nunung Komalasari',
    ibu_tempat_lahir: 'Bandung',
    ibu_tanggal_lahir: '14-11-1980',
    ibu_pendidikan: 'D4 / S1',
    ibu_pekerjaan: 'PNS / TNI / Polri',
    wali_nama: '',
    wali_tempat_lahir: '',
    wali_tanggal_lahir: '',
    wali_pendidikan: '',
    wali_pekerjaan: '',
    no_hp_wa: '082318387148',
    email: 'contoh.siswa@email.com',
    tinggi_badan: '155',
    berat_badan: '48',
    lingkar_kepala: '53',
    jarak_kategori: 'Lebih dari 1 KM',
    jarak_km: '5',
    jumlah_saudara: '1',
    asal_smp: 'SMPN 1 PANUMBANGAN',
    no_seri_ijazah: '121202601359319',
    nilai_tka: '88.5',
    nilai_sem_1: '86.4',
    nilai_sem_2: '87.2',
    nilai_sem_3: '88',
    nilai_sem_4: '89.1',
    nilai_sem_5: '90.3',
    jumlah_nilai: '441',
  };

  if (docType === 'pernyataan-diterima') {
    streamSuratPernyataanDiterimaPdf(res, profile, settings, sampleStudent, inline);
    return;
  }
  if (docType === 'pemanggilan-daftar-ulang') {
    streamSuratPemanggilanPdf(res, profile, settings, sampleStudent, inline);
    return;
  }
  if (docType === 'pernyataan-pdb') {
    streamSuratPernyataanPdbPdf(res, profile, settings, sampleStudent, sampleForm, 'ibu', inline);
    return;
  }
  if (docType === 'formulir-pdb') {
    streamFormulirPdbPdf(res, profile, settings, sampleStudent, sampleForm, 'ibu', inline);
    return;
  }

  res.status(400).json({ error: 'Jenis dokumen pratinjau tidak dikenal.' });
});

// ==================== STUDENTS & EXCEL IMPORT ====================

adminRouter.get('/students', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status =
    typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status === 'DITERIMA' || status === 'TIDAK DITERIMA') {
    conditions.push('s.status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push(
      '(s.nama_lengkap LIKE ? OR s.nisn LIKE ? OR s.no_pendaftaran LIKE ? OR s.asal_sekolah LIKE ? OR s.jalur_pendaftaran LIKE ?)'
    );
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT
        s.*,
        CASE WHEN sf.id IS NOT NULL THEN 1 ELSE 0 END AS has_form,
        CASE WHEN sf.form_pin_hash IS NOT NULL AND sf.form_pin_hash != '' THEN 1 ELSE 0 END AS has_pin,
        sf.updated_at AS form_updated_at
       FROM students s
       LEFT JOIN student_forms sf ON sf.student_id = s.id
       ${whereClause}
       ORDER BY s.id ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  res.json({
    students: rows.map((r) => ({ ...r, has_form: Boolean(r.has_form), has_pin: Boolean(r.has_pin) })),
  });
});

adminRouter.get('/students/template', (_req, res) => {
  const sampleRows = [
    {
      'No Urut': 'T1-004',
      'No Pendaftaran': 'SPMB-2026-0004',
      'Nama Lengkap': 'Nadia Putri Kusuma',
      NISN: '0101388205',
      'Asal Sekolah': 'SMP Negeri 1 Cihaurbeuti',
      'Jalur Pendaftaran': 'Domisili',
      Status: 'DITERIMA',
      'Hari Daftar Ulang': "JUM'AT",
      'Tanggal Daftar Ulang': '26 JUNI 2026',
      'Waktu Daftar Ulang': '08.00-14.00 WIB',
      'Ruang Daftar Ulang': 'RUANG 01',
    },
    {
      'No Urut': 'T1-005',
      'No Pendaftaran': 'SPMB-2026-0005',
      'Nama Lengkap': 'Bagas Setiawan',
      NISN: '0101388206',
      'Asal Sekolah': 'SMP Negeri 3 Cihaurbeuti',
      'Jalur Pendaftaran': 'Prestasi Akademik',
      Status: 'TIDAK DITERIMA',
      'Hari Daftar Ulang': '',
      'Tanggal Daftar Ulang': '',
      'Waktu Daftar Ulang': '',
      'Ruang Daftar Ulang': '',
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 28 },
    { wch: 16 },
    { wch: 28 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Siswa_SPMB');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="Template_Impor_Siswa_SPMB.xlsx"');
  res.send(buffer);
});

adminRouter.post('/students', (req, res) => {
  const noUrut = String(req.body?.no_urut || '').trim();
  const noPendaftaran = String(req.body?.no_pendaftaran || '').trim();
  const namaLengkap = String(req.body?.nama_lengkap || '').trim();
  const nisn = String(req.body?.nisn || '').trim();
  const asalSekolah = String(req.body?.asal_sekolah || '').trim();
  const jalurPendaftaran = String(req.body?.jalur_pendaftaran || '').trim();
  const status = String(req.body?.status || '').trim().toUpperCase();
  const duHari = String(req.body?.daftar_ulang_hari || '').trim();
  const duTanggal = String(req.body?.daftar_ulang_tanggal || '').trim();
  const duWaktu = String(req.body?.daftar_ulang_waktu || '').trim();
  const duRuang = String(req.body?.daftar_ulang_ruang || '').trim();

  if (!noUrut || !noPendaftaran || !namaLengkap || !nisn || !asalSekolah || !jalurPendaftaran) {
    res.status(400).json({ error: 'Seluruh kolom wajib data siswa harus diisi.' });
    return;
  }

  if (status !== 'DITERIMA' && status !== 'TIDAK DITERIMA') {
    res.status(400).json({ error: 'Status harus bernilai DITERIMA atau TIDAK DITERIMA.' });
    return;
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO students (
          no_urut, no_pendaftaran, nama_lengkap, nisn, asal_sekolah, jalur_pendaftaran, status,
          daftar_ulang_hari, daftar_ulang_tanggal, daftar_ulang_waktu, daftar_ulang_ruang
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        noUrut,
        noPendaftaran,
        namaLengkap,
        nisn,
        asalSekolah,
        jalurPendaftaran,
        status,
        duHari,
        duTanggal,
        duWaktu,
        duRuang
      );

    const created = db.prepare('SELECT * FROM students WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Data siswa berhasil ditambahkan.', student: created });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: `NISN "${nisn}" sudah terdaftar pada sistem.` });
      return;
    }
    res.status(500).json({ error: 'Gagal menyimpan data siswa.' });
  }
});

adminRouter.put('/students/:id', (req, res) => {
  const id = Number(req.params.id);
  const noUrut = String(req.body?.no_urut || '').trim();
  const noPendaftaran = String(req.body?.no_pendaftaran || '').trim();
  const namaLengkap = String(req.body?.nama_lengkap || '').trim();
  const nisn = String(req.body?.nisn || '').trim();
  const asalSekolah = String(req.body?.asal_sekolah || '').trim();
  const jalurPendaftaran = String(req.body?.jalur_pendaftaran || '').trim();
  const status = String(req.body?.status || '').trim().toUpperCase();
  const duHari = String(req.body?.daftar_ulang_hari || '').trim();
  const duTanggal = String(req.body?.daftar_ulang_tanggal || '').trim();
  const duWaktu = String(req.body?.daftar_ulang_waktu || '').trim();
  const duRuang = String(req.body?.daftar_ulang_ruang || '').trim();

  if (!noUrut || !noPendaftaran || !namaLengkap || !nisn || !asalSekolah || !jalurPendaftaran) {
    res.status(400).json({ error: 'Seluruh kolom wajib data siswa harus diisi.' });
    return;
  }
  if (status !== 'DITERIMA' && status !== 'TIDAK DITERIMA') {
    res.status(400).json({ error: 'Status harus DITERIMA atau TIDAK DITERIMA.' });
    return;
  }

  try {
    const result = db
      .prepare(
        `UPDATE students SET
          no_urut = ?, no_pendaftaran = ?, nama_lengkap = ?, nisn = ?,
          asal_sekolah = ?, jalur_pendaftaran = ?, status = ?,
          daftar_ulang_hari = ?, daftar_ulang_tanggal = ?, daftar_ulang_waktu = ?, daftar_ulang_ruang = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        noUrut,
        noPendaftaran,
        namaLengkap,
        nisn,
        asalSekolah,
        jalurPendaftaran,
        status,
        duHari,
        duTanggal,
        duWaktu,
        duRuang,
        id
      );

    if (result.changes === 0) {
      res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
      return;
    }
    const updated = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    res.json({ message: 'Data siswa berhasil diperbarui.', student: updated });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: `NISN "${nisn}" sudah digunakan siswa lain.` });
      return;
    }
    res.status(500).json({ error: 'Gagal memperbarui data siswa.' });
  }
});

adminRouter.delete('/students/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM students WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
    return;
  }
  res.json({ message: 'Data siswa berhasil dihapus.' });
});

adminRouter.post('/students/bulk-delete', (req, res) => {
  const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids: number[] = Array.from(
    new Set<number>(
      rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
    )
  );

  if (ids.length === 0) {
    res.status(400).json({ error: 'Pilih minimal satu data siswa untuk dihapus.' });
    return;
  }

  const deleteStmt = db.prepare('DELETE FROM students WHERE id = ?');
  let deletedCount = 0;
  const tx = db.transaction((targetIds: number[]) => {
    for (const id of targetIds) {
      deletedCount += deleteStmt.run(id).changes;
    }
  });
  tx(ids);

  res.json({
    message: `${deletedCount} data siswa (beserta formulir terkait) berhasil dihapus.`,
    deleted_count: deletedCount,
  });
});

adminRouter.post('/students/import', excelUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Silakan unggah file Excel (.xlsx) terlebih dahulu.' });
    return;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      res.status(400).json({ error: 'File Excel kosong atau tidak memiliki lembar kerja.' });
      return;
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'Tidak ada baris data pada file Excel.' });
      return;
    }

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

    const pick = (row: Record<string, unknown>, candidates: string[]): string => {
      for (const [k, v] of Object.entries(row)) {
        if (candidates.includes(normalizeKey(k))) {
          return String(v ?? '').trim();
        }
      }
      return '';
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const findByNisn = db.prepare('SELECT id FROM students WHERE nisn = ?');
    const insertStmt = db.prepare(
      `INSERT INTO students (
        no_urut, no_pendaftaran, nama_lengkap, nisn, asal_sekolah, jalur_pendaftaran, status,
        daftar_ulang_hari, daftar_ulang_tanggal, daftar_ulang_waktu, daftar_ulang_ruang
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStmt = db.prepare(
      `UPDATE students SET
        no_urut = ?, no_pendaftaran = ?, nama_lengkap = ?, asal_sekolah = ?,
        jalur_pendaftaran = ?, status = ?,
        daftar_ulang_hari = ?, daftar_ulang_tanggal = ?, daftar_ulang_waktu = ?, daftar_ulang_ruang = ?,
        updated_at = datetime('now')
       WHERE nisn = ?`
    );

    const runImport = db.transaction(() => {
      rawRows.forEach((row, index) => {
        const lineNum = index + 2;
        const noUrut = pick(row, ['nourut', 'no', 'urut']) || String(index + 1).padStart(3, '0');
        const noPendaftaran = pick(row, [
          'nopendaftaran',
          'nomorpendaftaran',
          'noreg',
          'pendaftaran',
        ]);
        const namaLengkap = pick(row, ['namalengkap', 'nama', 'namasiswa']);
        const nisn = pick(row, ['nisn']);
        const asalSekolah = pick(row, ['asalsekolah', 'asalsmp', 'sekolahasal']);
        const jalurPendaftaran =
          pick(row, ['jalurpendaftaran', 'jalur', 'jalurseleksi']) || 'Umum';
        const rawStatus = pick(row, ['status', 'hasil', 'keterangan', 'kelulusan']).toUpperCase();
        const duHari = pick(row, ['haridaftarulang', 'daftarulanghari', 'hari']);
        const duTanggal = pick(row, ['tanggaldaftarulang', 'daftarulangtanggal', 'tanggal']);
        const duWaktu = pick(row, ['waktudaftarulang', 'daftarulangwaktu', 'waktu']);
        const duRuang = pick(row, ['ruangdaftarulang', 'daftarulangruang', 'ruang']);

        let status: 'DITERIMA' | 'TIDAK DITERIMA' | '' = '';
        if (rawStatus === 'DITERIMA' || rawStatus === 'LULUS') {
          status = 'DITERIMA';
        } else if (
          rawStatus === 'TIDAK DITERIMA' ||
          rawStatus === 'TIDAK LULUS' ||
          rawStatus === 'DITOLAK'
        ) {
          status = 'TIDAK DITERIMA';
        }

        if (!nisn || !namaLengkap || !status) {
          skipped++;
          errors.push(
            `Baris ${lineNum}: kolom wajib (NISN, Nama Lengkap, atau Status DITERIMA/TIDAK DITERIMA) tidak valid.`
          );
          return;
        }

        const existing = findByNisn.get(nisn);
        if (existing) {
          updateStmt.run(
            noUrut,
            noPendaftaran || `SPMB-${nisn}`,
            namaLengkap,
            asalSekolah || '-',
            jalurPendaftaran,
            status,
            duHari,
            duTanggal,
            duWaktu,
            duRuang,
            nisn
          );
          updated++;
        } else {
          insertStmt.run(
            noUrut,
            noPendaftaran || `SPMB-${nisn}`,
            namaLengkap,
            nisn,
            asalSekolah || '-',
            jalurPendaftaran,
            status,
            duHari,
            duTanggal,
            duWaktu,
            duRuang
          );
          inserted++;
        }
      });
    });

    runImport();

    res.json({
      message: `Impor selesai: ${inserted} data baru, ${updated} diperbarui${skipped > 0 ? `, ${skipped} dilewati` : ''}.`,
      summary: { inserted, updated, skipped, errors: errors.slice(0, 10) },
    });
  } catch {
    res.status(400).json({ error: 'Gagal membaca file Excel. Pastikan format file valid (.xlsx).' });
  }
});

// ==================== STUDENT FORMS & EXCEL EXPORT ====================

adminRouter.get('/forms', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const filter =
    typeof req.query.filter === 'string' ? req.query.filter.trim().toUpperCase() : 'ALL';

  const conditions: string[] = ["s.status = 'DITERIMA'"];
  const params: unknown[] = [];

  if (filter === 'SUBMITTED') {
    conditions.push('sf.id IS NOT NULL');
  } else if (filter === 'PENDING') {
    conditions.push('sf.id IS NULL');
  }

  if (search) {
    conditions.push(
      '(s.nama_lengkap LIKE ? OR s.nisn LIKE ? OR s.no_pendaftaran LIKE ? OR s.asal_sekolah LIKE ?)'
    );
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const rows = db
    .prepare(
      `SELECT
        s.id AS student_id,
        s.no_urut,
        s.no_pendaftaran,
        s.nama_lengkap,
        s.nisn,
        s.asal_sekolah,
        s.jalur_pendaftaran,
        CASE WHEN sf.id IS NOT NULL THEN 1 ELSE 0 END AS has_form,
        CASE WHEN sf.form_pin_hash IS NOT NULL AND sf.form_pin_hash != '' THEN 1 ELSE 0 END AS has_pin,
        sf.jenis_kelamin,
        sf.no_hp_wa,
        sf.submitted_at,
        sf.updated_at AS form_updated_at
       FROM students s
       LEFT JOIN student_forms sf ON sf.student_id = s.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY has_form DESC, sf.updated_at DESC, s.id ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  res.json({
    items: rows.map((r) => ({ ...r, has_form: Boolean(r.has_form), has_pin: Boolean(r.has_pin) })),
  });
});

adminRouter.get('/forms/export', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
        s.no_urut, s.no_pendaftaran, s.nisn, s.jalur_pendaftaran,
        s.nama_lengkap AS nama_seleksi, s.asal_sekolah AS asal_sekolah_seleksi,
        sf.*
       FROM students s
       INNER JOIN student_forms sf ON sf.student_id = s.id
       WHERE s.status = 'DITERIMA'
       ORDER BY s.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const exportData = rows.map((r, idx) => ({
    No: idx + 1,
    'No Urut': r.no_urut,
    'No Pendaftaran': r.no_pendaftaran,
    NISN: r.nisn,
    'Jalur Pendaftaran': r.jalur_pendaftaran,
    'Nama Lengkap': r.nama_lengkap,
    'Jenis Kelamin': r.jenis_kelamin,
    NIS: r.nis,
    NIK: r.nik,
    'No Kartu Keluarga': r.no_kk,
    'Tempat Lahir': r.tempat_lahir,
    'Tanggal Lahir': r.tanggal_lahir,
    'No Registrasi Akta Lahir': r.no_akta_lahir,
    Agama: r.agama,
    Kewarganegaraan: r.kewarganegaraan,
    'Alamat Jalan': r.alamat_jalan,
    RT: r.rt,
    RW: r.rw,
    Dusun: r.dusun,
    'Desa / Kelurahan': r.desa_kelurahan,
    Kecamatan: r.kecamatan,
    'Kabupaten / Kota': r.kabupaten_kota || '',
    Provinsi: r.provinsi || '',
    'Kode Pos': r.kode_pos,
    'Tinggal Bersama': r.tinggal_bersama,
    'Moda Transportasi': r.moda_transportasi,
    'Anak Ke': r.anak_ke,
    'Nama Ayah': r.ayah_nama,
    'Tempat Lahir Ayah': r.ayah_tempat_lahir,
    'Tanggal Lahir Ayah': r.ayah_tanggal_lahir,
    'Pendidikan Ayah': r.ayah_pendidikan,
    'Pekerjaan Ayah': r.ayah_pekerjaan,
    'Nama Ibu': r.ibu_nama,
    'Tempat Lahir Ibu': r.ibu_tempat_lahir,
    'Tanggal Lahir Ibu': r.ibu_tanggal_lahir,
    'Pendidikan Ibu': r.ibu_pendidikan,
    'Pekerjaan Ibu': r.ibu_pekerjaan,
    'Nama Wali': r.wali_nama,
    'Tempat Lahir Wali': r.wali_tempat_lahir,
    'Tanggal Lahir Wali': r.wali_tanggal_lahir,
    'Pendidikan Wali': r.wali_pendidikan,
    'Pekerjaan Wali': r.wali_pekerjaan,
    'No HP (WhatsApp)': r.no_hp_wa,
    Email: r.email,
    'Tinggi Badan (cm)': r.tinggi_badan,
    'Berat Badan (kg)': r.berat_badan,
    'Lingkar Kepala (cm)': r.lingkar_kepala,
    'Jarak ke Sekolah': r.jarak_kategori,
    'Detail Jarak (km)': r.jarak_km,
    'Jumlah Saudara Kandung': r.jumlah_saudara,
    'Asal SMP': r.asal_smp,
    'No Seri Ijazah SMP': r.no_seri_ijazah,
    'Nilai TKA': r.nilai_tka || '',
    'Nilai Semester 1': r.nilai_sem_1 || '',
    'Nilai Semester 2': r.nilai_sem_2 || '',
    'Nilai Semester 3': r.nilai_sem_3 || '',
    'Nilai Semester 4': r.nilai_sem_4 || '',
    'Nilai Semester 5': r.nilai_sem_5 || '',
    'Jumlah Nilai (Sem 1-5)': r.jumlah_nilai || '',
    'Waktu Simpan': r.submitted_at,
    'Terakhir Diperbarui': r.updated_at,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    exportData.length > 0
      ? exportData
      : [{ Keterangan: 'Belum ada peserta didik yang mengisi formulir daftar ulang.' }]
  );
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Formulir_SPMB');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Rekap_Formulir_Daftar_Ulang_SPMB_${dateStamp}.xlsx"`
  );
  res.send(buffer);
});

adminRouter.post('/forms/bulk-delete', (req, res) => {
  const rawIds: unknown[] = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  const studentIds: number[] = Array.from(
    new Set<number>(
      rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
    )
  );

  if (studentIds.length === 0) {
    res.status(400).json({ error: 'Pilih minimal satu formulir siswa untuk dihapus.' });
    return;
  }

  const deleteStmt = db.prepare('DELETE FROM student_forms WHERE student_id = ?');
  let deletedCount = 0;
  const tx = db.transaction((targetIds: number[]) => {
    for (const studentId of targetIds) {
      deletedCount += deleteStmt.run(studentId).changes;
    }
  });
  tx(studentIds);

  res.json({
    message: `${deletedCount} data formulir & PIN siswa berhasil dihapus. Data induk siswa tetap dipertahankan.`,
    deleted_count: deletedCount,
  });
});

adminRouter.delete('/forms/:studentId', (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    res.status(400).json({ error: 'ID siswa tidak valid.' });
    return;
  }
  const result = db.prepare('DELETE FROM student_forms WHERE student_id = ?').run(studentId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Data formulir siswa tidak ditemukan.' });
    return;
  }
  res.json({
    message: 'Data formulir & PIN siswa berhasil dihapus. Siswa dapat mengisi ulang formulir dari awal.',
  });
});

adminRouter.get('/forms/:studentId', (req, res) => {
  const studentId = Number(req.params.studentId);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
    return;
  }
  const rawForm = db.prepare('SELECT * FROM student_forms WHERE student_id = ?').get(studentId) as
    | (Record<string, unknown> & { form_pin_hash?: string })
    | undefined;
  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get();

  let form: Record<string, unknown> | null = null;
  let hasPin = false;
  if (rawForm) {
    hasPin = Boolean(rawForm.form_pin_hash && String(rawForm.form_pin_hash).trim());
    const { form_pin_hash: _ignored, ...rest } = rawForm;
    form = rest;
  }

  res.json({ student, form, has_pin: hasPin, profile });
});

// POST /api/admin/students/:studentId/reset-pin (Reset forgotten student PIN)
adminRouter.post('/students/:studentId/reset-pin', (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isFinite(studentId)) {
    res.status(400).json({ error: 'ID siswa tidak valid.' });
    return;
  }

  const student = db
    .prepare('SELECT id, nama_lengkap, nisn FROM students WHERE id = ?')
    .get(studentId) as { id: number; nama_lengkap: string; nisn: string } | undefined;

  if (!student) {
    res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
    return;
  }

  const form = db
    .prepare('SELECT id FROM student_forms WHERE student_id = ?')
    .get(studentId) as { id: number } | undefined;

  if (!form) {
    res.status(400).json({ error: 'Siswa ini belum mengisi formulir sehingga belum memiliki PIN.' });
    return;
  }

  const mode = String(req.body?.mode || 'clear').trim().toLowerCase();

  if (mode === 'temporary') {
    let tempPin = String(req.body?.temporary_pin || '').trim();
    if (!tempPin) {
      tempPin = String(Math.floor(100000 + Math.random() * 900000));
    }
    if (!/^\d{6}$/.test(tempPin)) {
      res.status(400).json({ error: 'PIN sementara harus berupa 6 digit angka.' });
      return;
    }
    const hash = bcrypt.hashSync(tempPin, 10);
    db.prepare(
      "UPDATE student_forms SET form_pin_hash = ?, pin_updated_at = datetime('now') WHERE student_id = ?"
    ).run(hash, studentId);

    res.json({
      message: `PIN sementara 6 digit untuk ${student.nama_lengkap} berhasil ditetapkan.`,
      mode: 'temporary',
      temporary_pin: tempPin,
      has_pin: true,
    });
    return;
  }

  // Default mode: clear PIN so student can create a new 6-digit PIN upon opening their result
  db.prepare(
    "UPDATE student_forms SET form_pin_hash = '', pin_updated_at = datetime('now') WHERE student_id = ?"
  ).run(studentId);

  res.json({
    message: `PIN keamanan ${student.nama_lengkap} berhasil direset. Siswa kini dapat membuat PIN baru saat membuka formulir.`,
    mode: 'clear',
    temporary_pin: null,
    has_pin: false,
  });
});

adminRouter.get('/forms/:studentId/pdf/:docType', (req, res) => {
  const studentId = Number(req.params.studentId);
  const docType = String(req.params.docType || '').trim();
  const signerRaw = String(req.query.signer || 'ayah').toLowerCase();
  const signer: SignerType =
    signerRaw === 'ibu' || signerRaw === 'wali' ? signerRaw : 'ayah';

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as
    | PdfStudent
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Data siswa tidak ditemukan.' });
    return;
  }

  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as PdfSchoolProfile;
  const settings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;

  if (docType === 'pernyataan-diterima') {
    streamSuratPernyataanDiterimaPdf(res, profile, settings, student, false);
    return;
  }
  if (docType === 'pemanggilan-daftar-ulang') {
    streamSuratPemanggilanPdf(res, profile, settings, student, false);
    return;
  }

  const form = db
    .prepare('SELECT * FROM student_forms WHERE student_id = ?')
    .get(studentId) as PdfStudentForm | undefined;
  if (!form) {
    res.status(400).json({ error: 'Siswa belum mengisi formulir daftar ulang.' });
    return;
  }

  if (docType === 'pernyataan-pdb') {
    streamSuratPernyataanPdbPdf(res, profile, settings, student, form, signer, false);
    return;
  }
  if (docType === 'formulir-pdb') {
    streamFormulirPdbPdf(res, profile, settings, student, form, signer, false);
    return;
  }

  res.status(400).json({ error: 'Jenis PDF tidak dikenali.' });
});

// ==================== MASTER FORM OPTIONS ====================

adminRouter.get('/form-options', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const rows = category
    ? db
        .prepare('SELECT * FROM form_options WHERE category = ? ORDER BY sort_order ASC, id ASC')
        .all(category)
    : db
        .prepare('SELECT * FROM form_options ORDER BY category ASC, sort_order ASC, id ASC')
        .all();

  res.json({ options: rows });
});

adminRouter.post('/form-options', (req, res) => {
  const category = String(req.body?.category || '').trim();
  const label = String(req.body?.label || '').trim();
  const isActive = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;

  if (!VALID_OPTION_CATEGORIES.has(category)) {
    res.status(400).json({ error: 'Kategori dropdown tidak valid.' });
    return;
  }
  if (!label) {
    res.status(400).json({ error: 'Label pilihan tidak boleh kosong.' });
    return;
  }

  const maxOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM form_options WHERE category = ?')
    .get(category) as { maxOrder: number };

  try {
    const result = db
      .prepare(
        'INSERT INTO form_options (category, label, is_active, sort_order) VALUES (?, ?, ?, ?)'
      )
      .run(category, label, isActive, maxOrder.maxOrder + 1);

    const created = db
      .prepare('SELECT * FROM form_options WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json({ message: 'Pilihan dropdown berhasil ditambahkan.', option: created });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: `Pilihan "${label}" sudah tersedia pada kategori ini.` });
      return;
    }
    res.status(500).json({ error: 'Gagal menambahkan pilihan dropdown.' });
  }
});

adminRouter.put('/form-options/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM form_options WHERE id = ?').get(id) as
    | { id: number; label: string; is_active: number; sort_order: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Pilihan dropdown tidak ditemukan.' });
    return;
  }

  const label =
    req.body?.label !== undefined ? String(req.body.label).trim() : existing.label;
  const isActive =
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  const sortOrder =
    req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order;

  if (!label) {
    res.status(400).json({ error: 'Label pilihan tidak boleh kosong.' });
    return;
  }

  try {
    db.prepare('UPDATE form_options SET label = ?, is_active = ?, sort_order = ? WHERE id = ?').run(
      label,
      isActive,
      Number.isFinite(sortOrder) ? sortOrder : existing.sort_order,
      id
    );

    const updated = db.prepare('SELECT * FROM form_options WHERE id = ?').get(id);
    res.json({ message: 'Pilihan dropdown berhasil diperbarui.', option: updated });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: `Pilihan "${label}" sudah ada pada kategori ini.` });
      return;
    }
    res.status(500).json({ error: 'Gagal memperbarui pilihan dropdown.' });
  }
});

adminRouter.delete('/form-options/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM form_options WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Pilihan dropdown tidak ditemukan.' });
    return;
  }
  res.json({ message: 'Pilihan dropdown berhasil dihapus.' });
});

// ==================== EXTRA DOCUMENTS (PDF) ====================

adminRouter.get('/documents', (_req, res) => {
  const docs = db.prepare('SELECT * FROM documents ORDER BY id DESC').all();
  res.json({ documents: docs });
});

adminRouter.post('/documents', pdfUpload.single('file'), (req, res) => {
  const title = String(req.body?.title || '').trim();
  const isActive = req.body?.is_active === 'false' || req.body?.is_active === '0' ? 0 : 1;

  if (!title) {
    if (req.file) safeRemoveUpload(`/uploads/documents/${req.file.filename}`);
    res.status(400).json({ error: 'Judul dokumen wajib diisi.' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Silakan pilih file PDF untuk diunggah.' });
    return;
  }

  const filePath = `/uploads/documents/${req.file.filename}`;
  const result = db
    .prepare(
      'INSERT INTO documents (title, file_name, file_path, file_size, is_active) VALUES (?, ?, ?, ?, ?)'
    )
    .run(title, req.file.originalname, filePath, req.file.size, isActive);

  const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Dokumen PDF berhasil diunggah.', document: created });
});

adminRouter.put('/documents/:id', pdfUpload.single('file'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | {
        id: number;
        title: string;
        file_name: string;
        file_path: string;
        file_size: number;
        is_active: number;
      }
    | undefined;

  if (!existing) {
    if (req.file) safeRemoveUpload(`/uploads/documents/${req.file.filename}`);
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
  const isActive =
    req.body?.is_active !== undefined
      ? req.body.is_active === true ||
        req.body.is_active === 'true' ||
        req.body.is_active === 1 ||
        req.body.is_active === '1'
        ? 1
        : 0
      : existing.is_active;

  if (!title) {
    if (req.file) safeRemoveUpload(`/uploads/documents/${req.file.filename}`);
    res.status(400).json({ error: 'Judul dokumen tidak boleh kosong.' });
    return;
  }

  let fileName = existing.file_name;
  let filePath = existing.file_path;
  let fileSize = existing.file_size;

  if (req.file) {
    safeRemoveUpload(existing.file_path);
    fileName = req.file.originalname;
    filePath = `/uploads/documents/${req.file.filename}`;
    fileSize = req.file.size;
  }

  db.prepare(
    'UPDATE documents SET title = ?, file_name = ?, file_path = ?, file_size = ?, is_active = ? WHERE id = ?'
  ).run(title, fileName, filePath, fileSize, isActive, id);

  const updated = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  res.json({ message: 'Dokumen berhasil diperbarui.', document: updated });
});

adminRouter.delete('/documents/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, file_path FROM documents WHERE id = ?')
    .get(id) as { id: number; file_path: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  safeRemoveUpload(existing.file_path);
  res.json({ message: 'Dokumen berhasil dihapus.' });
});

adminRouter.get('/documents/:id/download', (req, res) => {
  const id = Number(req.params.id);
  const doc = db
    .prepare('SELECT id, file_name, file_path FROM documents WHERE id = ?')
    .get(id) as { id: number; file_name: string; file_path: string } | undefined;

  if (!doc) {
    res.status(404).json({ error: 'Dokumen tidak ditemukan.' });
    return;
  }

  const relativePath = doc.file_path.replace(/^\/uploads\//, '');
  const fullPath = path.resolve(UPLOADS_DIR, relativePath);
  if (!fullPath.startsWith(UPLOADS_DIR) || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas PDF tidak ditemukan di server.' });
    return;
  }

  const safeDownloadName = doc.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeDownloadName}"`);
  fs.createReadStream(fullPath).pipe(res);
});

// ==================== ADMIN USERS ====================

adminRouter.get('/users', (_req, res) => {
  const users = db
    .prepare('SELECT id, username, full_name, created_at FROM users ORDER BY id ASC')
    .all();
  res.json({ users });
});

adminRouter.post('/users', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const fullName = String(req.body?.full_name || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !fullName || !password) {
    res.status(400).json({ error: 'Username, nama lengkap, dan password wajib diisi.' });
    return;
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    res.status(400).json({
      error:
        'Username hanya boleh berisi huruf kecil, angka, titik, strip, atau underscore (3–32 karakter).',
    });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password minimal terdiri dari 6 karakter.' });
    return;
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare('INSERT INTO users (username, full_name, password_hash) VALUES (?, ?, ?)')
      .run(username, fullName, hash);

    const created = db
      .prepare('SELECT id, username, full_name, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json({ message: 'Akun admin baru berhasil ditambahkan.', user: created });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: `Username "${username}" sudah digunakan.` });
      return;
    }
    res.status(500).json({ error: 'Gagal menambahkan akun admin.' });
  }
});

adminRouter.delete('/users/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (req.adminUser?.userId === id) {
    res.status(400).json({ error: 'Anda tidak dapat menghapus akun yang sedang digunakan.' });
    return;
  }

  const count = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (count <= 1) {
    res.status(400).json({ error: 'Minimal harus terdapat satu akun administrator aktif.' });
    return;
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Akun admin tidak ditemukan.' });
    return;
  }
  res.json({ message: 'Akun admin berhasil dihapus.' });
});

adminRouter.put('/me/password', (req: AuthenticatedRequest, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Password saat ini dan password baru wajib diisi.' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'Password baru minimal terdiri dari 6 karakter.' });
    return;
  }

  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(req.adminUser?.userId) as { id: number; password_hash: string } | undefined;

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: 'Password saat ini tidak sesuai.' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  res.json({ message: 'Password berhasil diperbarui.' });
});

// ==================== BACKUP, RESTORE & TAHUN PELAJARAN BARU ====================

adminRouter.get('/maintenance/summary', (_req, res) => {
  try {
    const summary = getMaintenanceSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memuat ringkasan pemeliharaan sistem.',
    });
  }
});

adminRouter.get('/maintenance/backup', async (req: AuthenticatedRequest, res) => {
  const format = String(req.query.format || 'zip').toLowerCase() === 'db' ? 'db' : 'zip';
  const dateStamp = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spmb-dl-backup-'));

  try {
    if (format === 'db') {
      const dbOut = path.join(tmpDir, `Backup_SPMB_Database_${dateStamp}.db`);
      await createAtomicDbSnapshot(dbOut);
      const buffer = fs.readFileSync(dbOut);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Backup_SPMB_Database_${dateStamp}.db"`
      );
      res.send(buffer);
    } else {
      const zipOut = path.join(tmpDir, `Backup_SPMB_Lengkap_${dateStamp}.zip`);
      await createFullZipBackup(zipOut, 'manual', req.adminUser?.username || 'admin');
      const buffer = fs.readFileSync(zipOut);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Backup_SPMB_Lengkap_${dateStamp}.zip"`
      );
      res.send(buffer);
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal membuat file backup database.',
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
});

adminRouter.post('/maintenance/snapshot', async (req: AuthenticatedRequest, res) => {
  try {
    const backup = await createAutoSafetyBackup('manual', req.adminUser?.username || 'admin');
    res.status(201).json({
      message: 'Snapshot lengkap (.zip) berhasil disimpan di server.',
      backup,
      summary: getMaintenanceSummary(),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menyimpan snapshot ke server.',
    });
  }
});

adminRouter.get('/maintenance/backups/:filename', (req, res) => {
  const filename = String(req.params.filename || '').trim();
  const fullPath = getSafeBackupFilePath(filename);
  if (!fullPath) {
    res.status(404).json({ error: 'File arsip backup tidak ditemukan.' });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fullPath)}"`);
  fs.createReadStream(fullPath).pipe(res);
});

adminRouter.delete('/maintenance/backups/:filename', (req, res) => {
  const filename = String(req.params.filename || '').trim();
  const deleted = deleteServerBackup(filename);
  if (!deleted) {
    res.status(404).json({ error: 'File arsip backup tidak ditemukan.' });
    return;
  }
  res.json({
    message: `Arsip "${filename}" berhasil dihapus dari server.`,
    summary: getMaintenanceSummary(),
  });
});

adminRouter.post('/maintenance/restore', (req: AuthenticatedRequest, res) => {
  backupUpload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      res.status(400).json({
        error: uploadErr instanceof Error ? uploadErr.message : 'Gagal mengunggah file cadangan.',
      });
      return;
    }

    const password = String(req.body?.password || '');
    if (!verifyCurrentAdminPassword(req.adminUser?.userId, password)) {
      res.status(401).json({ error: 'Kata sandi administrator tidak sesuai.' });
      return;
    }

    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Silakan pilih file backup (.zip atau .db) terlebih dahulu.' });
      return;
    }

    try {
      const result = await restoreFromUploadedBuffer(
        req.file.buffer,
        req.file.originalname,
        req.adminUser?.username || 'admin'
      );
      const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get();
      res.json({
        message:
          result.format === 'zip'
            ? 'Database dan seluruh aset unggahan berhasil dipulihkan. Auto-backup kondisi sebelumnya tersimpan aman di server.'
            : 'Database SQLite (.db) berhasil dipulihkan. Auto-backup kondisi sebelumnya tersimpan aman di server.',
        ...result,
        profile,
        summary: getMaintenanceSummary(),
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gagal memulihkan database dari file backup.',
      });
    }
  });
});

adminRouter.post('/maintenance/restore-local', async (req: AuthenticatedRequest, res) => {
  const filename = String(req.body?.filename || '').trim();
  const password = String(req.body?.password || '');

  if (!filename) {
    res.status(400).json({ error: 'Pilih file arsip backup yang ingin dipulihkan.' });
    return;
  }
  if (!verifyCurrentAdminPassword(req.adminUser?.userId, password)) {
    res.status(401).json({ error: 'Kata sandi administrator tidak sesuai.' });
    return;
  }

  try {
    const result = await restoreFromLocalBackup(filename, req.adminUser?.username || 'admin');
    const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get();
    res.json({
      message: `Arsip "${filename}" berhasil dipulihkan. Auto-backup kondisi sebelumnya tersimpan aman di server.`,
      ...result,
      profile,
      summary: getMaintenanceSummary(),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Gagal memulihkan arsip backup dari server.',
    });
  }
});

adminRouter.post('/maintenance/reset-year', async (req: AuthenticatedRequest, res) => {
  const password = String(req.body?.password || '');
  const clearStudents = Boolean(req.body?.clear_students);
  const clearForms = clearStudents || Boolean(req.body?.clear_forms);
  const clearDocuments = Boolean(req.body?.clear_documents);
  const resetOptions = Boolean(req.body?.reset_options);
  const newAcademicYear = String(req.body?.new_academic_year || '').trim();
  const newSkNumber = String(req.body?.new_sk_number || '').trim();

  if (!verifyCurrentAdminPassword(req.adminUser?.userId, password)) {
    res.status(401).json({ error: 'Kata sandi administrator tidak sesuai.' });
    return;
  }

  if (!clearStudents && !clearForms && !clearDocuments && !resetOptions) {
    res.status(400).json({
      error: 'Pilih minimal satu item data yang ingin dibersihkan untuk memulai Tahun Pelajaran Baru.',
    });
    return;
  }

  try {
    // 1. Mandatory automatic full ZIP backup before clearing any data
    const autoBackup = await createAutoSafetyBackup('pre-reset', req.adminUser?.username || 'admin');

    // 2. Collect document files to remove if requested
    const docFilesToRemove: string[] = [];
    if (clearDocuments) {
      const docs = db.prepare('SELECT file_path FROM documents').all() as Array<{
        file_path: string;
      }>;
      for (const d of docs) {
        if (d.file_path) docFilesToRemove.push(d.file_path);
      }
    }

    // 3. Execute cleanup atomically in a SQLite transaction
    let deletedForms = 0;
    let deletedStudents = 0;
    let deletedDocuments = 0;

    const tx = db.transaction(() => {
      if (clearForms) {
        deletedForms = db.prepare('DELETE FROM student_forms').run().changes;
      }
      if (clearStudents) {
        deletedStudents = db.prepare('DELETE FROM students').run().changes;
      }
      if (clearDocuments) {
        deletedDocuments = db.prepare('DELETE FROM documents').run().changes;
      }
      if (newAcademicYear || newSkNumber) {
        const current = db
          .prepare('SELECT academic_year, sk_number FROM school_profile WHERE id = 1')
          .get() as { academic_year: string; sk_number: string };
        db.prepare(
          `UPDATE school_profile
           SET academic_year = ?, sk_number = ?, updated_at = datetime('now')
           WHERE id = 1`
        ).run(newAcademicYear || current.academic_year, newSkNumber || current.sk_number);
      }
    });
    tx();

    if (resetOptions) {
      seedDefaultFormOptions(true);
    }

    for (const filePath of docFilesToRemove) {
      safeRemoveUpload(filePath);
    }

    const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get();

    res.json({
      message:
        'Reset Tahun Pelajaran Baru berhasil dijalankan. Auto-backup lengkap data sebelumnya telah tersimpan aman di server.',
      auto_backup: autoBackup,
      deleted: {
        students: deletedStudents,
        student_forms: deletedForms,
        documents: deletedDocuments,
        options_reset: resetOptions,
      },
      profile,
      summary: getMaintenanceSummary(),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal menjalankan proses reset tahun pelajaran.',
    });
  }
});
