import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { db, parseWibAnnouncementTimestamp, UPLOADS_DIR } from './db.ts';
import {
  extractBearerOrQueryToken,
  signStudentToken,
  verifyStudentToken,
} from './auth.ts';
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

export const publicRouter = Router();

interface SchoolProfileRow extends PdfSchoolProfile {
  id: number;
  announcement_date: string;
  announcement_time: string;
  updated_at: string;
}

interface StudentRow extends PdfStudent {
  id: number;
}

interface StudentFormDbRow extends PdfStudentForm {
  id: number;
  student_id: number;
  form_pin_hash?: string;
  pin_updated_at?: string | null;
  submitted_at?: string;
  updated_at?: string;
}

// Simple in-memory rate limiter for PIN verification (max 5 failed tries per 10 mins per IP + NISN)
const PIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 5;
const pinAttempts = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(req: Request, nisn: string): string {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip) || 'unknown';
  return `${ip}:${nisn}`;
}

function checkPinRateLimit(key: string): { allowed: boolean; waitMinutes: number } {
  const now = Date.now();
  const entry = pinAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    pinAttempts.delete(key);
    return { allowed: true, waitMinutes: 0 };
  }
  if (entry.count >= PIN_MAX_ATTEMPTS) {
    return { allowed: false, waitMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000)) };
  }
  return { allowed: true, waitMinutes: 0 };
}

function recordPinFailure(key: string): number {
  const now = Date.now();
  const existing = pinAttempts.get(key);
  if (!existing || now > existing.resetAt) {
    pinAttempts.set(key, { count: 1, resetAt: now + PIN_RATE_LIMIT_WINDOW_MS });
    return PIN_MAX_ATTEMPTS - 1;
  }
  existing.count += 1;
  return Math.max(0, PIN_MAX_ATTEMPTS - existing.count);
}

function clearPinFailures(key: string): void {
  pinAttempts.delete(key);
}

function isValidSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

function sanitizeFormForClient(row: StudentFormDbRow): Record<string, unknown> {
  const { form_pin_hash: _ignored, ...rest } = row;
  return {
    ...rest,
    tanggal_lahir: normalizeDdMmYyyy(String(rest.tanggal_lahir || '')),
    ayah_tanggal_lahir: normalizeDdMmYyyy(String(rest.ayah_tanggal_lahir || '')),
    ibu_tanggal_lahir: normalizeDdMmYyyy(String(rest.ibu_tanggal_lahir || '')),
    wali_tanggal_lahir: normalizeDdMmYyyy(String(rest.wali_tanggal_lahir || '')),
  };
}

function requireValidStudentSession(req: Request, studentId: number, nisn: string): boolean {
  const token = extractBearerOrQueryToken(req, 'st');
  if (!token) return false;
  const payload = verifyStudentToken(token);
  if (!payload) return false;
  return payload.studentId === studentId && payload.nisn === nisn;
}

function getAnnouncementState(): {
  profile: SchoolProfileRow;
  serverNowMs: number;
  announcementTimestampMs: number;
  isOpen: boolean;
} {
  const profile = db.prepare('SELECT * FROM school_profile WHERE id = 1').get() as SchoolProfileRow;
  const serverNowMs = Date.now();
  const announcementTimestampMs = parseWibAnnouncementTimestamp(
    profile.announcement_date,
    profile.announcement_time
  );
  return {
    profile,
    serverNowMs,
    announcementTimestampMs,
    isOpen: serverNowMs >= announcementTimestampMs,
  };
}

function normalizeDdMmYyyy(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const id = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (id) return `${id[1]}-${id[2]}-${id[3]}`;
  return s;
}

function isValidDdMmYyyy(raw: string): boolean {
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function parseSigner(raw: unknown): SignerType {
  const s = String(raw || 'ayah').toLowerCase().trim();
  if (s === 'ibu' || s === 'wali') return s;
  return 'ayah';
}

// GET /api/public/config
publicRouter.get('/config', (_req, res) => {
  const { profile, serverNowMs, announcementTimestampMs, isOpen } = getAnnouncementState();
  res.json({
    profile,
    server_now_ms: serverNowMs,
    announcement_timestamp_ms: announcementTimestampMs,
    is_open: isOpen,
  });
});

// POST /api/public/check-nisn
publicRouter.post('/check-nisn', (req, res) => {
  const { isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman hasil seleksi belum dibuka sesuai jadwal.' });
    return;
  }

  const rawNisn = typeof req.body?.nisn === 'string' ? req.body.nisn.trim() : '';
  if (!rawNisn) {
    res.status(400).json({ error: 'Mohon masukkan NISN Anda terlebih dahulu.' });
    return;
  }

  const student = db
    .prepare(
      `SELECT id, no_urut, no_pendaftaran, nama_lengkap, nisn, asal_sekolah, jalur_pendaftaran, status,
              daftar_ulang_hari, daftar_ulang_tanggal, daftar_ulang_waktu, daftar_ulang_ruang
       FROM students WHERE nisn = ?`
    )
    .get(rawNisn) as StudentRow | undefined;

  if (!student) {
    res.status(404).json({
      error: `Data dengan NISN "${rawNisn}" tidak ditemukan. Periksa kembali nomor NISN Anda.`,
    });
    return;
  }

  if (student.status !== 'DITERIMA') {
    res.json({
      student,
      has_form: false,
      has_pin: false,
      form_updated_at: null,
      form_signers: null,
      documents: [],
    });
    return;
  }

  const existingForm = db
    .prepare(
      'SELECT id, updated_at, ayah_nama, ibu_nama, wali_nama, form_pin_hash FROM student_forms WHERE student_id = ?'
    )
    .get(student.id) as
    | {
        id: number;
        updated_at: string;
        ayah_nama: string;
        ibu_nama: string;
        wali_nama: string;
        form_pin_hash: string;
      }
    | undefined;

  const documents = db
    .prepare(
      'SELECT id, title, file_name, file_path, file_size, is_active, created_at FROM documents WHERE is_active = 1 ORDER BY id ASC'
    )
    .all();

  const hasForm = Boolean(existingForm);
  const hasPin = Boolean(existingForm?.form_pin_hash && existingForm.form_pin_hash.trim());

  // Only reveal parent/guardian signer names if the request carries a valid student session token
  const sessionValid = hasForm && requireValidStudentSession(req, student.id, student.nisn);

  res.json({
    student,
    has_form: hasForm,
    has_pin: hasPin,
    form_updated_at: existingForm?.updated_at ?? null,
    form_signers:
      sessionValid && existingForm
        ? {
            ayah_nama: existingForm.ayah_nama || '',
            ibu_nama: existingForm.ibu_nama || '',
            wali_nama: existingForm.wali_nama || '',
          }
        : null,
    documents,
  });
});

// POST /api/public/verify-pin (Verify student's 6-digit PIN and issue short-lived student JWT)
publicRouter.post('/verify-pin', (req, res) => {
  const { isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman hasil seleksi belum dibuka.' });
    return;
  }

  const nisn = typeof req.body?.nisn === 'string' ? req.body.nisn.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

  if (!nisn || !isValidSixDigitPin(pin)) {
    res.status(400).json({ error: 'Masukkan 6 digit angka PIN keamanan Anda.' });
    return;
  }

  const rateKey = getRateLimitKey(req, nisn);
  const rateCheck = checkPinRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${rateCheck.waitMinutes} menit atau hubungi panitia untuk reset PIN.`,
    });
    return;
  }

  const student = db
    .prepare('SELECT id, nisn, status FROM students WHERE nisn = ?')
    .get(nisn) as { id: number; nisn: string; status: string } | undefined;

  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Data peserta didik tidak ditemukan.' });
    return;
  }

  const form = db
    .prepare(
      'SELECT id, ayah_nama, ibu_nama, wali_nama, form_pin_hash FROM student_forms WHERE student_id = ?'
    )
    .get(student.id) as
    | {
        id: number;
        ayah_nama: string;
        ibu_nama: string;
        wali_nama: string;
        form_pin_hash: string;
      }
    | undefined;

  if (!form || !form.form_pin_hash) {
    res.status(400).json({
      error: 'PIN keamanan belum diatur atau telah direset oleh panitia. Silakan buat PIN baru.',
    });
    return;
  }

  if (!bcrypt.compareSync(pin, form.form_pin_hash)) {
    const remaining = recordPinFailure(rateKey);
    res.status(401).json({
      error:
        remaining > 0
          ? `PIN keamanan tidak sesuai. Sisa percobaan: ${remaining} kali.`
          : 'PIN salah berulang kali. Akses dibatasi sementara selama 10 menit. Hubungi panitia jika lupa PIN.',
    });
    return;
  }

  clearPinFailures(rateKey);
  const studentToken = signStudentToken(student.id, student.nisn);

  res.json({
    message: 'PIN berhasil diverifikasi.',
    student_token: studentToken,
    form_signers: {
      ayah_nama: form.ayah_nama || '',
      ibu_nama: form.ibu_nama || '',
      wali_nama: form.wali_nama || '',
    },
  });
});

// POST /api/public/set-pin (For students whose PIN was cleared/reset by Admin, or legacy form without PIN)
publicRouter.post('/set-pin', (req, res) => {
  const { isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman hasil seleksi belum dibuka.' });
    return;
  }

  const nisn = typeof req.body?.nisn === 'string' ? req.body.nisn.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

  if (!nisn || !isValidSixDigitPin(pin)) {
    res.status(400).json({ error: 'PIN keamanan harus terdiri dari tepat 6 digit angka.' });
    return;
  }

  const student = db
    .prepare('SELECT id, nisn, status FROM students WHERE nisn = ?')
    .get(nisn) as { id: number; nisn: string; status: string } | undefined;

  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Data peserta didik diterima tidak ditemukan.' });
    return;
  }

  const form = db
    .prepare(
      'SELECT id, ayah_nama, ibu_nama, wali_nama, form_pin_hash FROM student_forms WHERE student_id = ?'
    )
    .get(student.id) as
    | {
        id: number;
        ayah_nama: string;
        ibu_nama: string;
        wali_nama: string;
        form_pin_hash: string;
      }
    | undefined;

  if (!form) {
    res.status(400).json({ error: 'Formulir daftar ulang belum diisi.' });
    return;
  }

  if (form.form_pin_hash && form.form_pin_hash.trim()) {
    res.status(403).json({
      error: 'PIN keamanan sudah aktif. Masukkan PIN Anda atau hubungi panitia untuk reset PIN.',
    });
    return;
  }

  const hash = bcrypt.hashSync(pin, 10);
  db.prepare(
    "UPDATE student_forms SET form_pin_hash = ?, pin_updated_at = datetime('now') WHERE student_id = ?"
  ).run(hash, student.id);

  const studentToken = signStudentToken(student.id, student.nisn);

  res.json({
    message: 'PIN keamanan baru berhasil dibuat dan diaktifkan.',
    student_token: studentToken,
    form_signers: {
      ayah_nama: form.ayah_nama || '',
      ibu_nama: form.ibu_nama || '',
      wali_nama: form.wali_nama || '',
    },
  });
});

// GET /api/public/form-options
publicRouter.get('/form-options', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT id, category, label, is_active, sort_order FROM form_options WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    )
    .all() as Array<{
    id: number;
    category: string;
    label: string;
    is_active: number;
    sort_order: number;
  }>;

  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    if (!grouped[row.category]) {
      grouped[row.category] = [];
    }
    grouped[row.category].push(row.label);
  }

  res.json({ options: grouped, items: rows });
});

// GET /api/public/student-form/:nisn
publicRouter.get('/student-form/:nisn', (req, res) => {
  const { isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman hasil seleksi belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const student = db
    .prepare(
      'SELECT id, no_urut, no_pendaftaran, nama_lengkap, nisn, asal_sekolah, jalur_pendaftaran, status FROM students WHERE nisn = ?'
    )
    .get(nisn) as StudentRow | undefined;

  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Data siswa diterima tidak ditemukan.' });
    return;
  }

  const form = db.prepare('SELECT * FROM student_forms WHERE student_id = ?').get(student.id) as
    | StudentFormDbRow
    | undefined;

  if (form) {
    if (!requireValidStudentSession(req, student.id, student.nisn)) {
      res.status(401).json({
        error: 'Akses formulir dilindungi PIN keamanan. Silakan verifikasi PIN Anda terlebih dahulu.',
        requires_pin: true,
      });
      return;
    }
    res.json({
      student,
      form: sanitizeFormForClient(form),
      has_pin: Boolean(form.form_pin_hash),
    });
    return;
  }

  res.json({ student, form: null, has_pin: false });
});

// PUT /api/public/student-form/:nisn
publicRouter.put('/student-form/:nisn', (req, res) => {
  const { isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman hasil seleksi belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const student = db
    .prepare('SELECT id, nisn, nama_lengkap, status FROM students WHERE nisn = ?')
    .get(nisn) as { id: number; nisn: string; nama_lengkap: string; status: string } | undefined;

  if (!student || student.status !== 'DITERIMA') {
    res
      .status(404)
      .json({ error: 'Hanya peserta didik berstatus DITERIMA yang dapat mengisi formulir.' });
    return;
  }

  const existingForm = db
    .prepare('SELECT id, form_pin_hash FROM student_forms WHERE student_id = ?')
    .get(student.id) as { id: number; form_pin_hash: string } | undefined;

  const body = req.body || {};
  const str = (key: string): string =>
    typeof body[key] === 'string' ? body[key].trim() : String(body[key] ?? '').trim();

  let nextPinHash = existingForm?.form_pin_hash || '';
  let pinChanged = false;

  if (existingForm) {
    // Editing existing form requires an active verified PIN session
    if (!requireValidStudentSession(req, student.id, student.nisn)) {
      res.status(401).json({
        error: 'Sesi PIN Anda tidak valid atau telah berakhir. Silakan verifikasi PIN kembali.',
        requires_pin: true,
      });
      return;
    }
    const newPin = str('new_pin');
    if (newPin) {
      if (!isValidSixDigitPin(newPin)) {
        res.status(400).json({ error: 'PIN keamanan baru harus terdiri dari 6 digit angka.' });
        return;
      }
      nextPinHash = bcrypt.hashSync(newPin, 10);
      pinChanged = true;
    }
  } else {
    // First-time submission MUST create a 6-digit PIN
    const pin = str('pin');
    if (!isValidSixDigitPin(pin)) {
      res.status(400).json({
        error: 'Buat PIN keamanan 6 digit angka untuk melindungi data pribadi dan berkas PDF Anda.',
      });
      return;
    }
    nextPinHash = bcrypt.hashSync(pin, 10);
    pinChanged = true;
  }

  const tanggalLahir = normalizeDdMmYyyy(str('tanggal_lahir'));
  const ayahTanggalLahir = normalizeDdMmYyyy(str('ayah_tanggal_lahir'));
  const ibuTanggalLahir = normalizeDdMmYyyy(str('ibu_tanggal_lahir'));
  const waliTanggalLahir = normalizeDdMmYyyy(str('wali_tanggal_lahir'));

  const parseScore = (raw: string): number | null => {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
    return Number(normalized);
  };
  const formatScore = (num: number): string => {
    const rounded = Math.round(num * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
  };

  const requiredFields: Array<[string, string, string]> = [
    ['nama_lengkap', 'Nama Lengkap', str('nama_lengkap')],
    ['jenis_kelamin', 'Jenis Kelamin', str('jenis_kelamin')],
    ['nik', 'NIK', str('nik')],
    ['no_kk', 'Nomor Kartu Keluarga', str('no_kk')],
    ['tempat_lahir', 'Tempat Lahir', str('tempat_lahir')],
    ['tanggal_lahir', 'Tanggal Lahir', tanggalLahir],
    ['agama', 'Agama', str('agama')],
    ['kewarganegaraan', 'Kewarganegaraan', str('kewarganegaraan')],
    ['alamat_jalan', 'Alamat Jalan', str('alamat_jalan')],
    ['rt', 'RT', str('rt')],
    ['rw', 'RW', str('rw')],
    ['desa_kelurahan', 'Desa / Kelurahan', str('desa_kelurahan')],
    ['kecamatan', 'Kecamatan', str('kecamatan')],
    ['kabupaten_kota', 'Kabupaten / Kota', str('kabupaten_kota')],
    ['provinsi', 'Provinsi', str('provinsi')],
    ['kode_pos', 'Kode Pos', str('kode_pos')],
    ['tinggal_bersama', 'Tinggal Bersama', str('tinggal_bersama')],
    ['moda_transportasi', 'Moda Transportasi', str('moda_transportasi')],
    ['anak_ke', 'Anak Ke', str('anak_ke')],
    ['ayah_nama', 'Nama Ayah', str('ayah_nama')],
    ['ayah_tempat_lahir', 'Tempat Lahir Ayah', str('ayah_tempat_lahir')],
    ['ayah_tanggal_lahir', 'Tanggal Lahir Ayah', ayahTanggalLahir],
    ['ayah_pendidikan', 'Pendidikan Ayah', str('ayah_pendidikan')],
    ['ayah_pekerjaan', 'Pekerjaan Ayah', str('ayah_pekerjaan')],
    ['ibu_nama', 'Nama Ibu', str('ibu_nama')],
    ['ibu_tempat_lahir', 'Tempat Lahir Ibu', str('ibu_tempat_lahir')],
    ['ibu_tanggal_lahir', 'Tanggal Lahir Ibu', ibuTanggalLahir],
    ['ibu_pendidikan', 'Pendidikan Ibu', str('ibu_pendidikan')],
    ['ibu_pekerjaan', 'Pekerjaan Ibu', str('ibu_pekerjaan')],
    ['no_hp_wa', 'Nomor HP (WhatsApp)', str('no_hp_wa')],
    ['tinggi_badan', 'Tinggi Badan', str('tinggi_badan')],
    ['berat_badan', 'Berat Badan', str('berat_badan')],
    ['lingkar_kepala', 'Lingkar Kepala', str('lingkar_kepala')],
    ['jarak_kategori', 'Jarak Tempat Tinggal ke Sekolah', str('jarak_kategori')],
    ['jumlah_saudara', 'Jumlah Saudara Kandung', str('jumlah_saudara')],
    ['asal_smp', 'Asal SMP', str('asal_smp')],
    ['nilai_sem_1', 'Nilai Rata-Rata Semester 1', str('nilai_sem_1')],
    ['nilai_sem_2', 'Nilai Rata-Rata Semester 2', str('nilai_sem_2')],
    ['nilai_sem_3', 'Nilai Rata-Rata Semester 3', str('nilai_sem_3')],
    ['nilai_sem_4', 'Nilai Rata-Rata Semester 4', str('nilai_sem_4')],
    ['nilai_sem_5', 'Nilai Rata-Rata Semester 5', str('nilai_sem_5')],
  ];

  const missing = requiredFields.filter(([, , val]) => !val).map(([, label]) => label);
  if (missing.length > 0) {
    res.status(400).json({
      error: `Mohon lengkapi kolom wajib berikut: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` dan ${missing.length - 5} kolom lainnya` : ''}.`,
    });
    return;
  }

  if (!isValidDdMmYyyy(tanggalLahir)) {
    res
      .status(400)
      .json({ error: 'Format Tanggal Lahir Peserta Didik harus dd-mm-yyyy yang valid.' });
    return;
  }
  if (!isValidDdMmYyyy(ayahTanggalLahir)) {
    res.status(400).json({ error: 'Format Tanggal Lahir Ayah harus dd-mm-yyyy yang valid.' });
    return;
  }
  if (!isValidDdMmYyyy(ibuTanggalLahir)) {
    res.status(400).json({ error: 'Format Tanggal Lahir Ibu harus dd-mm-yyyy yang valid.' });
    return;
  }
  if (waliTanggalLahir && !isValidDdMmYyyy(waliTanggalLahir)) {
    res.status(400).json({ error: 'Format Tanggal Lahir Wali harus dd-mm-yyyy yang valid.' });
    return;
  }

  const rawTka = str('nilai_tka');
  const parsedTka = parseScore(rawTka);
  if (rawTka && (parsedTka === null || Number.isNaN(parsedTka) || parsedTka < 0 || parsedTka > 1000)) {
    res.status(400).json({
      error: 'Nilai TKA harus berupa angka yang valid (contoh: 85 atau 85.5).',
    });
    return;
  }
  const normalizedTka = parsedTka !== null && !Number.isNaN(parsedTka) ? formatScore(parsedTka) : '';

  const semKeys = ['nilai_sem_1', 'nilai_sem_2', 'nilai_sem_3', 'nilai_sem_4', 'nilai_sem_5'] as const;
  const normalizedSems: Record<(typeof semKeys)[number], string> = {
    nilai_sem_1: '',
    nilai_sem_2: '',
    nilai_sem_3: '',
    nilai_sem_4: '',
    nilai_sem_5: '',
  };
  let semSum = 0;
  for (let i = 0; i < semKeys.length; i++) {
    const key = semKeys[i];
    const parsed = parseScore(str(key));
    if (parsed === null || Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      res.status(400).json({
        error: `Nilai Rata-Rata Semester ${i + 1} harus berupa angka antara 0 sampai 100 (maks. 2 desimal).`,
      });
      return;
    }
    normalizedSems[key] = formatScore(parsed);
    semSum += parsed;
  }
  const computedJumlahNilai = formatScore(semSum);

  db.prepare(
    `INSERT INTO student_forms (
      student_id,
      nama_lengkap, jenis_kelamin, nis, nik, no_kk, tempat_lahir, tanggal_lahir, no_akta_lahir,
      agama, kewarganegaraan, alamat_jalan, rt, rw, dusun, desa_kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos,
      tinggal_bersama, moda_transportasi, anak_ke,
      ayah_nama, ayah_tempat_lahir, ayah_tanggal_lahir, ayah_pendidikan, ayah_pekerjaan,
      ibu_nama, ibu_tempat_lahir, ibu_tanggal_lahir, ibu_pendidikan, ibu_pekerjaan,
      wali_nama, wali_tempat_lahir, wali_tanggal_lahir, wali_pendidikan, wali_pekerjaan,
      no_hp_wa, email,
      tinggi_badan, berat_badan, lingkar_kepala, jarak_kategori, jarak_km, jumlah_saudara,
      asal_smp, no_seri_ijazah,
      nilai_tka, nilai_sem_1, nilai_sem_2, nilai_sem_3, nilai_sem_4, nilai_sem_5, jumlah_nilai,
      form_pin_hash, pin_updated_at,
      submitted_at, updated_at
    ) VALUES (
      @student_id,
      @nama_lengkap, @jenis_kelamin, @nis, @nik, @no_kk, @tempat_lahir, @tanggal_lahir, @no_akta_lahir,
      @agama, @kewarganegaraan, @alamat_jalan, @rt, @rw, @dusun, @desa_kelurahan, @kecamatan, @kabupaten_kota, @provinsi, @kode_pos,
      @tinggal_bersama, @moda_transportasi, @anak_ke,
      @ayah_nama, @ayah_tempat_lahir, @ayah_tanggal_lahir, @ayah_pendidikan, @ayah_pekerjaan,
      @ibu_nama, @ibu_tempat_lahir, @ibu_tanggal_lahir, @ibu_pendidikan, @ibu_pekerjaan,
      @wali_nama, @wali_tempat_lahir, @wali_tanggal_lahir, @wali_pendidikan, @wali_pekerjaan,
      @no_hp_wa, @email,
      @tinggi_badan, @berat_badan, @lingkar_kepala, @jarak_kategori, @jarak_km, @jumlah_saudara,
      @asal_smp, @no_seri_ijazah,
      @nilai_tka, @nilai_sem_1, @nilai_sem_2, @nilai_sem_3, @nilai_sem_4, @nilai_sem_5, @jumlah_nilai,
      @form_pin_hash, datetime('now'),
      datetime('now'), datetime('now')
    )
    ON CONFLICT(student_id) DO UPDATE SET
      nama_lengkap = excluded.nama_lengkap,
      jenis_kelamin = excluded.jenis_kelamin,
      nis = excluded.nis,
      nik = excluded.nik,
      no_kk = excluded.no_kk,
      tempat_lahir = excluded.tempat_lahir,
      tanggal_lahir = excluded.tanggal_lahir,
      no_akta_lahir = excluded.no_akta_lahir,
      agama = excluded.agama,
      kewarganegaraan = excluded.kewarganegaraan,
      alamat_jalan = excluded.alamat_jalan,
      rt = excluded.rt,
      rw = excluded.rw,
      dusun = excluded.dusun,
      desa_kelurahan = excluded.desa_kelurahan,
      kecamatan = excluded.kecamatan,
      kabupaten_kota = excluded.kabupaten_kota,
      provinsi = excluded.provinsi,
      kode_pos = excluded.kode_pos,
      tinggal_bersama = excluded.tinggal_bersama,
      moda_transportasi = excluded.moda_transportasi,
      anak_ke = excluded.anak_ke,
      ayah_nama = excluded.ayah_nama,
      ayah_tempat_lahir = excluded.ayah_tempat_lahir,
      ayah_tanggal_lahir = excluded.ayah_tanggal_lahir,
      ayah_pendidikan = excluded.ayah_pendidikan,
      ayah_pekerjaan = excluded.ayah_pekerjaan,
      ibu_nama = excluded.ibu_nama,
      ibu_tempat_lahir = excluded.ibu_tempat_lahir,
      ibu_tanggal_lahir = excluded.ibu_tanggal_lahir,
      ibu_pendidikan = excluded.ibu_pendidikan,
      ibu_pekerjaan = excluded.ibu_pekerjaan,
      wali_nama = excluded.wali_nama,
      wali_tempat_lahir = excluded.wali_tempat_lahir,
      wali_tanggal_lahir = excluded.wali_tanggal_lahir,
      wali_pendidikan = excluded.wali_pendidikan,
      wali_pekerjaan = excluded.wali_pekerjaan,
      no_hp_wa = excluded.no_hp_wa,
      email = excluded.email,
      tinggi_badan = excluded.tinggi_badan,
      berat_badan = excluded.berat_badan,
      lingkar_kepala = excluded.lingkar_kepala,
      jarak_kategori = excluded.jarak_kategori,
      jarak_km = excluded.jarak_km,
      jumlah_saudara = excluded.jumlah_saudara,
      asal_smp = excluded.asal_smp,
      no_seri_ijazah = excluded.no_seri_ijazah,
      nilai_tka = excluded.nilai_tka,
      nilai_sem_1 = excluded.nilai_sem_1,
      nilai_sem_2 = excluded.nilai_sem_2,
      nilai_sem_3 = excluded.nilai_sem_3,
      nilai_sem_4 = excluded.nilai_sem_4,
      nilai_sem_5 = excluded.nilai_sem_5,
      jumlah_nilai = excluded.jumlah_nilai,
      form_pin_hash = excluded.form_pin_hash,
      pin_updated_at = CASE WHEN @pin_changed = 1 THEN datetime('now') ELSE student_forms.pin_updated_at END,
      updated_at = datetime('now')`
  ).run({
    student_id: student.id,
    nama_lengkap: str('nama_lengkap'),
    jenis_kelamin: str('jenis_kelamin'),
    nis: str('nis'),
    nik: str('nik'),
    no_kk: str('no_kk'),
    tempat_lahir: str('tempat_lahir'),
    tanggal_lahir: tanggalLahir,
    no_akta_lahir: str('no_akta_lahir'),
    agama: str('agama'),
    kewarganegaraan: str('kewarganegaraan'),
    alamat_jalan: str('alamat_jalan'),
    rt: str('rt'),
    rw: str('rw'),
    dusun: str('dusun'),
    desa_kelurahan: str('desa_kelurahan'),
    kecamatan: str('kecamatan'),
    kabupaten_kota: str('kabupaten_kota'),
    provinsi: str('provinsi'),
    kode_pos: str('kode_pos'),
    tinggal_bersama: str('tinggal_bersama'),
    moda_transportasi: str('moda_transportasi'),
    anak_ke: str('anak_ke'),
    ayah_nama: str('ayah_nama'),
    ayah_tempat_lahir: str('ayah_tempat_lahir'),
    ayah_tanggal_lahir: ayahTanggalLahir,
    ayah_pendidikan: str('ayah_pendidikan'),
    ayah_pekerjaan: str('ayah_pekerjaan'),
    ibu_nama: str('ibu_nama'),
    ibu_tempat_lahir: str('ibu_tempat_lahir'),
    ibu_tanggal_lahir: ibuTanggalLahir,
    ibu_pendidikan: str('ibu_pendidikan'),
    ibu_pekerjaan: str('ibu_pekerjaan'),
    wali_nama: str('wali_nama'),
    wali_tempat_lahir: str('wali_tempat_lahir'),
    wali_tanggal_lahir: waliTanggalLahir,
    wali_pendidikan: str('wali_pendidikan'),
    wali_pekerjaan: str('wali_pekerjaan'),
    no_hp_wa: str('no_hp_wa'),
    email: str('email'),
    tinggi_badan: str('tinggi_badan'),
    berat_badan: str('berat_badan'),
    lingkar_kepala: str('lingkar_kepala'),
    jarak_kategori: str('jarak_kategori'),
    jarak_km: str('jarak_km'),
    jumlah_saudara: str('jumlah_saudara'),
    asal_smp: str('asal_smp'),
    no_seri_ijazah: str('no_seri_ijazah'),
    nilai_tka: normalizedTka,
    nilai_sem_1: normalizedSems.nilai_sem_1,
    nilai_sem_2: normalizedSems.nilai_sem_2,
    nilai_sem_3: normalizedSems.nilai_sem_3,
    nilai_sem_4: normalizedSems.nilai_sem_4,
    nilai_sem_5: normalizedSems.nilai_sem_5,
    jumlah_nilai: computedJumlahNilai,
    form_pin_hash: nextPinHash,
    pin_changed: pinChanged ? 1 : 0,
  });

  const saved = db
    .prepare('SELECT * FROM student_forms WHERE student_id = ?')
    .get(student.id) as StudentFormDbRow;

  const studentToken = signStudentToken(student.id, student.nisn);

  res.json({
    message: existingForm
      ? pinChanged
        ? 'Formulir daftar ulang dan PIN keamanan baru berhasil diperbarui.'
        : 'Formulir daftar ulang berhasil diperbarui.'
      : 'Formulir daftar ulang dan PIN keamanan Anda berhasil disimpan.',
    form: sanitizeFormForClient(saved),
    student_token: studentToken,
    has_pin: Boolean(saved.form_pin_hash),
    form_signers: {
      ayah_nama: saved.ayah_nama || '',
      ibu_nama: saved.ibu_nama || '',
      wali_nama: saved.wali_nama || '',
    },
  });
});

// ==================== DYNAMIC OFFICIAL PDF DOWNLOADS ====================

publicRouter.get('/pdf/:nisn/pernyataan-diterima', (req, res) => {
  const { profile, isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const student = db.prepare('SELECT * FROM students WHERE nisn = ?').get(nisn) as
    | StudentRow
    | undefined;
  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Surat hanya tersedia bagi calon siswa berstatus DITERIMA.' });
    return;
  }

  const settings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;
  streamSuratPernyataanDiterimaPdf(res, profile, settings, student, false);
});

publicRouter.get('/pdf/:nisn/pemanggilan-daftar-ulang', (req, res) => {
  const { profile, isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const student = db.prepare('SELECT * FROM students WHERE nisn = ?').get(nisn) as
    | StudentRow
    | undefined;
  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Surat hanya tersedia bagi calon siswa berstatus DITERIMA.' });
    return;
  }

  const settings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;
  streamSuratPemanggilanPdf(res, profile, settings, student, false);
});

// PIN-protected: Surat Pernyataan Peserta Didik Baru
publicRouter.get('/pdf/:nisn/pernyataan-pdb', (req, res) => {
  const { profile, isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const signer = parseSigner(req.query.signer);
  const student = db.prepare('SELECT * FROM students WHERE nisn = ?').get(nisn) as
    | StudentRow
    | undefined;
  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Data siswa diterima tidak ditemukan.' });
    return;
  }

  if (!requireValidStudentSession(req, student.id, student.nisn)) {
    res.status(401).json({
      error: 'Berkas ini dilindungi PIN keamanan. Silakan verifikasi PIN Anda terlebih dahulu.',
    });
    return;
  }

  const form = db
    .prepare('SELECT * FROM student_forms WHERE student_id = ?')
    .get(student.id) as PdfStudentForm | undefined;
  if (!form) {
    res.status(400).json({ error: 'Silakan lengkapi Formulir Daftar Ulang terlebih dahulu.' });
    return;
  }
  if (signer === 'wali' && !form.wali_nama?.trim()) {
    res.status(400).json({
      error: 'Data Nama Wali belum diisi pada formulir. Pilih Ayah/Ibu atau lengkapi data Wali terlebih dahulu.',
    });
    return;
  }

  const settings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;
  streamSuratPernyataanPdbPdf(res, profile, settings, student, form, signer, false);
});

// PIN-protected: Formulir Peserta Didik Baru
publicRouter.get('/pdf/:nisn/formulir-pdb', (req, res) => {
  const { profile, isOpen } = getAnnouncementState();
  if (!isOpen) {
    res.status(403).json({ error: 'Pengumuman belum dibuka.' });
    return;
  }

  const nisn = String(req.params.nisn || '').trim();
  const signer = parseSigner(req.query.signer);
  const student = db.prepare('SELECT * FROM students WHERE nisn = ?').get(nisn) as
    | StudentRow
    | undefined;
  if (!student || student.status !== 'DITERIMA') {
    res.status(404).json({ error: 'Data siswa diterima tidak ditemukan.' });
    return;
  }

  if (!requireValidStudentSession(req, student.id, student.nisn)) {
    res.status(401).json({
      error: 'Berkas ini dilindungi PIN keamanan. Silakan verifikasi PIN Anda terlebih dahulu.',
    });
    return;
  }

  const form = db
    .prepare('SELECT * FROM student_forms WHERE student_id = ?')
    .get(student.id) as PdfStudentForm | undefined;
  if (!form) {
    res.status(400).json({ error: 'Silakan lengkapi Formulir Daftar Ulang terlebih dahulu.' });
    return;
  }
  if (signer === 'wali' && !form.wali_nama?.trim()) {
    res.status(400).json({
      error: 'Data Nama Wali belum diisi pada formulir. Pilih Ayah/Ibu atau lengkapi data Wali terlebih dahulu.',
    });
    return;
  }

  const settings = db
    .prepare('SELECT * FROM letter_settings WHERE id = 1')
    .get() as PdfLetterSettings;
  streamFormulirPdbPdf(res, profile, settings, student, form, signer, false);
});

// ==================== EXTRA UPLOADED PDF DOCUMENTS ====================

// GET /api/public/documents/:id/download
publicRouter.get('/documents/:id/download', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID dokumen tidak valid.' });
    return;
  }

  const doc = db
    .prepare('SELECT id, title, file_name, file_path, is_active FROM documents WHERE id = ? AND is_active = 1')
    .get(id) as
    | { id: number; title: string; file_name: string; file_path: string; is_active: number }
    | undefined;

  if (!doc) {
    res.status(404).json({ error: 'Dokumen tidak ditemukan atau sedang nonaktif.' });
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
  res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
  fs.createReadStream(fullPath).pipe(res);
});
