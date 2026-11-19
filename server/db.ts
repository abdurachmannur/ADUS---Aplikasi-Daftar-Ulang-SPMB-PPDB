import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
export const DATA_DIR = path.resolve(
  ROOT_DIR,
  process.env.SQLITE_DB_PATH ? path.dirname(process.env.SQLITE_DB_PATH) : 'data'
);
export const DB_PATH = path.resolve(ROOT_DIR, process.env.SQLITE_DB_PATH || 'data/spmb.db');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
export const UPLOADS_DIR = path.resolve(ROOT_DIR, process.env.UPLOADS_DIR || 'uploads');
export const IMAGES_UPLOAD_DIR = path.join(UPLOADS_DIR, 'images');
export const DOCS_UPLOAD_DIR = path.join(UPLOADS_DIR, 'documents');

export const DEFAULT_LOGO_URL = '/src/assets/images/crest_sman1_cihaurbeuti_1795062487183.jpg';

export function ensureStorageDirectories(): void {
  for (const dir of [DATA_DIR, BACKUPS_DIR, UPLOADS_DIR, IMAGES_UPLOAD_DIR, DOCS_UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

ensureStorageDirectories();

function createDbConnection(): Database.Database {
  const instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}

let activeDb: Database.Database = createDbConnection();

export function getDbInstance(): Database.Database {
  return activeDb;
}

export function closeDatabase(): void {
  if (activeDb && activeDb.open) {
    try {
      activeDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore checkpoint errors if database is already closing
    }
    activeDb.close();
  }
}

export function reopenDatabase(): Database.Database {
  closeDatabase();
  ensureStorageDirectories();
  activeDb = createDbConnection();
  return activeDb;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const value = Reflect.get(activeDb, prop, activeDb);
    return typeof value === 'function' ? value.bind(activeDb) : value;
  },
  set(_target, prop, value) {
    return Reflect.set(activeDb, prop, value, activeDb);
  },
});

/**
 * Formats a JS Date into WIB (UTC+7) YYYY-MM-DD and HH:mm strings.
 */
function getWibDateAndTime(targetDate: Date): { date: string; time: string } {
  const wibMs = targetDate.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  const hours = String(wib.getUTCHours()).padStart(2, '0');
  const minutes = String(wib.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

export function parseWibAnnouncementTimestamp(dateStr: string, timeStr: string): number {
  const normalizedTime = timeStr && timeStr.length === 5 ? `${timeStr}:00` : timeStr || '00:00:00';
  const iso = `${dateStr}T${normalizedTime}+07:00`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function ensureColumn(tableName: string, columnName: string, columnDef: string): void {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

const DEFAULT_SK_DETAIL =
  'Berdasarkan Keputusan Kepala SMA Negeri 1 Cihaurbeuti Nomor 1244/PK.07.02/SMAN1CHRBT tentang Penetapan Hasil Seleksi Penerimaan Murid Baru Tahap 1 Jalur Prestasi dan Mutasi Dinas Pendidikan Provinsi Jawa Barat Tahun Pelajaran 2026/2027, dengan ini menerangkan bahwa :';

const DEFAULT_PEMANGGILAN_KELENGKAPAN = [
  'a. Hasil Seleksi/Diterima PCMB dan SPMB 2026 diunduh pada web (spmb.jabarprov.go.id menggunakan akun siswa)',
  'b. Surat Pernyataan Diterima di SMA Negeri 1 Cihaurbeuti;',
  'c. Surat Pemanggilan Daftar Ulang',
  'd. Formulir Identitas Murid Baru',
  'e. Surat Pernyataan Murid Baru',
  '   (Point B,C,D,E, Diinput secara online pada portal SPMB kemudian diunduh dan dicetak serta ditandatangani)',
  'f. FC Ijazah/Surat Keterangan Lulus dari SMP/MTs',
  'g. FC Akta Kelahiran',
  'h. FC Kartu Keluarga',
  'i. FC KTP Orang Tua',
  'j. FC Rapor Semester 1-5',
  'k. Surat Pertanggungjawaban Mutlak Orangtua',
  'l. Persyaratan Khusus Sesuai Jalur',
  '   1. FC Sertifikat Kejuaraan sesuai yang diunggah (Kejuaraan Akademik dan Non Akademik)',
  '   2. FC SK Pengangkatan Ketua OSIS/Pramuka/MPK dan Organisasi Lain (Kepemimpinan)',
  '   3. FC Surat Pindah/Mutasi (Jalur Mutasi Orang Tua)',
  '   4. FC SK Pengangkatan, FC SK Pembagian Tugas, FC Sertifikat Pendidik (Jalur Anak Guru)',
].join('\n');

const DEFAULT_PERNYATAAN_PDB_ISI = [
  '1. Akan belajar dengan tekun dan penuh semangat',
  '2. Akan menjaga nama baik diri sendiri, keluarga dan sekolah serta tidak melakukan tindakan asusila dan sanggup tidak menikah selama menjadi siswa.',
  '3. Akan mengikuti kegiatan ekstrakurikuler wajib kepramukaan dan salah satu kegiatan ekstrakurikuler yang diselenggarakan oleh sekolah',
  '4. Akan mengikuti semua kegiatan keagamaan yang diselenggarakan oleh sekolah',
  '5. Sanggup mentaati dan melaksanakan segala kegiatan yang dilaksanakan oleh sekolah',
  '6. Apabila saya tidak mentaati ketentuan yang telah ditentukan oleh sekolah, saya sanggup menerima sanksi sesuai dengan aturan dan keputusan yang berlaku di sekolah, antara lain :',
  '   a. Teguran dan pemanggilan orang tua/wali oleh pihak sekolah',
  '   b. Tidak diperkenankan mengikuti pelajaran selama jangka waktu tertentu',
  '   c. Dikembalikan ke orang tua/wali saya',
].join('\n');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      school_name TEXT NOT NULL,
      app_name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      announcement_date TEXT NOT NULL,
      announcement_time TEXT NOT NULL,
      sk_number TEXT NOT NULL,
      sk_detail TEXT DEFAULT '',
      kop_instansi TEXT DEFAULT '',
      kop_dinas TEXT DEFAULT '',
      kop_cabang TEXT DEFAULT '',
      kop_alamat TEXT DEFAULT '',
      kop_email TEXT DEFAULT '',
      logo_path TEXT DEFAULT '',
      logo_dinas_path TEXT DEFAULT '',
      kop_surat_path TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS letter_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      kepsek_nama TEXT NOT NULL,
      kepsek_nip TEXT NOT NULL,
      cap_path TEXT DEFAULT '',
      ttd_path TEXT DEFAULT '',
      cap_x REAL DEFAULT -46,
      cap_y REAL DEFAULT 6,
      cap_width REAL DEFAULT 86,
      ttd_x REAL DEFAULT 0,
      ttd_y REAL DEFAULT 18,
      ttd_width REAL DEFAULT 124,

      diterima_nomor TEXT NOT NULL,
      diterima_pembuka TEXT NOT NULL,
      diterima_penutup TEXT NOT NULL,
      diterima_titimangsa TEXT NOT NULL,
      diterima_jabatan TEXT NOT NULL,

      pemanggilan_judul TEXT NOT NULL,
      pemanggilan_titimangsa TEXT NOT NULL,
      pemanggilan_jabatan TEXT NOT NULL,
      default_du_hari TEXT NOT NULL,
      default_du_tanggal TEXT NOT NULL,
      default_du_waktu TEXT NOT NULL,
      default_du_ruang TEXT NOT NULL,
      pemanggilan_catatan_1 TEXT NOT NULL,
      pemanggilan_kelengkapan TEXT NOT NULL,
      pemanggilan_catatan_3 TEXT NOT NULL,

      pernyataan_pdb_judul TEXT NOT NULL,
      pernyataan_pdb_pengantar TEXT NOT NULL,
      pernyataan_pdb_isi TEXT NOT NULL,
      pernyataan_pdb_penutup TEXT NOT NULL,
      pernyataan_pdb_titimangsa TEXT NOT NULL,
      pernyataan_pdb_materai TEXT NOT NULL,

      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_urut TEXT NOT NULL,
      no_pendaftaran TEXT NOT NULL,
      nama_lengkap TEXT NOT NULL,
      nisn TEXT NOT NULL UNIQUE,
      asal_sekolah TEXT NOT NULL,
      jalur_pendaftaran TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DITERIMA', 'TIDAK DITERIMA')),
      daftar_ulang_hari TEXT DEFAULT '',
      daftar_ulang_tanggal TEXT DEFAULT '',
      daftar_ulang_waktu TEXT DEFAULT '',
      daftar_ulang_ruang TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_students_nisn ON students(nisn);
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

    CREATE TABLE IF NOT EXISTS student_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL UNIQUE,

      -- Tahap 1: Data Pribadi
      nama_lengkap TEXT NOT NULL,
      jenis_kelamin TEXT NOT NULL,
      nis TEXT DEFAULT '',
      nik TEXT NOT NULL,
      no_kk TEXT NOT NULL,
      tempat_lahir TEXT NOT NULL,
      tanggal_lahir TEXT NOT NULL,
      no_akta_lahir TEXT DEFAULT '',
      agama TEXT NOT NULL,
      kewarganegaraan TEXT NOT NULL,
      alamat_jalan TEXT NOT NULL,
      rt TEXT NOT NULL,
      rw TEXT NOT NULL,
      dusun TEXT DEFAULT '',
      desa_kelurahan TEXT NOT NULL,
      kecamatan TEXT NOT NULL,
      kabupaten_kota TEXT DEFAULT '',
      provinsi TEXT DEFAULT '',
      kode_pos TEXT NOT NULL,
      tinggal_bersama TEXT NOT NULL,
      moda_transportasi TEXT NOT NULL,
      anak_ke TEXT NOT NULL,

      -- Tahap 2: Data Orang Tua / Wali & Kontak
      ayah_nama TEXT NOT NULL,
      ayah_tempat_lahir TEXT NOT NULL,
      ayah_tanggal_lahir TEXT NOT NULL,
      ayah_pendidikan TEXT NOT NULL,
      ayah_pekerjaan TEXT NOT NULL,

      ibu_nama TEXT NOT NULL,
      ibu_tempat_lahir TEXT NOT NULL,
      ibu_tanggal_lahir TEXT NOT NULL,
      ibu_pendidikan TEXT NOT NULL,
      ibu_pekerjaan TEXT NOT NULL,

      wali_nama TEXT DEFAULT '',
      wali_tempat_lahir TEXT DEFAULT '',
      wali_tanggal_lahir TEXT DEFAULT '',
      wali_pendidikan TEXT DEFAULT '',
      wali_pekerjaan TEXT DEFAULT '',

      no_hp_wa TEXT NOT NULL,
      email TEXT DEFAULT '',

      -- Tahap 3: Data Periodik, Riwayat Sekolah & Nilai Akademik
      tinggi_badan TEXT NOT NULL,
      berat_badan TEXT NOT NULL,
      lingkar_kepala TEXT NOT NULL,
      jarak_kategori TEXT NOT NULL,
      jarak_km TEXT DEFAULT '',
      jumlah_saudara TEXT NOT NULL,
      asal_smp TEXT NOT NULL,
      no_seri_ijazah TEXT DEFAULT '',
      nilai_tka TEXT DEFAULT '',
      nilai_sem_1 TEXT DEFAULT '',
      nilai_sem_2 TEXT DEFAULT '',
      nilai_sem_3 TEXT DEFAULT '',
      nilai_sem_4 TEXT DEFAULT '',
      nilai_sem_5 TEXT DEFAULT '',
      jumlah_nilai TEXT DEFAULT '',

      form_pin_hash TEXT DEFAULT '',
      pin_updated_at TEXT DEFAULT NULL,

      submitted_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS form_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(category, label)
    );

    CREATE INDEX IF NOT EXISTS idx_form_options_category ON form_options(category);

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Idempotent migrations for existing databases
  ensureColumn('school_profile', 'sk_detail', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'kop_instansi', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'kop_dinas', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'kop_cabang', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'kop_alamat', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'kop_email', "TEXT DEFAULT ''");
  ensureColumn('school_profile', 'logo_dinas_path', "TEXT DEFAULT ''");

  ensureColumn('letter_settings', 'cap_x', 'REAL DEFAULT -46');
  ensureColumn('letter_settings', 'cap_y', 'REAL DEFAULT 6');
  ensureColumn('letter_settings', 'cap_width', 'REAL DEFAULT 86');
  ensureColumn('letter_settings', 'ttd_x', 'REAL DEFAULT 0');
  ensureColumn('letter_settings', 'ttd_y', 'REAL DEFAULT 18');
  ensureColumn('letter_settings', 'ttd_width', 'REAL DEFAULT 124');

  ensureColumn('students', 'daftar_ulang_hari', "TEXT DEFAULT ''");
  ensureColumn('students', 'daftar_ulang_tanggal', "TEXT DEFAULT ''");
  ensureColumn('students', 'daftar_ulang_waktu', "TEXT DEFAULT ''");
  ensureColumn('students', 'daftar_ulang_ruang', "TEXT DEFAULT ''");

  ensureColumn('student_forms', 'form_pin_hash', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'pin_updated_at', 'TEXT DEFAULT NULL');
  ensureColumn('student_forms', 'kabupaten_kota', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'provinsi', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_tka', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_sem_1', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_sem_2', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_sem_3', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_sem_4', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'nilai_sem_5', "TEXT DEFAULT ''");
  ensureColumn('student_forms', 'jumlah_nilai', "TEXT DEFAULT ''");

  seedInitialData();
}

function seedInitialData(): void {
  // 1. Seed or backfill School Profile
  const existingProfile = db
    .prepare('SELECT id, sk_detail, kop_instansi FROM school_profile WHERE id = 1')
    .get() as { id: number; sk_detail?: string; kop_instansi?: string } | undefined;

  if (!existingProfile) {
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const { date, time } = getWibDateAndTime(twoHoursLater);
    db.prepare(
      `INSERT INTO school_profile (
        id, school_name, app_name, academic_year, announcement_date, announcement_time,
        sk_number, sk_detail, kop_instansi, kop_dinas, kop_cabang, kop_alamat, kop_email,
        logo_path, kop_surat_path
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'SMA Negeri 1 Cihaurbeuti',
      'Portal Pengumuman Seleksi SPMB',
      '2026/2027',
      date,
      time,
      '1244/PK.07.02/SMAN1CHRBT',
      DEFAULT_SK_DETAIL,
      'PEMERINTAH DAERAH PROVINSI JAWA BARAT',
      'DINAS PENDIDIKAN',
      'CABANG DINAS PENDIDIKAN WILAYAH XIII',
      'Jl. Kartawijaya 600 Pamokolan Tlp. (0265) 420316 Cihaurbeuti Ciamis 46262',
      'e-mail : sman1beauty@gmail.com',
      DEFAULT_LOGO_URL,
      ''
    );
  } else if (!existingProfile.sk_detail && !existingProfile.kop_instansi) {
    db.prepare(
      `UPDATE school_profile SET
        sk_detail = ?,
        kop_instansi = ?,
        kop_dinas = ?,
        kop_cabang = ?,
        kop_alamat = ?,
        kop_email = ?
       WHERE id = 1`
    ).run(
      DEFAULT_SK_DETAIL,
      'PEMERINTAH DAERAH PROVINSI JAWA BARAT',
      'DINAS PENDIDIKAN',
      'CABANG DINAS PENDIDIKAN WILAYAH XIII',
      'Jl. Kartawijaya 600 Pamokolan Tlp. (0265) 420316 Cihaurbeuti Ciamis 46262',
      'e-mail : sman1beauty@gmail.com'
    );
  }

  // 2. Seed Letter Settings
  const letterExists = db.prepare('SELECT id FROM letter_settings WHERE id = 1').get();
  if (!letterExists) {
    db.prepare(
      `INSERT INTO letter_settings (
        id,
        kepsek_nama, kepsek_nip, cap_path, ttd_path,
        diterima_nomor, diterima_pembuka, diterima_penutup, diterima_titimangsa, diterima_jabatan,
        pemanggilan_judul, pemanggilan_titimangsa, pemanggilan_jabatan,
        default_du_hari, default_du_tanggal, default_du_waktu, default_du_ruang,
        pemanggilan_catatan_1, pemanggilan_kelengkapan, pemanggilan_catatan_3,
        pernyataan_pdb_judul, pernyataan_pdb_pengantar, pernyataan_pdb_isi,
        pernyataan_pdb_penutup, pernyataan_pdb_titimangsa, pernyataan_pdb_materai
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'DADANG HENDRAYANA, S.Pd.',
      '198003012014081001',
      '',
      '',
      '1245/PK.07.02/SMAN1CHRBT',
      DEFAULT_SK_DETAIL,
      'Menjadi Murid Baru Kelas X Tahun Pelajaran 2026/2027 pada SMAN 1 Cihaurbeuti Dinas Pendidikan Provinsi Jawa Barat.\nDemikian Surat Keterangan ini dibuat, untuk dipergunakan seperlunya.',
      'Cihaurbeuti, 22 Juni 2026',
      'Kepala,',
      'SURAT PEMANGGILAN DAFTAR ULANG SPMB\nMURID BARU KELAS X',
      'Cihaurbeuti, 22 Juni 2026',
      'Kepala Sekolah,',
      "JUM'AT",
      '26 JUNI 2026',
      '08.00-14.00 WIB',
      'RUANG 01',
      'Pelaksanaan Daftar Ulang didampingi oleh Orang Tua/Wali Siswa dengan jadwal sebagai berikut :',
      DEFAULT_PEMANGGILAN_KELENGKAPAN,
      'Apabila pada waktu yang ditentukan Tidak melaksanakan Daftar Ulang, maka peserta didik baru yang bersangkutan Dianggap Mengundurkan Diri',
      'SURAT PERNYATAAN PESERTA DIDIK BARU',
      'Bahwa selama menjadi Peserta Didik di SMAN 1 Cihaurbeuti, saya :',
      DEFAULT_PERNYATAAN_PDB_ISI,
      'Pernyataan ini saya buat dengan sebenar-benarnya dan penuh tanggung jawab serta diketahui orang tua/wali Peserta didik',
      'Cihaurbeuti, 13 Juli 2026',
      'Materai Rp.10.000'
    );
  }

  // 3. Clean up old static seeded copies of Surat Pernyataan Diterima / Pemanggilan
  //    now that both are generated dynamically per student with Cap & TTD Kepsek.
  db.prepare(
    `DELETE FROM documents
     WHERE file_path IN (
       '/uploads/documents/surat-pernyataan-diterima-sman1-cihaurbeuti.pdf',
       '/uploads/documents/surat-pemanggilan-daftar-ulang-sman1-cihaurbeuti.pdf'
     )`
  ).run();

  // 4. Seed Default Admin User (never displayed in Login UI)
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, full_name, password_hash) VALUES (?, ?, ?)').run(
      'admin',
      'Administrator SPMB',
      passwordHash
    );
  }

  // 5. Seed Dapodik Standard Form Options across all 8 dropdown categories
  seedDefaultFormOptions(false);

  // 6. Seed Initial Dummy Students ONLY on brand-new database creation
  //    (so resetting students for a New Academic Year never re-inserts dummy records)
  if (!existingProfile) {
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get() as {
      count: number;
    };
    if (studentCount.count === 0) {
      const insertStudent = db.prepare(
        `INSERT INTO students (
          no_urut, no_pendaftaran, nama_lengkap, nisn, asal_sekolah, jalur_pendaftaran, status,
          daftar_ulang_hari, daftar_ulang_tanggal, daftar_ulang_waktu, daftar_ulang_ruang
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const seedStudents = [
        [
          'T1-001',
          'SPMB-2026-0001',
          'Ahmad Fauzan Pratama',
          '0101388202',
          'SMP Negeri 1 Cihaurbeuti',
          'Domisili',
          'DITERIMA',
          "JUM'AT",
          '26 JUNI 2026',
          '08.00-14.00 WIB',
          'RUANG 01',
        ],
        [
          'T1-002',
          'SPMB-2026-0002',
          'Siti Nurhaliza Rahmawati',
          '0101388203',
          'MTs Negeri 4 Ciamis',
          'Prestasi Akademik',
          'DITERIMA',
          "JUM'AT",
          '26 JUNI 2026',
          '08.00-14.00 WIB',
          'RUANG 02',
        ],
        [
          'T1-003',
          'SPMB-2026-0003',
          'Rizky Aditya Maulana',
          '0101388204',
          'SMP Negeri 2 Cihaurbeuti',
          'Afirmasi',
          'TIDAK DITERIMA',
          '',
          '',
          '',
          '',
        ],
      ];
      const tx = db.transaction(() => {
        for (const s of seedStudents) {
          insertStudent.run(...s);
        }
      });
      tx();
    }
  }
}

export function seedDefaultFormOptions(forceReset = false): void {
  const optionsCount = db.prepare('SELECT COUNT(*) as count FROM form_options').get() as {
    count: number;
  };
  if (!forceReset && optionsCount.count > 0) return;

  const initialOptions: Record<string, string[]> = {
    jenis_kelamin: ['Laki-laki', 'Perempuan'],
    agama: ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'],
    kewarganegaraan: ['Indonesia (WNI)', 'Warga Negara Asing (WNA)'],
    tinggal_bersama: [
      'Bersama Orang Tua',
      'Wali',
      'Kos',
      'Asrama',
      'Panti Asuhan',
      'Pesantren',
      'Lainnya',
    ],
    moda_transportasi: [
      'Jalan Kaki',
      'Kendaraan Pribadi',
      'Sepeda Motor',
      'Sepeda',
      'Angkutan Umum / Angkot',
      'Antar Jemput Sekolah',
      'Ojek Online / Daring',
      'Lainnya',
    ],
    pendidikan: [
      'Tidak Sekolah',
      'Putus SD',
      'SD Sederajat',
      'SMP Sederajat',
      'SMA Sederajat',
      'D1',
      'D2',
      'D3',
      'D4 / S1',
      'S2',
      'S3',
    ],
    pekerjaan: [
      'Tidak Bekerja',
      'Ibu Rumah Tangga',
      'Petani',
      'Peternak',
      'Nelayan',
      'Buruh',
      'Karyawan Swasta',
      'Wiraswasta',
      'Pedagang Kecil',
      'Pedagang Besar',
      'PNS / TNI / Polri',
      'Karyawan BUMN / BUMD',
      'Tenaga Pengajar / Guru / Dosen',
      'Tenaga Kesehatan',
      'Pensiunan',
      'Sudah Meninggal',
      'Lainnya',
    ],
    jarak_sekolah: ['Kurang dari 1 KM', 'Lebih dari 1 KM'],
  };

  const tx = db.transaction(() => {
    if (forceReset) {
      db.prepare('DELETE FROM form_options').run();
    }
    const insertOpt = db.prepare(
      'INSERT INTO form_options (category, label, is_active, sort_order) VALUES (?, ?, 1, ?)'
    );
    for (const [category, labels] of Object.entries(initialOptions)) {
      labels.forEach((label, idx) => {
        insertOpt.run(category, label, idx + 1);
      });
    }
  });
  tx();
}
