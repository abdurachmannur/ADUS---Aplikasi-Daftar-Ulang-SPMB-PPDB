import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Lock,
  Printer,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDateTimeWib,
  formatIndonesianDate,
} from '../../lib/api';
import type { SchoolProfile, Student, StudentFormRecord } from '../../types';
import { SchoolLetterhead } from '../SchoolHeader';

interface FormSummaryRow {
  student_id: number;
  no_urut: string;
  no_pendaftaran: string;
  nama_lengkap: string;
  nisn: string;
  asal_sekolah: string;
  jalur_pendaftaran: string;
  has_form: boolean;
  has_pin: boolean;
  jenis_kelamin: string | null;
  no_hp_wa: string | null;
  submitted_at: string | null;
  form_updated_at: string | null;
}

interface FormDetailResponse {
  student: Student;
  form: StudentFormRecord | null;
  has_pin: boolean;
  profile: SchoolProfile;
}

interface ResetPinTarget {
  studentId: number;
  namaLengkap: string;
  nisn: string;
}

interface ResetPinResult {
  message: string;
  mode: 'clear' | 'temporary';
  temporary_pin: string | null;
  has_pin: boolean;
}

export function AdminForms() {
  const [items, setItems] = useState<FormSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING'>('ALL');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Detail & Print View
  const [detail, setDetail] = useState<FormDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pdfSigner, setPdfSigner] = useState<'AYAH' | 'IBU' | 'WALI'>('AYAH');
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  // Reset PIN Modal State
  const [resetTarget, setResetTarget] = useState<ResetPinTarget | null>(null);
  const [resetMode, setResetMode] = useState<'clear' | 'temporary'>('clear');
  const [customTempPin, setCustomTempPin] = useState('');
  const [resettingPin, setResettingPin] = useState(false);
  const [resetPinError, setResetPinError] = useState('');
  const [resetPinResult, setResetPinResult] = useState<ResetPinResult | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);

  // Multi-select & single form deletion state
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedFormIds, setSelectedFormIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<FormSummaryRow | null>(null);
  const [deletingForms, setDeletingForms] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (filter !== 'ALL') qs.set('filter', filter);
      const res = await apiFetch<{ items: FormSummaryRow[] }>(
        `/api/admin/forms?${qs.toString()}`,
        {},
        true
      );
      setItems(res.items);
      setSelectedFormIds((prev) => {
        if (prev.size === 0) return prev;
        const submittedIds = new Set(res.items.filter((i) => i.has_form).map((i) => i.student_id));
        const next = new Set<number>();
        prev.forEach((id) => {
          if (submittedIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar formulir.');
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    const t = window.setTimeout(fetchList, 200);
    return () => window.clearTimeout(t);
  }, [fetchList]);

  const openDetail = async (studentId: number) => {
    setLoadingDetail(true);
    setError('');
    try {
      const res = await apiFetch<FormDetailResponse>(`/api/admin/forms/${studentId}`, {}, true);
      setDetail(res);
      if (res.form) {
        if (res.form.ayah_nama?.trim()) setPdfSigner('AYAH');
        else if (res.form.ibu_nama?.trim()) setPdfSigner('IBU');
        else if (res.form.wali_nama?.trim()) setPdfSigner('WALI');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail formulir.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDownloadStudentPdf = async (
    studentId: number,
    nisn: string,
    docType: 'pernyataan-diterima' | 'pemanggilan-daftar-ulang' | 'pernyataan-pdb' | 'formulir-pdb',
    filenamePrefix: string
  ) => {
    setDownloadingPdf(docType);
    setError('');
    try {
      const needsSigner = docType === 'pernyataan-pdb' || docType === 'formulir-pdb';
      const qs = needsSigner ? `?signer=${pdfSigner}` : '';
      await downloadAuthenticatedFile(
        `/api/admin/forms/${studentId}/pdf/${docType}${qs}`,
        `${filenamePrefix}_${nisn}.pdf`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh dokumen PDF.');
    } finally {
      setDownloadingPdf(null);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadAuthenticatedFile(
        '/api/admin/forms/export',
        `Rekap_Formulir_SPMB_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor data formulir ke Excel.');
    } finally {
      setExporting(false);
    }
  };

  const openResetPinModal = (target: ResetPinTarget) => {
    setResetTarget(target);
    setResetMode('clear');
    setCustomTempPin('');
    setResetPinError('');
    setResetPinResult(null);
    setCopiedPin(false);
  };

  const closeResetPinModal = () => {
    if (resettingPin) return;
    setResetTarget(null);
    setResetPinError('');
    setResetPinResult(null);
    setCopiedPin(false);
  };

  const handleConfirmResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;

    const cleanTemp = customTempPin.trim();
    if (resetMode === 'temporary' && cleanTemp && !/^\d{6}$/.test(cleanTemp)) {
      setResetPinError('PIN sementara harus tepat 6 digit angka (atau kosongkan untuk acak otomatis).');
      return;
    }

    setResettingPin(true);
    setResetPinError('');

    try {
      const res = await apiFetch<ResetPinResult>(
        `/api/admin/students/${resetTarget.studentId}/reset-pin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: resetMode,
            ...(resetMode === 'temporary' && cleanTemp ? { temporary_pin: cleanTemp } : {}),
          }),
        },
        true
      );
      setResetPinResult(res);
      setItems((prev) =>
        prev.map((row) =>
          row.student_id === resetTarget.studentId ? { ...row, has_pin: res.has_pin } : row
        )
      );
      setDetail((prev) =>
        prev && prev.student.id === resetTarget.studentId
          ? { ...prev, has_pin: res.has_pin }
          : prev
      );
    } catch (err) {
      setResetPinError(err instanceof Error ? err.message : 'Gagal mereset PIN siswa.');
    } finally {
      setResettingPin(false);
    }
  };

  const handleCopyTempPin = async (pin: string) => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(true);
      window.setTimeout(() => setCopiedPin(false), 2000);
    } catch {
      // Clipboard may be restricted in some contexts
    }
  };

  const resetPinModal = resetTarget ? (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Reset PIN Keamanan Siswa
              </h3>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {resetTarget.namaLengkap} · NISN {resetTarget.nisn}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeResetPinModal}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {resetPinResult ? (
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <p className="leading-relaxed">{resetPinResult.message}</p>
            </div>

            {resetPinResult.temporary_pin && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  PIN Sementara 6 Digit
                </p>
                <p className="font-mono text-2xl font-bold tracking-[0.28em] text-[#0B2447] tabular-nums">
                  {resetPinResult.temporary_pin}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyTempPin(resetPinResult.temporary_pin!)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {copiedPin ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Salin PIN
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-500">
                  Berikan PIN ini kepada siswa/orang tua yang bersangkutan secara langsung.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={closeResetPinModal}
                className="rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleConfirmResetPin} className="p-5 space-y-4">
            {resetPinError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{resetPinError}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <label
                className={`block rounded-lg border p-3.5 cursor-pointer transition-colors ${
                  resetMode === 'clear'
                    ? 'border-[#1677FF] bg-[#1677FF]/5'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'clear'}
                    onChange={() => {
                      setResetMode('clear');
                      setResetPinError('');
                    }}
                    className="mt-0.5 accent-[#1677FF]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      Hapus PIN — Siswa Buat PIN Baru Sendiri
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      PIN lama akan dihapus. Saat siswa mengecek NISN kembali, sistem meminta siswa membuat PIN 6 digit baru sebelum membuka formulir/PDF.
                    </p>
                  </div>
                </div>
              </label>

              <label
                className={`block rounded-lg border p-3.5 cursor-pointer transition-colors ${
                  resetMode === 'temporary'
                    ? 'border-[#1677FF] bg-[#1677FF]/5'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="resetMode"
                    checked={resetMode === 'temporary'}
                    onChange={() => {
                      setResetMode('temporary');
                      setResetPinError('');
                    }}
                    className="mt-0.5 accent-[#1677FF]"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-900">
                      Tetapkan PIN Sementara 6 Digit
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Tetapkan PIN 6 digit (otomatis acak atau tentukan sendiri) lalu kirimkan ke siswa/orang tua.
                    </p>
                    {resetMode === 'temporary' && (
                      <div className="mt-2.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={customTempPin}
                          onChange={(e) =>
                            setCustomTempPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                          placeholder="Kosongkan untuk acak 6 digit otomatis"
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeResetPinModal}
                disabled={resettingPin}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={resettingPin}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
              >
                {resettingPin ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" />
                    Konfirmasi Reset PIN
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  ) : null;

  // Detail & Formal A4 Print View
  if (detail) {
    const { student, form, has_pin, profile } = detail;

    const renderRow = (label: string, value: string | null | undefined, mono = false) => (
      <tr key={label} className="border-b border-slate-200 last:border-b-0">
        <th className="w-56 sm:w-64 py-2 px-3 text-left font-medium text-slate-600 bg-slate-50/70 border-r border-slate-200 text-xs">
          {label}
        </th>
        <td className={`py-2 px-3 text-slate-900 text-xs sm:text-sm ${mono ? 'font-mono tabular-nums' : ''}`}>
          {value && String(value).trim() ? value : '-'}
        </td>
      </tr>
    );

    return (
      <div className="space-y-4">
        {error && (
          <div className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Bar (hidden on print) */}
        <div className="no-print bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#1677FF] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Daftar Formulir
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {form && (
                <>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border ${
                      has_pin
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {has_pin ? (
                      <>
                        <Lock className="h-3.5 w-3.5 text-emerald-600" />
                        PIN Aktif
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5 text-amber-600" />
                        PIN Belum Ditetapkan
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      openResetPinModal({
                        studentId: student.id,
                        namaLengkap: student.nama_lengkap,
                        nisn: student.nisn,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset PIN
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] transition-colors whitespace-nowrap"
              >
                <Printer className="h-4 w-4" />
                Cetak Ringkasan (Browser)
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={downloadingPdf !== null}
                onClick={() =>
                  handleDownloadStudentPdf(
                    student.id,
                    student.nisn,
                    'pernyataan-diterima',
                    'Surat_Pernyataan_Diterima'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {downloadingPdf === 'pernyataan-diterima' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                PDF Pernyataan Diterima
              </button>

              <button
                type="button"
                disabled={downloadingPdf !== null}
                onClick={() =>
                  handleDownloadStudentPdf(
                    student.id,
                    student.nisn,
                    'pemanggilan-daftar-ulang',
                    'Surat_Pemanggilan_Daftar_Ulang'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF] disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {downloadingPdf === 'pemanggilan-daftar-ulang' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                PDF Pemanggilan
              </button>

              {form && (
                <>
                  <button
                    type="button"
                    disabled={downloadingPdf !== null}
                    onClick={() =>
                      handleDownloadStudentPdf(
                        student.id,
                        student.nisn,
                        'pernyataan-pdb',
                        'Surat_Pernyataan_PDB'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {downloadingPdf === 'pernyataan-pdb' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF Pernyataan PDB
                  </button>

                  <button
                    type="button"
                    disabled={downloadingPdf !== null}
                    onClick={() =>
                      handleDownloadStudentPdf(
                        student.id,
                        student.nisn,
                        'formulir-pdb',
                        'Formulir_PDB'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {downloadingPdf === 'formulir-pdb' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    PDF Formulir PDB
                  </button>
                </>
              )}
            </div>

            {form && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-medium whitespace-nowrap">Penanda Tangan PDF:</span>
                <select
                  value={pdfSigner}
                  onChange={(e) => setPdfSigner(e.target.value as 'AYAH' | 'IBU' | 'WALI')}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-[#1677FF] focus:outline-none"
                >
                  <option value="AYAH">Ayah{form.ayah_nama ? ` (${form.ayah_nama})` : ''}</option>
                  <option value="IBU">Ibu{form.ibu_nama ? ` (${form.ibu_nama})` : ''}</option>
                  <option value="WALI" disabled={!form.wali_nama?.trim()}>
                    Wali{form.wali_nama ? ` (${form.wali_nama})` : ' (tidak diisi)'}
                  </option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Printable Formal A4 Sheet */}
        <div className="print-container bg-white border border-slate-200 rounded-lg p-6 sm:p-10 space-y-6">
          <SchoolLetterhead
            profile={profile}
            subtitle="Lembar Formulir Daftar Ulang Peserta Didik Baru"
          />

          <div className="text-center space-y-1">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 uppercase">
              Formulir Daftar Ulang Calon Peserta Didik Baru
            </h2>
            <p className="text-xs text-slate-600">
              Tahun Pelajaran {profile.academic_year}
              {profile.sk_number ? ` · SK No. ${profile.sk_number}` : ''}
            </p>
          </div>

          {/* Data Seleksi */}
          <div className="print-break-inside-avoid space-y-2">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#0B2447]">
              Identitas Kelulusan Seleksi
            </h3>
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <table className="w-full border-collapse">
                <tbody>
                  {renderRow('No. Urut / No. Pendaftaran', `${student.no_urut} / ${student.no_pendaftaran}`, true)}
                  {renderRow('NISN', student.nisn, true)}
                  {renderRow('Nama Lengkap (Seleksi)', student.nama_lengkap)}
                  {renderRow('Asal Sekolah', student.asal_sekolah)}
                  {renderRow('Jalur Pendaftaran', student.jalur_pendaftaran)}
                  {renderRow('Status Seleksi', student.status)}
                </tbody>
              </table>
            </div>
          </div>

          {!form ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Peserta didik ini belum mengisi formulir daftar ulang daring.
            </div>
          ) : (
            <>
              {/* Tahap 1 */}
              <div className="print-break-inside-avoid space-y-2">
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#0B2447]">
                  I. Data Pribadi Peserta Didik
                </h3>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full border-collapse">
                    <tbody>
                      {renderRow('Nama Lengkap', form.nama_lengkap)}
                      {renderRow('Jenis Kelamin', form.jenis_kelamin)}
                      {renderRow('NIS', form.nis, true)}
                      {renderRow('NIK', form.nik, true)}
                      {renderRow('Nomor Kartu Keluarga', form.no_kk, true)}
                      {renderRow(
                        'Tempat, Tanggal Lahir',
                        `${form.tempat_lahir}, ${formatIndonesianDate(form.tanggal_lahir)}`
                      )}
                      {renderRow('No. Registrasi Akta Lahir', form.no_akta_lahir, true)}
                      {renderRow('Agama', form.agama)}
                      {renderRow('Kewarganegaraan', form.kewarganegaraan)}
                      {renderRow('Alamat Jalan', form.alamat_jalan)}
                      {renderRow('RT / RW', `RT ${form.rt} / RW ${form.rw}`, true)}
                      {renderRow('Dusun', form.dusun)}
                      {renderRow('Desa / Kelurahan', form.desa_kelurahan)}
                      {renderRow('Kecamatan', form.kecamatan)}
                      {renderRow('Kabupaten / Kota', form.kabupaten_kota)}
                      {renderRow('Provinsi', form.provinsi)}
                      {renderRow('Kode Pos', form.kode_pos, true)}
                      {renderRow('Tinggal Bersama', form.tinggal_bersama)}
                      {renderRow('Moda Transportasi', form.moda_transportasi)}
                      {renderRow('Anak Ke-', form.anak_ke, true)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tahap 2 */}
              <div className="print-break-inside-avoid space-y-2">
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#0B2447]">
                  II. Data Orang Tua / Wali & Kontak
                </h3>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full border-collapse">
                    <tbody>
                      {renderRow('Nama Ayah', form.ayah_nama)}
                      {renderRow(
                        'Tempat, Tanggal Lahir Ayah',
                        `${form.ayah_tempat_lahir}, ${formatIndonesianDate(form.ayah_tanggal_lahir)}`
                      )}
                      {renderRow('Pendidikan Ayah', form.ayah_pendidikan)}
                      {renderRow('Pekerjaan Ayah', form.ayah_pekerjaan)}

                      {renderRow('Nama Ibu', form.ibu_nama)}
                      {renderRow(
                        'Tempat, Tanggal Lahir Ibu',
                        `${form.ibu_tempat_lahir}, ${formatIndonesianDate(form.ibu_tanggal_lahir)}`
                      )}
                      {renderRow('Pendidikan Ibu', form.ibu_pendidikan)}
                      {renderRow('Pekerjaan Ibu', form.ibu_pekerjaan)}

                      {form.wali_nama && (
                        <>
                          {renderRow('Nama Wali', form.wali_nama)}
                          {renderRow(
                            'Tempat, Tanggal Lahir Wali',
                            form.wali_tempat_lahir || form.wali_tanggal_lahir
                              ? `${form.wali_tempat_lahir || '-'}, ${formatIndonesianDate(form.wali_tanggal_lahir)}`
                              : '-'
                          )}
                          {renderRow('Pendidikan Wali', form.wali_pendidikan)}
                          {renderRow('Pekerjaan Wali', form.wali_pekerjaan)}
                        </>
                      )}

                      {renderRow('Nomor HP (WhatsApp)', form.no_hp_wa, true)}
                      {renderRow('Email', form.email)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tahap 3 */}
              <div className="print-break-inside-avoid space-y-2">
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#0B2447]">
                  III. Data Periodik & Riwayat Sekolah
                </h3>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full border-collapse">
                    <tbody>
                      {renderRow('Tinggi Badan', `${form.tinggi_badan} cm`, true)}
                      {renderRow('Berat Badan', `${form.berat_badan} kg`, true)}
                      {renderRow('Lingkar Kepala', `${form.lingkar_kepala} cm`, true)}
                      {renderRow(
                        'Jarak Tempat Tinggal ke Sekolah',
                        form.jarak_km
                          ? `${form.jarak_kategori} (${form.jarak_km} km)`
                          : form.jarak_kategori
                      )}
                      {renderRow('Jumlah Saudara Kandung', form.jumlah_saudara, true)}
                      {renderRow('Asal SMP / MTs', form.asal_smp)}
                      {renderRow('No. Seri Ijazah SMP', form.no_seri_ijazah, true)}
                      {renderRow('Nilai TKA (Tes Kemampuan Akademik)', form.nilai_tka, true)}
                      {renderRow(
                        'Nilai Rata-Rata Semester 1 s.d. 5',
                        form.nilai_sem_1 || form.nilai_sem_2 || form.nilai_sem_3 || form.nilai_sem_4 || form.nilai_sem_5
                          ? `Sem 1: ${form.nilai_sem_1 || '-'}  ·  Sem 2: ${form.nilai_sem_2 || '-'}  ·  Sem 3: ${form.nilai_sem_3 || '-'}  ·  Sem 4: ${form.nilai_sem_4 || '-'}  ·  Sem 5: ${form.nilai_sem_5 || '-'}`
                          : '-',
                        true
                      )}
                      {renderRow('Jumlah Nilai (Semester 1–5)', form.jumlah_nilai, true)}
                      {renderRow('Waktu Pengisian Terakhir', formatDateTimeWib(form.updated_at), true)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Formal Signature Area for Print */}
              <div className="print-break-inside-avoid pt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-800">
                <div className="space-y-16">
                  <p>Orang Tua / Wali Peserta Didik,</p>
                  <p className="font-semibold border-t border-slate-400 inline-block pt-1 px-8">
                    {form.ayah_nama || form.ibu_nama || '........................................'}
                  </p>
                </div>
                <div className="space-y-16">
                  <p>Calon Peserta Didik Baru,</p>
                  <p className="font-semibold border-t border-slate-400 inline-block pt-1 px-8">
                    {form.nama_lengkap}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        {resetPinModal}
      </div>
    );
  }

  const submittedItems = items.filter((i) => i.has_form);
  const submittedCount = submittedItems.length;
  const allSubmittedSelected =
    submittedItems.length > 0 && submittedItems.every((i) => selectedFormIds.has(i.student_id));

  const toggleSelectAllForms = () => {
    if (allSubmittedSelected) {
      setSelectedFormIds(new Set());
    } else {
      setSelectedFormIds(new Set(submittedItems.map((i) => i.student_id)));
    }
  };

  const toggleSelectOneForm = (studentId: number) => {
    setSelectedFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const handleBulkDeleteForms = async () => {
    const studentIds = Array.from(selectedFormIds);
    if (studentIds.length === 0) return;
    setDeletingForms(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiFetch<{ message: string; deleted_count: number }>(
        '/api/admin/forms/bulk-delete',
        { method: 'POST', body: JSON.stringify({ student_ids: studentIds }) },
        true
      );
      setSuccessMsg(res.message);
      setSelectedFormIds(new Set());
      setBulkDeleteOpen(false);
      fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus formulir terpilih.');
    } finally {
      setDeletingForms(false);
    }
  };

  const handleSingleDeleteForm = async () => {
    if (!singleDeleteTarget) return;
    setDeletingForms(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/api/admin/forms/${singleDeleteTarget.student_id}`,
        { method: 'DELETE' },
        true
      );
      setSuccessMsg(res.message);
      setSingleDeleteTarget(null);
      setSelectedFormIds((prev) => {
        const next = new Set(prev);
        next.delete(singleDeleteTarget.student_id);
        return next;
      });
      fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus data formulir.');
    } finally {
      setDeletingForms(false);
    }
  };

  return (
    <div className="space-y-5">
      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari siswa diterima (nama, NISN, asal sekolah)..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
            />
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0">
            {(
              [
                { key: 'ALL', label: 'Semua Diterima' },
                { key: 'SUBMITTED', label: 'Sudah Mengisi' },
                { key: 'PENDING', label: 'Belum Mengisi' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={exporting}
          onClick={handleExportExcel}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5" />
          )}
          Ekspor Rekap Excel (.xlsx)
        </button>
      </div>

      {/* Contextual Bulk Delete Bar */}
      {selectedFormIds.size > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium text-red-900">
            <strong className="font-mono tabular-nums">{selectedFormIds.size}</strong> formulir
            siswa dipilih
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedFormIds(new Set())}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Batal Pilih
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus {selectedFormIds.size} Formulir Terpilih
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading || loadingDetail ? (
          <div className="py-12 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
            {loadingDetail ? 'Memuat detail formulir siswa...' : 'Memuat data formulir...'}
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 px-6 text-center text-sm text-slate-500">
            Tidak ada siswa diterima yang sesuai dengan filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSubmittedSelected}
                      disabled={submittedItems.length === 0}
                      onChange={toggleSelectAllForms}
                      aria-label="Pilih semua formulir yang sudah diisi"
                      className="h-4 w-4 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF] disabled:opacity-40"
                    />
                  </th>
                  <th className="py-3 px-4 w-20">No Urut</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">NISN</th>
                  <th className="py-3 px-4">Jalur</th>
                  <th className="py-3 px-4">Status Formulir</th>
                  <th className="py-3 px-4">No. HP / WA</th>
                  <th className="py-3 px-4">Diperbarui</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => {
                  const isSelected = selectedFormIds.has(row.student_id);
                  return (
                  <tr
                    key={row.student_id}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!row.has_form}
                        onChange={() => toggleSelectOneForm(row.student_id)}
                        aria-label={`Pilih formulir ${row.nama_lengkap}`}
                        className="h-4 w-4 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF] disabled:opacity-30"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                      {row.no_urut}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{row.nama_lengkap}</p>
                      <p className="text-xs text-slate-500">{row.asal_sekolah}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                      {row.nisn}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {row.jalur_pendaftaran}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <span
                          className={`block text-xs font-semibold ${
                            row.has_form ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {row.has_form ? 'Sudah Mengisi' : 'Belum Mengisi'}
                        </span>
                        {row.has_form && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                              row.has_pin ? 'text-slate-500' : 'text-amber-700'
                            }`}
                          >
                            {row.has_pin ? (
                              <>
                                <Lock className="h-3 w-3 text-emerald-600" />
                                PIN Aktif
                              </>
                            ) : (
                              <>
                                <Unlock className="h-3 w-3 text-amber-600" />
                                PIN Direset
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums">
                      {row.no_hp_wa || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDateTimeWib(row.form_updated_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {row.has_form && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                openResetPinModal({
                                  studentId: row.student_id,
                                  namaLengkap: row.nama_lengkap,
                                  nisn: row.nisn,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                              title="Reset PIN keamanan siswa"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Reset PIN
                            </button>
                            <button
                              type="button"
                              onClick={() => setSingleDeleteTarget(row)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Hapus isian formulir & PIN (data siswa tetap ada)"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openDetail(row.student_id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1677FF] hover:text-[#1677FF] transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detail & Cetak
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Total ditampilkan: <strong className="font-mono text-slate-800">{items.length}</strong> · Sudah mengisi:{' '}
            <strong className="font-mono text-emerald-700">{submittedCount}</strong>
          </span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1 text-[#1677FF] hover:underline font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Excel
          </button>
        </div>
      </div>

      {resetPinModal}

      {/* Single Form Delete Confirmation Modal */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Hapus Isian Formulir Siswa?
            </h3>
            <p className="text-sm text-slate-600">
              Isian formulir daftar ulang dan PIN milik{' '}
              <strong>{singleDeleteTarget.nama_lengkap}</strong> (NISN{' '}
              <span className="font-mono">{singleDeleteTarget.nisn}</span>) akan dihapus. Data induk
              kelulusan siswa tetap dipertahankan sehingga siswa dapat mengisi ulang formulir dari
              awal.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingForms}
                onClick={() => setSingleDeleteTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingForms}
                onClick={handleSingleDeleteForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingForms && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ya, Hapus Formulir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Form Delete Confirmation Modal */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Hapus {selectedFormIds.size} Formulir Terpilih?
            </h3>
            <p className="text-sm text-slate-600">
              Sebanyak <strong className="font-mono">{selectedFormIds.size}</strong> isian formulir
              daftar ulang beserta PIN siswanya akan dihapus permanen. Data induk siswa pada menu{' '}
              <strong>Data Siswa</strong> tetap aman dan tidak ikut terhapus.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingForms}
                onClick={() => setBulkDeleteOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingForms}
                onClick={handleBulkDeleteForms}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingForms && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ya, Hapus {selectedFormIds.size} Formulir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
