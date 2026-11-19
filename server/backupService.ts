import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BACKUPS_DIR,
  closeDatabase,
  db,
  DB_PATH,
  DOCS_UPLOAD_DIR,
  ensureStorageDirectories,
  getDbInstance,
  IMAGES_UPLOAD_DIR,
  initDatabase,
  reopenDatabase,
  UPLOADS_DIR,
} from './db.ts';

const SQLITE_MAGIC = 'SQLite format 3\0';
const REQUIRED_TABLES = ['users', 'school_profile', 'students', 'student_forms'] as const;

export type BackupTrigger = 'pre-reset' | 'pre-restore' | 'manual';

export interface BackupFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
  trigger: BackupTrigger;
  trigger_label: string;
}

export interface ValidatedDbSummary {
  school_name: string;
  academic_year: string;
  students_count: number;
  forms_count: number;
  documents_count: number;
}

export interface RestoreResult {
  format: 'zip' | 'db';
  restored_uploads: boolean;
  auto_backup: BackupFileInfo;
  restored_summary: ValidatedDbSummary;
}

function getWibTimestampSlug(date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = wib.getUTCFullYear();
  const mm = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(wib.getUTCDate()).padStart(2, '0');
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mi = String(wib.getUTCMinutes()).padStart(2, '0');
  const ss = String(wib.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function safeRm(targetPath: string): void {
  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

function getDirectorySize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(full);
    } else if (entry.isFile()) {
      try {
        total += fs.statSync(full).size;
      } catch {
        // ignore race
      }
    }
  }
  return total;
}

function addDirectoryToZip(zip: AdmZip, srcDir: string, zipPrefix: string): void {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(srcDir, entry.name);
    const entryZipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, entryZipPath);
    } else if (entry.isFile()) {
      const folderInZip = path.posix.dirname(entryZipPath);
      zip.addLocalFile(fullPath, folderInZip === '.' ? '' : folderInZip, entry.name);
    }
  }
}

function copyDirectoryRecursive(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function parseTriggerFromFilename(filename: string): {
  trigger: BackupTrigger;
  trigger_label: string;
} {
  if (filename.startsWith('auto-backup-pre-reset-')) {
    return { trigger: 'pre-reset', trigger_label: 'Auto-Backup Sebelum Reset Tahun Baru' };
  }
  if (filename.startsWith('auto-backup-pre-restore-')) {
    return { trigger: 'pre-restore', trigger_label: 'Auto-Backup Sebelum Restore' };
  }
  return { trigger: 'manual', trigger_label: 'Snapshot Manual Server' };
}

export async function createAtomicDbSnapshot(destPath: string): Promise<void> {
  const parent = path.dirname(destPath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  await getDbInstance().backup(destPath);
}

export async function createFullZipBackup(
  destZipPath: string,
  trigger: BackupTrigger,
  createdBy: string
): Promise<void> {
  ensureStorageDirectories();
  const tempDir = makeTempDir('spmb-zip-');
  const snapshotDbPath = path.join(tempDir, 'spmb.db');
  const tmpZipPath = `${destZipPath}.tmp`;

  try {
    await createAtomicDbSnapshot(snapshotDbPath);

    const profile = db
      .prepare('SELECT school_name, academic_year, sk_number FROM school_profile WHERE id = 1')
      .get() as { school_name: string; academic_year: string; sk_number: string } | undefined;
    const studentsCount = (
      db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }
    ).count;
    const formsCount = (
      db.prepare('SELECT COUNT(*) as count FROM student_forms').get() as { count: number }
    ).count;
    const documentsCount = (
      db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }
    ).count;

    const manifest = {
      app: 'Sistem Informasi Pengumuman Seleksi SPMB',
      format_version: 1,
      created_at: new Date().toISOString(),
      created_by: createdBy,
      trigger,
      school_name: profile?.school_name || '',
      academic_year: profile?.academic_year || '',
      sk_number: profile?.sk_number || '',
      counts: {
        students: studentsCount,
        student_forms: formsCount,
        documents: documentsCount,
      },
    };

    const zip = new AdmZip();
    zip.addLocalFile(snapshotDbPath, '', 'spmb.db');
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    addDirectoryToZip(zip, UPLOADS_DIR, 'uploads');

    const destParent = path.dirname(destZipPath);
    if (!fs.existsSync(destParent)) {
      fs.mkdirSync(destParent, { recursive: true });
    }
    zip.writeZip(tmpZipPath);
    fs.renameSync(tmpZipPath, destZipPath);
  } finally {
    safeRm(tmpZipPath);
    safeRm(tempDir);
  }
}

export async function createAutoSafetyBackup(
  trigger: BackupTrigger,
  createdBy: string
): Promise<BackupFileInfo> {
  ensureStorageDirectories();
  const slug = getWibTimestampSlug();
  const prefix =
    trigger === 'manual' ? 'manual-snapshot' : `auto-backup-${trigger}`;
  const filename = `${prefix}-${slug}.zip`;
  const destPath = path.join(BACKUPS_DIR, filename);

  await createFullZipBackup(destPath, trigger, createdBy);
  const stat = fs.statSync(destPath);
  const parsed = parseTriggerFromFilename(filename);

  return {
    filename,
    size_bytes: stat.size,
    created_at: stat.mtime.toISOString(),
    trigger: parsed.trigger,
    trigger_label: parsed.trigger_label,
  };
}

export function listServerBackups(): BackupFileInfo[] {
  ensureStorageDirectories();
  const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
  const items: BackupFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.zip')) continue;
    const fullPath = path.join(BACKUPS_DIR, entry.name);
    try {
      const stat = fs.statSync(fullPath);
      const parsed = parseTriggerFromFilename(entry.name);
      items.push({
        filename: entry.name,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
        trigger: parsed.trigger,
        trigger_label: parsed.trigger_label,
      });
    } catch {
      // ignore removed file race
    }
  }

  return items.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function getSafeBackupFilePath(filename: string): string | null {
  const clean = path.basename(filename || '').trim();
  if (!clean || clean !== filename || !/^[a-zA-Z0-9._-]+\.zip$/i.test(clean)) {
    return null;
  }
  const fullPath = path.resolve(BACKUPS_DIR, clean);
  if (!fullPath.startsWith(BACKUPS_DIR + path.sep)) {
    return null;
  }
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}

export function deleteServerBackup(filename: string): boolean {
  const fullPath = getSafeBackupFilePath(filename);
  if (!fullPath) return false;
  fs.unlinkSync(fullPath);
  return true;
}

export function validateSqliteFile(sqlitePath: string): ValidatedDbSummary {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error('File database SQLite tidak ditemukan.');
  }
  const stat = fs.statSync(sqlitePath);
  if (stat.size < 100) {
    throw new Error('Ukuran file database terlalu kecil atau korup.');
  }

  const fd = fs.openSync(sqlitePath, 'r');
  try {
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    if (header.toString('utf8') !== SQLITE_MAGIC) {
      throw new Error('File yang diunggah bukan database SQLite (.db) yang valid.');
    }
  } finally {
    fs.closeSync(fd);
  }

  let testDb: Database.Database | null = null;
  try {
    testDb = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    const integrity = testDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error('Pemeriksaan integritas database gagal. File kemungkinan rusak.');
    }

    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableSet = new Set(tables.map((t) => t.name));

    for (const required of REQUIRED_TABLES) {
      if (!tableSet.has(required)) {
        throw new Error(
          `Struktur database tidak cocok (tabel inti "${required}" tidak ditemukan). Pastikan file berasal dari backup portal SPMB ini.`
        );
      }
    }

    const profile = testDb
      .prepare('SELECT school_name, academic_year FROM school_profile WHERE id = 1')
      .get() as { school_name?: string; academic_year?: string } | undefined;
    const studentsCount = (
      testDb.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }
    ).count;
    const formsCount = (
      testDb.prepare('SELECT COUNT(*) as count FROM student_forms').get() as { count: number }
    ).count;
    const documentsCount = tableSet.has('documents')
      ? (testDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count
      : 0;

    return {
      school_name: profile?.school_name || 'SPMB',
      academic_year: profile?.academic_year || '-',
      students_count: studentsCount,
      forms_count: formsCount,
      documents_count: documentsCount,
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('Gagal membaca atau memvalidasi file database SQLite.');
  } finally {
    if (testDb && testDb.open) {
      testDb.close();
    }
  }
}

function replaceUploadsFromExtracted(extractedUploadsDir: string): void {
  ensureStorageDirectories();
  const tempOldUploads = makeTempDir('spmb-old-uploads-');
  try {
    // Stage existing uploads for rollback
    copyDirectoryRecursive(UPLOADS_DIR, tempOldUploads);

    // Clear current uploads contents safely (do not remove mount root itself for Docker volume compatibility!)
    for (const entry of fs.readdirSync(UPLOADS_DIR)) {
      safeRm(path.join(UPLOADS_DIR, entry));
    }

    // Copy extracted uploads
    copyDirectoryRecursive(extractedUploadsDir, UPLOADS_DIR);
    // Ensure standard subdirectories always exist
    fs.mkdirSync(IMAGES_UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(DOCS_UPLOAD_DIR, { recursive: true });
  } catch (err) {
    // Rollback uploads if copy failed
    try {
      for (const entry of fs.readdirSync(UPLOADS_DIR)) {
        safeRm(path.join(UPLOADS_DIR, entry));
      }
      copyDirectoryRecursive(tempOldUploads, UPLOADS_DIR);
      fs.mkdirSync(IMAGES_UPLOAD_DIR, { recursive: true });
      fs.mkdirSync(DOCS_UPLOAD_DIR, { recursive: true });
    } catch {
      // ignore secondary rollback failure
    }
    throw err;
  } finally {
    safeRm(tempOldUploads);
  }
}

export async function restoreFromUploadedBuffer(
  fileBuffer: Buffer,
  originalName: string,
  createdBy: string
): Promise<RestoreResult> {
  if (!fileBuffer || fileBuffer.length < 100) {
    throw new Error('File cadangan kosong atau tidak valid.');
  }

  const ext = path.extname(originalName || '').toLowerCase();
  const isZipMagic =
    fileBuffer.length >= 4 &&
    fileBuffer[0] === 0x50 &&
    fileBuffer[1] === 0x4b &&
    (fileBuffer[2] === 0x03 || fileBuffer[2] === 0x05);
  const isSqliteMagic =
    fileBuffer.length >= 16 && fileBuffer.subarray(0, 16).toString('utf8') === SQLITE_MAGIC;

  let format: 'zip' | 'db';
  if (isZipMagic || ext === '.zip') {
    if (!isZipMagic) {
      throw new Error('File berekstensi .zip tetapi format arsip ZIP tidak valid.');
    }
    format = 'zip';
  } else if (isSqliteMagic || ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
    if (!isSqliteMagic) {
      throw new Error('File bukan database SQLite (.db) yang valid.');
    }
    format = 'db';
  } else {
    throw new Error('Format file tidak didukung. Unggah file backup .zip atau .db.');
  }

  const workDir = makeTempDir('spmb-restore-');
  const candidateDbPath = path.join(workDir, 'candidate.db');
  const extractedUploadsDir = path.join(workDir, 'uploads');
  let hasExtractedUploads = false;

  try {
    // 1. Stage & validate uploaded archive BEFORE touching active DB or creating auto-backup
    if (format === 'db') {
      fs.writeFileSync(candidateDbPath, fileBuffer);
    } else {
      let zip: AdmZip;
      try {
        zip = new AdmZip(fileBuffer);
      } catch {
        throw new Error('Arsip ZIP rusak atau tidak dapat dibaca.');
      }

      const entries = zip.getEntries();
      let foundDbEntry = false;

      for (const entry of entries) {
        const normalized = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
          throw new Error('Arsip ZIP mengandung jalur file tidak aman dan ditolak sistem.');
        }
        if (entry.isDirectory) continue;

        if (normalized === 'spmb.db' || normalized === 'data/spmb.db') {
          fs.writeFileSync(candidateDbPath, entry.getData());
          foundDbEntry = true;
        } else if (normalized.startsWith('uploads/')) {
          const relSub = normalized.slice('uploads/'.length);
          if (!relSub || relSub.includes('..')) continue;
          const destFile = path.resolve(extractedUploadsDir, relSub);
          if (!destFile.startsWith(extractedUploadsDir + path.sep)) {
            throw new Error('Arsip ZIP mengandung jalur unggahan tidak aman.');
          }
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.writeFileSync(destFile, entry.getData());
          hasExtractedUploads = true;
        }
      }

      if (!foundDbEntry) {
        throw new Error(
          'Arsip ZIP tidak memuat file "spmb.db". Pastikan Anda memilih file hasil backup portal SPMB.'
        );
      }
    }

    const restoredSummary = validateSqliteFile(candidateDbPath);

    // 2. Mandatory automatic pre-restore safety backup (persisted in data/backups/)
    const autoBackup = await createAutoSafetyBackup('pre-restore', createdBy);

    // 3. Stage rollback copy of current DB before swapping
    const rollbackDbPath = path.join(workDir, 'rollback.db');
    await createAtomicDbSnapshot(rollbackDbPath);

    // 4. Atomic swap: close handle -> remove WAL/SHM -> copy DB -> swap uploads -> reopen -> migrate
    try {
      closeDatabase();
      safeRm(`${DB_PATH}-wal`);
      safeRm(`${DB_PATH}-shm`);
      fs.copyFileSync(candidateDbPath, DB_PATH);

      if (format === 'zip' && hasExtractedUploads) {
        replaceUploadsFromExtracted(extractedUploadsDir);
      }

      reopenDatabase();
      initDatabase();
    } catch (swapErr) {
      // Rollback DB cleanly
      try {
        closeDatabase();
        safeRm(`${DB_PATH}-wal`);
        safeRm(`${DB_PATH}-shm`);
        if (fs.existsSync(rollbackDbPath)) {
          fs.copyFileSync(rollbackDbPath, DB_PATH);
        }
        reopenDatabase();
      } catch {
        // ignore secondary rollback failure
      }
      throw swapErr;
    }

    return {
      format,
      restored_uploads: format === 'zip' && hasExtractedUploads,
      auto_backup: autoBackup,
      restored_summary: restoredSummary,
    };
  } finally {
    safeRm(workDir);
  }
}

export async function restoreFromLocalBackup(
  filename: string,
  createdBy: string
): Promise<RestoreResult> {
  const fullPath = getSafeBackupFilePath(filename);
  if (!fullPath) {
    throw new Error('File riwayat backup tidak ditemukan di server.');
  }
  const buffer = fs.readFileSync(fullPath);
  return restoreFromUploadedBuffer(buffer, filename, createdBy);
}

export function getMaintenanceSummary() {
  ensureStorageDirectories();
  const profile = db
    .prepare('SELECT school_name, academic_year, sk_number FROM school_profile WHERE id = 1')
    .get() as { school_name: string; academic_year: string; sk_number: string } | undefined;

  const studentsCount = (
    db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }
  ).count;
  const acceptedCount = (
    db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'DITERIMA'").get() as {
      count: number;
    }
  ).count;
  const formsCount = (
    db.prepare('SELECT COUNT(*) as count FROM student_forms').get() as { count: number }
  ).count;
  const documentsCount = (
    db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }
  ).count;
  const formOptionsCount = (
    db.prepare('SELECT COUNT(*) as count FROM form_options').get() as { count: number }
  ).count;
  const usersCount = (
    db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  ).count;

  let dbSizeBytes = 0;
  try {
    if (fs.existsSync(DB_PATH)) dbSizeBytes += fs.statSync(DB_PATH).size;
    if (fs.existsSync(`${DB_PATH}-wal`)) dbSizeBytes += fs.statSync(`${DB_PATH}-wal`).size;
  } catch {
    // ignore stat error
  }

  const uploadsSizeBytes = getDirectorySize(UPLOADS_DIR);
  const backups = listServerBackups();

  return {
    school_name: profile?.school_name || '',
    academic_year: profile?.academic_year || '',
    sk_number: profile?.sk_number || '',
    counts: {
      students: studentsCount,
      accepted_students: acceptedCount,
      student_forms: formsCount,
      documents: documentsCount,
      form_options: formOptionsCount,
      users: usersCount,
    },
    storage: {
      db_size_bytes: dbSizeBytes,
      uploads_size_bytes: uploadsSizeBytes,
      total_size_bytes: dbSizeBytes + uploadsSizeBytes,
    },
    backups,
  };
}
