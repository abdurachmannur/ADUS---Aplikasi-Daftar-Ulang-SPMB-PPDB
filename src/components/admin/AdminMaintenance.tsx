import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CalendarSync,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  History,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDateTimeWib,
  formatFileSize,
  getAdminToken,
} from '../../lib/api';
import type { BackupFileInfo, MaintenanceSummary, SchoolProfile } from '../../types';

interface AdminMaintenanceProps {
  onProfileUpdated: (profile: SchoolProfile) => void;
}

type ConfirmAction =
  | { type: 'restore-upload'; file: File }
  | { type: 'restore-local'; backup: BackupFileInfo }
  | { type: 'reset-year' };

function suggestNextAcademicYear(current: string): string {
  const match = current.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (!match) return '';
  return `${Number(match[1]) + 1}/${Number(match[2]) + 1}`;
}

export function AdminMaintenance({ onProfileUpdated }: AdminMaintenanceProps) {
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    text: string;
    autoBackupFilename?: string;
  } | null>(null);

  // Manual backup / snapshot states
  const [downloadingFormat, setDownloadingFormat] = useState<'zip' | 'db' | null>(null);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [downloadingHistoryFile, setDownloadingHistoryFile] = useState<string | null>(null);

  // Restore upload file state
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Reset Tahun Baru checklist state
  const [clearStudents, setClearStudents] = useState(true);
  const [clearForms, setClearForms] = useState(true);
  const [clearDocuments, setClearDocuments] = useState(false);
  const [resetOptions, setResetOptions] = useState(false);
  const [newAcademicYear, setNewAcademicYear] = useState('');
  const [newSkNumber, setNewSkNumber] = useState('');

  // Unified Password Confirmation Modal (Restore Upload / Restore Local / Reset Year)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [executing, setExecuting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete server backup archive modal
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<BackupFileInfo | null>(null);
  const [deletingBackup, setDeletingBackup] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MaintenanceSummary>('/api/admin/maintenance/summary', {}, true);
      setSummary(data);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat status database dan backup.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleDownloadBackup = async (format: 'zip' | 'db') => {
    setDownloadingFormat(format);
    setNotice(null);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename =
      format === 'zip'
        ? `Backup_SPMB_Lengkap_${dateStamp}.zip`
        : `Backup_SPMB_Database_${dateStamp}.db`;
    try {
      await downloadAuthenticatedFile(`/api/admin/maintenance/backup?format=${format}`, filename);
      setNotice({
        type: 'success',
        text:
          format === 'zip'
            ? 'Arsip backup lengkap (.zip) berhasil diunduh.'
            : 'File database SQLite (.db) berhasil diunduh.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengunduh file backup.',
      });
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    setNotice(null);
    try {
      const res = await apiFetch<{
        message: string;
        backup: BackupFileInfo;
        summary: MaintenanceSummary;
      }>('/api/admin/maintenance/snapshot', { method: 'POST' }, true);
      setSummary(res.summary);
      setNotice({
        type: 'success',
        text: res.message,
        autoBackupFilename: res.backup.filename,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan snapshot ke server.',
      });
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleDownloadServerBackup = async (filename: string) => {
    setDownloadingHistoryFile(filename);
    try {
      await downloadAuthenticatedFile(
        `/api/admin/maintenance/backups/${encodeURIComponent(filename)}`,
        filename
      );
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengunduh arsip backup.',
      });
    } finally {
      setDownloadingHistoryFile(null);
    }
  };

  const handleDeleteServerBackup = async () => {
    if (!deleteBackupTarget) return;
    setDeletingBackup(true);
    try {
      const res = await apiFetch<{ message: string; summary: MaintenanceSummary }>(
        `/api/admin/maintenance/backups/${encodeURIComponent(deleteBackupTarget.filename)}`,
        { method: 'DELETE' },
        true
      );
      setSummary(res.summary);
      setNotice({ type: 'success', text: res.message });
      setDeleteBackupTarget(null);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus file arsip.',
      });
    } finally {
      setDeletingBackup(false);
    }
  };

  const openConfirmModal = (action: ConfirmAction) => {
    setConfirmAction(action);
    setAdminPassword('');
    setModalError('');
  };

  const handleExecuteConfirmedAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmAction) return;
    if (!adminPassword.trim()) {
      setModalError('Masukkan kata sandi administrator untuk melanjutkan.');
      return;
    }

    setExecuting(true);
    setModalError('');

    try {
      if (confirmAction.type === 'restore-upload') {
        const fd = new FormData();
        fd.append('file', confirmAction.file);
        fd.append('password', adminPassword);

        const token = getAdminToken();
        const response = await fetch('/api/admin/maintenance/restore', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Gagal memulihkan database.');
        }

        if (data.summary) setSummary(data.summary);
        if (data.profile) onProfileUpdated(data.profile);
        setRestoreFile(null);
        if (restoreInputRef.current) restoreInputRef.current.value = '';
        setConfirmAction(null);
        setNotice({
          type: 'success',
          text: data.message,
          autoBackupFilename: data.auto_backup?.filename,
        });
      } else if (confirmAction.type === 'restore-local') {
        const data = await apiFetch<{
          message: string;
          auto_backup?: BackupFileInfo;
          profile?: SchoolProfile;
          summary?: MaintenanceSummary;
        }>(
          '/api/admin/maintenance/restore-local',
          {
            method: 'POST',
            body: JSON.stringify({
              filename: confirmAction.backup.filename,
              password: adminPassword,
            }),
          },
          true
        );
        if (data.summary) setSummary(data.summary);
        if (data.profile) onProfileUpdated(data.profile);
        setConfirmAction(null);
        setNotice({
          type: 'success',
          text: data.message,
          autoBackupFilename: data.auto_backup?.filename,
        });
      } else if (confirmAction.type === 'reset-year') {
        const data = await apiFetch<{
          message: string;
          auto_backup?: BackupFileInfo;
          deleted: {
            students: number;
            student_forms: number;
            documents: number;
            options_reset: boolean;
          };
          profile?: SchoolProfile;
          summary?: MaintenanceSummary;
        }>(
          '/api/admin/maintenance/reset-year',
          {
            method: 'POST',
            body: JSON.stringify({
              password: adminPassword,
              clear_students: clearStudents,
              clear_forms: clearStudents || clearForms,
              clear_documents: clearDocuments,
              reset_options: resetOptions,
              new_academic_year: newAcademicYear.trim(),
              new_sk_number: newSkNumber.trim(),
            }),
          },
          true
        );

        if (data.summary) setSummary(data.summary);
        if (data.profile) onProfileUpdated(data.profile);
        setNewAcademicYear('');
        setNewSkNumber('');
        setConfirmAction(null);
        setNotice({
          type: 'success',
          text: `${data.message} (${data.deleted.students} siswa, ${data.deleted.student_forms} formulir, ${data.deleted.documents} lampiran PDF dibersihkan).`,
          autoBackupFilename: data.auto_backup?.filename,
        });
      }
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Proses gagal dijalankan.');
    } finally {
      setExecuting(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg py-16 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
        Memuat status database dan arsip backup...
      </div>
    );
  }

  const anyResetChecked = clearStudents || clearForms || clearDocuments || resetOptions;
  const nextYearPlaceholder = summary ? suggestNextAcademicYear(summary.academic_year) || '2027/2028' : '2027/2028';

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            )}
            <span>{notice.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {notice.autoBackupFilename && (
              <button
                type="button"
                onClick={() => handleDownloadServerBackup(notice.autoBackupFilename!)}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                Unduh Auto-Backup
              </button>
            )}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="p-1 opacity-70 hover:opacity-100"
              aria-label="Tutup pemberitahuan"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Storage & Data Summary Strip */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Data Siswa Aktif</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {summary.counts.students}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.counts.accepted_students} diterima · TP {summary.academic_year || '-'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Formulir & PIN Tersimpan</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {summary.counts.student_forms}
            </p>
            <p className="mt-1 text-xs text-slate-500">Isian daftar ulang peserta didik</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Lampiran PDF & Arsip Server</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {summary.counts.documents}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Lampiran PDF · {summary.backups.length} arsip backup di server
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Total Ukuran Data</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatFileSize(summary.storage.total_size_bytes)}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              DB {formatFileSize(summary.storage.db_size_bytes)} · Aset{' '}
              {formatFileSize(summary.storage.uploads_size_bytes)}
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Column Operational Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: Backup & Restore Database */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Backup & Restore Database
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unduh cadangan data tahunan atau pulihkan database dari arsip sebelumnya.
              </p>
            </div>
            <Database className="h-5 w-5 text-[#1677FF] shrink-0" />
          </div>

          <div className="p-6 space-y-6">
            {/* Backup Controls */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">1. Unduh Cadangan (Backup)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih arsip lengkap <strong>.zip</strong> untuk menyimpan database sekaligus Logo,
                  Kop Surat, Cap, Tanda Tangan, dan lampiran PDF, atau <strong>.db</strong> untuk
                  database SQLite saja.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={downloadingFormat !== null}
                  onClick={() => handleDownloadBackup('zip')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1677FF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {downloadingFormat === 'zip' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Unduh Arsip Lengkap (.zip)
                </button>

                <button
                  type="button"
                  disabled={downloadingFormat !== null}
                  onClick={() => handleDownloadBackup('db')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF] disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {downloadingFormat === 'db' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Unduh Database Saja (.db)
                </button>

                <button
                  type="button"
                  disabled={creatingSnapshot}
                  onClick={handleCreateSnapshot}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {creatingSnapshot ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="h-3.5 w-3.5" />
                  )}
                  Simpan Snapshot Server
                </button>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Restore Upload Controls */}
            <div className="space-y-3.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  2. Pulihkan dari File Cadangan (Restore)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mendukung file arsip lengkap <strong>.zip</strong> maupun file SQLite{' '}
                  <strong>.db</strong>. Sistem akan memvalidasi integritas file dan membuat{' '}
                  <strong>Auto-Backup otomatis</strong> sebelum menimpa data aktif.
                </p>
              </div>

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 space-y-3">
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".zip,.db,.sqlite,.sqlite3"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100"
                />

                {restoreFile && (
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-700 pt-1">
                    <span className="truncate font-medium">
                      {restoreFile.name}{' '}
                      <span className="font-mono text-slate-500 tabular-nums">
                        ({formatFileSize(restoreFile.size)})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreFile(null);
                        if (restoreInputRef.current) restoreInputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-slate-700 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  Pemulihan mengganti data saat ini secara langsung tanpa perlu restart server. Jika
                  akun admin pada file backup memiliki kata sandi berbeda, gunakan kata sandi arsip
                  tersebut untuk login berikutnya.
                </span>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!restoreFile}
                  onClick={() => restoreFile && openConfirmModal({ type: 'restore-upload', file: restoreFile })}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Pulihkan Database Sekarang
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Mulai Tahun Pelajaran Baru (Selective Reset) */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Mulai Tahun Pelajaran Baru
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Bersihkan data SPMB tahun sebelumnya secara selektif dengan Auto-Backup otomatis.
              </p>
            </div>
            <CalendarSync className="h-5 w-5 text-red-600 shrink-0" />
          </div>

          <div className="p-6 space-y-5">
            {/* Optional New Academic Year & SK Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tahun Pelajaran Baru <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={newAcademicYear}
                  onChange={(e) => setNewAcademicYear(e.target.value)}
                  placeholder={nextYearPlaceholder}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor SK Baru <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={newSkNumber}
                  onChange={(e) => setNewSkNumber(e.target.value)}
                  placeholder="Kosongkan jika belum berubah"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
                />
              </div>
            </div>

            {/* Selective Checklist */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">
                Pilih Data yang Ingin Dibersihkan:
              </p>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3.5 py-3 hover:bg-slate-50/70 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={clearStudents}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setClearStudents(checked);
                    if (checked) setClearForms(true);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Data Siswa & Hasil Seleksi
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                      {summary?.counts.students ?? 0} data
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menghapus seluruh daftar pendaftar beserta isian formulir dan PIN siswa terkait.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 rounded-lg border border-slate-200 px-3.5 py-3 transition-colors ${
                  clearStudents ? 'bg-slate-50 opacity-80 cursor-not-allowed' : 'hover:bg-slate-50/70 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={clearStudents || clearForms}
                  disabled={clearStudents}
                  onChange={(e) => setClearForms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Data Formulir Daftar Ulang & PIN Siswa
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                      {summary?.counts.student_forms ?? 0} formulir
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {clearStudents
                      ? 'Otomatis ikut dibersihkan karena Data Siswa dicentang.'
                      : 'Hanya menghapus isian formulir & PIN; daftar induk siswa tetap tersimpan.'}
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3.5 py-3 hover:bg-slate-50/70 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={clearDocuments}
                  onChange={(e) => setClearDocuments(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Lampiran Dokumen PDF Tambahan
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                      {summary?.counts.documents ?? 0} dokumen
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menghapus daftar dan file PDF lampiran tambahan (tata tertib, jadwal MPLS, dll.).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3.5 py-3 hover:bg-slate-50/70 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={resetOptions}
                  onChange={(e) => setResetOptions(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Kembalikan Master Pilihan Dropdown ke Bawaan
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums shrink-0">
                      {summary?.counts.form_options ?? 0} opsi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mengembalikan daftar pilihan Agama, Pendidikan, Pekerjaan, dsb. ke standar Dapodik.
                  </p>
                </div>
              </label>
            </div>

            {/* What Is Always Preserved */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">Tetap Aman & Dipertahankan:</p>
                <p className="mt-0.5">
                  Akun Admin, Profil & Kop Surat Sekolah, Logo Sekolah/Dinas, Cap Sekolah, Tanda
                  Tangan Kepala Sekolah, serta seluruh Template Surat tidak akan terhapus. Sebelum
                  reset berjalan, sistem otomatis membuat <strong>Auto-Backup lengkap (.zip)</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!anyResetChecked}
                onClick={() => openConfirmModal({ type: 'reset-year' })}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <CalendarSync className="h-4 w-4" />
                Proses Reset Tahun Baru
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Full-Width Server Auto-Backup History Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-slate-600 shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Riwayat Auto-Backup & Snapshot Server
              </h2>
              <p className="text-xs text-slate-500">
                Tersimpan permanen di direktori volume data persisten server (tetap aman walau
                Docker restart atau shutdown).
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {summary?.backups.length ?? 0} arsip tersimpan
          </span>
        </div>

        {!summary || summary.backups.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <p className="text-sm text-slate-600">
              Belum ada arsip snapshot atau auto-backup yang tersimpan di server.
            </p>
            <button
              type="button"
              disabled={creatingSnapshot}
              onClick={handleCreateSnapshot}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF]"
            >
              {creatingSnapshot ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <HardDrive className="h-3.5 w-3.5" />
              )}
              Buat Snapshot Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama File Arsip</th>
                  <th className="py-3 px-4">Pemicu</th>
                  <th className="py-3 px-4">Ukuran</th>
                  <th className="py-3 px-4">Waktu Dibuat (WIB)</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-slate-900 whitespace-nowrap">
                      {b.filename}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {b.trigger_label}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatFileSize(b.size_bytes)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDateTimeWib(b.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={downloadingHistoryFile === b.filename}
                          onClick={() => handleDownloadServerBackup(b.filename)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF] disabled:opacity-60 transition-colors"
                        >
                          {downloadingHistoryFile === b.filename ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Unduh
                        </button>
                        <button
                          type="button"
                          onClick={() => openConfirmModal({ type: 'restore-local', backup: b })}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50/80 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Pulihkan
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteBackupTarget(b)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Hapus arsip dari server"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Unified Password Verification Modal for Reset Year & Restore */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound
                  className={`h-4 w-4 ${
                    confirmAction.type === 'reset-year' ? 'text-red-600' : 'text-amber-600'
                  }`}
                />
                <h3 className="font-display text-base font-bold text-slate-900">
                  {confirmAction.type === 'reset-year'
                    ? 'Konfirmasi Reset Tahun Pelajaran Baru'
                    : 'Konfirmasi Pemulihan Database'}
                </h3>
              </div>
              <button
                type="button"
                disabled={executing}
                onClick={() => setConfirmAction(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteConfirmedAction} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {confirmAction.type === 'reset-year' ? (
                <div className="rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-900 space-y-1.5">
                  <p className="font-semibold">Item yang akan dibersihkan:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {clearStudents && (
                      <li>
                        Seluruh Data Siswa ({summary?.counts.students ?? 0} data) &amp; Formulir
                        terkait ({summary?.counts.student_forms ?? 0} formulir)
                      </li>
                    )}
                    {!clearStudents && clearForms && (
                      <li>
                        Seluruh Data Formulir &amp; PIN Siswa ({summary?.counts.student_forms ?? 0}{' '}
                        formulir)
                      </li>
                    )}
                    {clearDocuments && (
                      <li>Lampiran Dokumen PDF Tambahan ({summary?.counts.documents ?? 0} file)</li>
                    )}
                    {resetOptions && <li>Master Pilihan Dropdown dikembalikan ke bawaan Dapodik</li>}
                  </ul>
                  {(newAcademicYear.trim() || newSkNumber.trim()) && (
                    <p className="pt-1 text-slate-700">
                      Profil diperbarui:{' '}
                      {[
                        newAcademicYear.trim() ? `TP ${newAcademicYear.trim()}` : '',
                        newSkNumber.trim() ? `SK ${newSkNumber.trim()}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">Sumber arsip yang akan dipulihkan:</p>
                  <p className="font-mono break-all text-slate-900">
                    {confirmAction.type === 'restore-upload'
                      ? `${confirmAction.file.name} (${formatFileSize(confirmAction.file.size)})`
                      : `${confirmAction.backup.filename} (${formatFileSize(confirmAction.backup.size_bytes)})`}
                  </p>
                  <p className="pt-1">
                    Data aktif saat ini akan diganti dengan isi arsip tersebut.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-900 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span>
                  <strong>Pengaman Otomatis:</strong> Sistem akan membuat arsip Auto-Backup lengkap
                  (.zip) di server sebelum perubahan dieksekusi.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Verifikasi Kata Sandi Administrator *
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun admin Anda"
                  autoComplete="current-password"
                  autoFocus
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={executing}
                  onClick={() => setConfirmAction(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={executing || !adminPassword.trim()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 transition-colors ${
                    confirmAction.type === 'reset-year'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {executing
                    ? 'Memproses & Auto-Backup...'
                    : confirmAction.type === 'reset-year'
                      ? 'Ya, Auto-Backup & Reset'
                      : 'Ya, Auto-Backup & Pulihkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Server Backup Archive Confirmation Modal */}
      {deleteBackupTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Hapus Arsip Backup dari Server?
            </h3>
            <p className="text-sm text-slate-600">
              File <strong className="font-mono text-xs text-slate-900 break-all">{deleteBackupTarget.filename}</strong>{' '}
              ({formatFileSize(deleteBackupTarget.size_bytes)}) akan dihapus permanen dari daftar
              riwayat server. Pastikan Anda sudah menyimpan salinannya jika masih diperlukan.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingBackup}
                onClick={() => setDeleteBackupTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingBackup}
                onClick={handleDeleteServerBackup}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingBackup && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ya, Hapus Arsip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
