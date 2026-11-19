import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Unlock,
  UserCheck,
} from 'lucide-react';
import {
  apiFetch,
  downloadFileWithBearer,
  formatDateTimeWib,
  formatFileSize,
  formatIndonesianDate,
} from '../../lib/api';
import type { CheckNisnResponse, FormSignersSummary, PublicConfigResponse } from '../../types';
import { SchoolLetterhead, SchoolLogo } from '../SchoolHeader';
import { StudentFormWizard } from './StudentFormWizard';
import type { FormSavedPayload } from './StudentFormWizard';

type PublicView = 'search' | 'result' | 'form';
type SignerChoice = 'ayah' | 'ibu' | 'wali';

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  remainingMs: number;
}

function calcCountdown(targetMs: number, currentServerMs: number): CountdownParts {
  const remainingMs = Math.max(0, targetMs - currentServerMs);
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, remainingMs };
}

export function PublicPortal() {
  const [config, setConfig] = useState<PublicConfigResponse | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [countdown, setCountdown] = useState<CountdownParts>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    remainingMs: 0,
  });

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState('');

  const [view, setView] = useState<PublicView>('search');
  const [nisnInput, setNisnInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [result, setResult] = useState<CheckNisnResponse | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState('');
  const [selectedSigner, setSelectedSigner] = useState<SignerChoice>('ayah');

  // Student PIN session state (stored in memory only for shared-device safety)
  const [studentToken, setStudentToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiFetch<PublicConfigResponse>('/api/public/config');
      const offset = data.server_now_ms - Date.now();
      setServerOffsetMs(offset);
      setConfig(data);
      setCountdown(calcCountdown(data.announcement_timestamp_ms, data.server_now_ms));
      setConfigError('');
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Gagal memuat konfigurasi pengumuman.');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Countdown tick synchronized with server clock offset
  useEffect(() => {
    if (!config || config.is_open) return;

    const timer = window.setInterval(() => {
      const estimatedServerNow = Date.now() + serverOffsetMs;
      const next = calcCountdown(config.announcement_timestamp_ms, estimatedServerNow);
      setCountdown(next);
      if (next.remainingMs <= 0) {
        window.clearInterval(timer);
        loadConfig();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [config, serverOffsetMs, loadConfig]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nisnInput.trim();
    if (!cleaned) {
      setSearchError('Masukkan nomor NISN Anda terlebih dahulu.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSaveSuccessNotice('');
    setPinError('');
    setPdfError('');
    setPinInput('');
    setPinConfirmInput('');
    setStudentToken(null);

    try {
      const data = await apiFetch<CheckNisnResponse>('/api/public/check-nisn', {
        method: 'POST',
        body: JSON.stringify({ nisn: cleaned }),
      });
      setResult(data);
      setSelectedSigner('ayah');
      setView('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Gagal memeriksa hasil seleksi.');
    } finally {
      setSearching(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    const cleaned = pinInput.trim();
    if (!/^\d{6}$/.test(cleaned)) {
      setPinError('Masukkan tepat 6 digit angka PIN keamanan Anda.');
      return;
    }

    setPinSubmitting(true);
    setPinError('');
    setPdfError('');
    try {
      const res = await apiFetch<{
        message: string;
        student_token: string;
        form_signers: FormSignersSummary;
      }>('/api/public/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ nisn: result.student.nisn, pin: cleaned }),
      });
      setStudentToken(res.student_token);
      setPinInput('');
      setResult((prev) =>
        prev
          ? {
              ...prev,
              has_pin: true,
              form_signers: res.form_signers,
            }
          : prev
      );
      if (!res.form_signers.ayah_nama && res.form_signers.ibu_nama) {
        setSelectedSigner('ibu');
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'PIN keamanan tidak sesuai.');
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleSetNewPinAfterReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    const cleaned = pinInput.trim();
    const confirmed = pinConfirmInput.trim();
    if (!/^\d{6}$/.test(cleaned)) {
      setPinError('PIN baru harus terdiri dari tepat 6 digit angka.');
      return;
    }
    if (cleaned !== confirmed) {
      setPinError('Konfirmasi PIN baru tidak cocok.');
      return;
    }

    setPinSubmitting(true);
    setPinError('');
    setPdfError('');
    try {
      const res = await apiFetch<{
        message: string;
        student_token: string;
        form_signers: FormSignersSummary;
      }>('/api/public/set-pin', {
        method: 'POST',
        body: JSON.stringify({ nisn: result.student.nisn, pin: cleaned }),
      });
      setStudentToken(res.student_token);
      setPinInput('');
      setPinConfirmInput('');
      setResult((prev) =>
        prev
          ? {
              ...prev,
              has_pin: true,
              form_signers: res.form_signers,
            }
          : prev
      );
      setSaveSuccessNotice(
        'PIN keamanan baru Anda telah aktif. Anda kini dapat mengedit formulir dan mengunduh berkas PDF pribadi Anda.'
      );
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Gagal membuat PIN baru.');
    } finally {
      setPinSubmitting(false);
    }
  };

  const handleDownloadProtectedPdf = async (
    docType: 'pernyataan-pdb' | 'formulir-pdb',
    filenamePrefix: string
  ) => {
    if (!result || !studentToken) return;
    setDownloadingPdf(docType);
    setPdfError('');
    try {
      const url = `/api/public/pdf/${encodeURIComponent(result.student.nisn)}/${docType}?signer=${selectedSigner}`;
      await downloadFileWithBearer(url, studentToken, `${filenamePrefix}_${result.student.nisn}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengunduh berkas PDF.';
      setPdfError(message);
      if (message.toLowerCase().includes('pin') || message.toLowerCase().includes('sesi')) {
        setStudentToken(null);
      }
    } finally {
      setDownloadingPdf(null);
    }
  };

  const handleFormSaved = async (payload: FormSavedPayload) => {
    if (!result) return;
    setStudentToken(payload.studentToken);
    try {
      const refreshed = await apiFetch<CheckNisnResponse>('/api/public/check-nisn', {
        method: 'POST',
        headers: { Authorization: `Bearer ${payload.studentToken}` },
        body: JSON.stringify({ nisn: result.student.nisn }),
      });
      setResult({
        ...refreshed,
        has_form: true,
        has_pin: true,
        form_signers: refreshed.form_signers || payload.formSigners,
      });
      if (selectedSigner === 'wali' && !(refreshed.form_signers?.wali_nama || payload.formSigners.wali_nama)?.trim()) {
        setSelectedSigner('ayah');
      }
    } catch {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              has_form: true,
              has_pin: true,
              form_signers: payload.formSigners,
            }
          : prev
      );
    }
    setSaveSuccessNotice(
      `${payload.message} Simpan PIN 6 digit Anda untuk membuka kembali formulir dan berkas PDF pribadi di kunjungan berikutnya.`
    );
    setView('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLockSession = () => {
    setStudentToken(null);
    setPinInput('');
    setPinConfirmInput('');
    setPinError('');
    setPdfError('');
    setSaveSuccessNotice('');
    setResult((prev) => (prev ? { ...prev, form_signers: null } : prev));
  };

  const handleResetSearch = () => {
    setView('search');
    setResult(null);
    setStudentToken(null);
    setSearchError('');
    setSaveSuccessNotice('');
    setPinInput('');
    setPinConfirmInput('');
    setPinError('');
    setPdfError('');
    setNisnInput('');
  };

  const profile = config?.profile;
  const hasWaliName = Boolean(result?.form_signers?.wali_nama?.trim());
  const isPrivateUnlocked = Boolean(studentToken);

  const selectedSignerName =
    selectedSigner === 'ibu'
      ? result?.form_signers?.ibu_nama
      : selectedSigner === 'wali'
        ? result?.form_signers?.wali_nama
        : result?.form_signers?.ayah_nama;

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA] text-slate-900">
      {/* Clean Formal Academic Top Bar (No Admin Login link — Admin types /admin manually) */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleResetSearch}
            className="flex items-center gap-3 text-left min-w-0 group"
          >
            <SchoolLogo
              src={profile?.logo_path}
              schoolName={profile?.school_name || 'SPMB'}
              size="sm"
            />
            <span className="font-display font-bold text-sm sm:text-base text-[#0B2447] truncate group-hover:text-[#1E3A8A] transition-colors">
              {profile?.school_name || 'Sistem Pengumuman SPMB'}
            </span>
          </button>

          <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap shrink-0">
            Tahun Pelajaran {profile?.academic_year || '2026/2027'}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-8 sm:py-12 px-4 sm:px-6">
        {loadingConfig ? (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-[#0B2447]" />
            <p className="text-sm">Memuat informasi pengumuman seleksi...</p>
          </div>
        ) : configError || !config || !profile ? (
          <div className="max-w-xl mx-auto bg-white border border-red-200 rounded-xl p-8 text-center space-y-4">
            <AlertCircle className="h-8 w-8 text-red-600 mx-auto" />
            <p className="text-sm text-red-700">{configError || 'Konfigurasi tidak tersedia.'}</p>
            <button
              type="button"
              onClick={loadConfig}
              className="inline-flex items-center justify-center rounded-lg bg-[#0B2447] px-4 py-2 text-sm font-medium text-white hover:bg-[#133666]"
            >
              Muat Ulang
            </button>
          </div>
        ) : view === 'search' ? (
          <div className="max-w-2xl mx-auto">
            {/* Formal Institutional Main Card (SK No removed from initial screen) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Deep Navy Academic Header Band */}
              <div className="bg-[#0B2447] text-white px-6 sm:px-10 py-8 sm:py-10 text-center">
                <div className="flex justify-center mb-5">
                  <div className="p-2 bg-white rounded-xl shadow-sm">
                    <SchoolLogo
                      src={profile.logo_path}
                      schoolName={profile.school_name}
                      size="lg"
                    />
                  </div>
                </div>
                <p className="text-xs font-medium tracking-widest text-blue-200 uppercase mb-2">
                  {profile.app_name}
                </p>
                <h1
                  className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white"
                  style={{ textWrap: 'balance' }}
                >
                  {profile.school_name}
                </h1>
                <p className="mt-3 text-xs sm:text-sm text-blue-100/90">
                  Tahun Pelajaran {profile.academic_year}
                </p>
              </div>

              {/* Dynamic Schedule Body */}
              <div className="p-6 sm:p-10">
                {!config.is_open ? (
                  <div className="text-center space-y-6">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 text-[#0B2447] mx-auto">
                      <CalendarClock className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                        Pengumuman Seleksi Belum Dibuka
                      </h2>
                      <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                        Hasil seleksi akan dibuka secara otomatis pada{' '}
                        <span className="font-semibold text-slate-900">
                          {formatIndonesianDate(profile.announcement_date)}
                        </span>{' '}
                        pukul{' '}
                        <span className="font-semibold font-mono text-slate-900">
                          {profile.announcement_time} WIB
                        </span>
                        .
                      </p>
                    </div>

                    {/* Tabular Countdown Grid */}
                    <div className="grid grid-cols-4 gap-2.5 sm:gap-4 max-w-md mx-auto pt-2">
                      {[
                        { label: 'Hari', value: countdown.days },
                        { label: 'Jam', value: countdown.hours },
                        { label: 'Menit', value: countdown.minutes },
                        { label: 'Detik', value: countdown.seconds },
                      ].map((unit) => (
                        <div
                          key={unit.label}
                          className="rounded-lg border border-slate-200 bg-slate-50 py-3.5 px-2"
                        >
                          <div className="font-mono text-2xl sm:text-3xl font-bold text-[#0B2447] tabular-nums">
                            {String(unit.value).padStart(2, '0')}
                          </div>
                          <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-1">
                            {unit.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <Lock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Halaman pencarian NISN akan aktif otomatis saat waktu tiba.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                      <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Pengumuman Hasil Seleksi Telah Dibuka</p>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          Masukkan Nomor Induk Siswa Nasional (NISN) untuk memeriksa status
                          kelulusan Anda.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleSearch} className="space-y-4">
                      <div>
                        <label
                          htmlFor="nisn-input"
                          className="block text-sm font-semibold text-slate-800 mb-2"
                        >
                          Nomor Induk Siswa Nasional (NISN)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            id="nisn-input"
                            type="text"
                            inputMode="numeric"
                            value={nisnInput}
                            onChange={(e) => {
                              setNisnInput(e.target.value);
                              if (searchError) setSearchError('');
                            }}
                            placeholder="Masukkan 10 digit NISN Anda"
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-mono text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#0B2447] focus:outline-none focus:ring-2 focus:ring-[#0B2447]/15"
                            autoComplete="off"
                          />
                          <button
                            type="submit"
                            disabled={searching}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2447] px-6 py-3 text-sm font-semibold text-white hover:bg-[#133666] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                          >
                            {searching ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Memeriksa...
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4" />
                                Cek Hasil
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {searchError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2.5">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                          <span>{searchError}</span>
                        </div>
                      )}
                    </form>

                    <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-start gap-2">
                      <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        Pastikan nomor NISN sesuai dengan yang tercantum pada bukti pendaftaran
                        SPMB. Peserta didik yang dinyatakan diterima wajib mengisi formulir daftar
                        ulang daring dan membuat PIN keamanan pribadi.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : view === 'result' && result ? (
          <div className="max-w-3xl mx-auto">
            <div className="mb-5">
              <button
                type="button"
                onClick={handleResetSearch}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B2447] transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Pencarian NISN
              </button>
            </div>

            {saveSuccessNotice && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">Berhasil Disimpan</p>
                  <p className="text-emerald-800 text-xs sm:text-sm">{saveSuccessNotice}</p>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
              <SchoolLetterhead profile={profile} />

              {/* Title + Nomor SK + Editable SK Decision Detail */}
              <div className="text-center space-y-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#0B2447] uppercase tracking-tight">
                  Pengumuman Hasil Seleksi SPMB
                </h2>
                {profile.sk_number && (
                  <p className="text-xs sm:text-sm text-slate-600">
                    Nomor SK:{' '}
                    <span className="font-mono font-medium text-slate-800">
                      {profile.sk_number}
                    </span>
                  </p>
                )}
              </div>

              {profile.sk_detail && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line text-justify">
                  {profile.sk_detail}
                </div>
              )}

              {/* Status Banner */}
              {result.student.status === 'DITERIMA' ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-6 py-6 text-center space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
                    Status Kelulusan Seleksi
                  </p>
                  <div className="inline-flex items-center justify-center gap-2.5 text-emerald-800">
                    <CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-700" />
                    <span className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                      DITERIMA
                    </span>
                  </div>
                  <p className="text-sm text-emerald-900 max-w-lg mx-auto">
                    Selamat! Anda dinyatakan diterima sebagai calon peserta didik baru{' '}
                    <strong>{profile.school_name}</strong> Tahun Pelajaran {profile.academic_year}.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-300 bg-slate-50 px-6 py-6 text-center space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Status Kelulusan Seleksi
                  </p>
                  <div className="font-display text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                    TIDAK DITERIMA
                  </div>
                  <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    Mohon maaf, berdasarkan hasil seleksi SPMB {profile.school_name} Tahun Pelajaran{' '}
                    {profile.academic_year}, Anda belum dapat diterima pada tahap ini. Tetap
                    semangat dan teruslah meraih prestasi di kesempatan pendidikan berikutnya.
                  </p>
                </div>
              )}

              {/* Compact Student Data Table */}
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm border-collapse">
                  <tbody className="divide-y divide-slate-200">
                    {[
                      { label: 'No. Urut', value: result.student.no_urut, mono: true },
                      {
                        label: 'No. Pendaftaran',
                        value: result.student.no_pendaftaran,
                        mono: true,
                      },
                      { label: 'Nama Lengkap', value: result.student.nama_lengkap, bold: true },
                      { label: 'NISN', value: result.student.nisn, mono: true },
                      { label: 'Asal Sekolah', value: result.student.asal_sekolah },
                      { label: 'Jalur Pendaftaran', value: result.student.jalur_pendaftaran },
                    ].map((row) => (
                      <tr key={row.label} className="bg-white">
                        <th className="w-40 sm:w-52 px-4 py-3 text-left font-medium text-slate-500 bg-slate-50/70 border-r border-slate-200">
                          {row.label}
                        </th>
                        <td
                          className={`px-4 py-3 text-slate-900 ${row.mono ? 'font-mono tabular-nums' : ''} ${
                            row.bold ? 'font-semibold text-base' : ''
                          }`}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions for DITERIMA */}
              {result.student.status === 'DITERIMA' ? (
                <div className="space-y-6 pt-2">
                  {/* Step 1: Formulir Daftar Ulang + PIN Security Gate + Post-Submission PDFs */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="font-display text-base font-bold text-slate-900">
                          1. Formulir Daftar Ulang Peserta Didik
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600">
                          {result.has_form
                            ? `Formulir telah diisi dan tersimpan${result.form_updated_at ? ` (${formatDateTimeWib(result.form_updated_at)})` : ''}.`
                            : 'Wajib melengkapi formulir 3 tahap dan membuat PIN keamanan 6 digit untuk mengunduh berkas daftar ulang.'}
                        </p>
                      </div>

                      {!result.has_form && (
                        <button
                          type="button"
                          onClick={() => {
                            setSaveSuccessNotice('');
                            setView('form');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2447] px-5 py-3 text-sm font-semibold text-white hover:bg-[#133666] transition-colors whitespace-nowrap shrink-0"
                        >
                          <ClipboardList className="h-4 w-4" />
                          Isi Formulir Daftar Ulang
                        </button>
                      )}

                      {result.has_form && isPrivateUnlocked && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSaveSuccessNotice('');
                              setView('form');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            Edit Formulir
                          </button>
                          <button
                            type="button"
                            onClick={handleLockSession}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap"
                            title="Kunci kembali akses formulir dan berkas PDF pribadi"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Kunci
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Case A: Form exists + PIN active + NOT unlocked yet -> PIN Verification Gate */}
                    {result.has_form && !isPrivateUnlocked && result.has_pin && (
                      <form
                        onSubmit={handleVerifyPin}
                        className="border-t border-slate-200 pt-5 space-y-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-lg bg-[#0B2447] text-white flex items-center justify-center shrink-0 mt-0.5">
                            <Lock className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#0B2447]">
                              Data Pribadi & Berkas Formulir Dilindungi PIN
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                              Masukkan <strong>PIN 6 digit</strong> yang Anda buat saat mengisi
                              formulir untuk membuka akses edit formulir serta mengunduh{' '}
                              <em>Surat Pernyataan PDB</em> dan <em>Formulir PDB</em>.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <div className="relative flex-1 max-w-xs">
                            <input
                              type={showPinInput ? 'text' : 'password'}
                              inputMode="numeric"
                              maxLength={6}
                              value={pinInput}
                              onChange={(e) => {
                                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                                if (pinError) setPinError('');
                              }}
                              placeholder="Masukkan 6 digit PIN"
                              className="w-full rounded-lg border border-slate-300 bg-white pl-4 pr-10 py-2.5 text-sm font-mono tracking-[0.25em] text-slate-900 placeholder:font-sans placeholder:tracking-normal focus:border-[#0B2447] focus:outline-none focus:ring-2 focus:ring-[#0B2447]/15"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPinInput((s) => !s)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                              aria-label="Tampilkan atau sembunyikan PIN"
                            >
                              {showPinInput ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          <button
                            type="submit"
                            disabled={pinSubmitting}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2447] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#133666] disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            {pinSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Memverifikasi...
                              </>
                            ) : (
                              <>
                                <Unlock className="h-4 w-4" />
                                Buka Akses
                              </>
                            )}
                          </button>
                        </div>

                        {pinError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                            <span>{pinError}</span>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500">
                          Lupa PIN keamanan Anda? Hubungi Panitia SPMB {profile.school_name} untuk
                          melakukan reset PIN.
                        </p>
                      </form>
                    )}

                    {/* Case B: Form exists + PIN was cleared/reset by Admin -> Create New 6-Digit PIN */}
                    {result.has_form && !isPrivateUnlocked && !result.has_pin && (
                      <form
                        onSubmit={handleSetNewPinAfterReset}
                        className="border-t border-slate-200 pt-5 space-y-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                            <KeyRound className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Buat PIN Keamanan Baru (6 Digit)
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                              PIN keamanan formulir Anda telah direset oleh panitia (atau belum
                              diatur). Buat PIN baru 6 digit angka untuk membuka kembali data
                              formulir dan mengunduh berkas PDF Anda.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                          <input
                            type={showPinInput ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={6}
                            value={pinInput}
                            onChange={(e) => {
                              setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                              if (pinError) setPinError('');
                            }}
                            placeholder="PIN Baru (6 digit)"
                            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono tracking-[0.25em] text-center text-slate-900 placeholder:font-sans placeholder:tracking-normal focus:border-[#0B2447] focus:outline-none focus:ring-2 focus:ring-[#0B2447]/15"
                            autoComplete="new-password"
                          />
                          <input
                            type={showPinInput ? 'text' : 'password'}
                            inputMode="numeric"
                            maxLength={6}
                            value={pinConfirmInput}
                            onChange={(e) => {
                              setPinConfirmInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                              if (pinError) setPinError('');
                            }}
                            placeholder="Konfirmasi PIN Baru"
                            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono tracking-[0.25em] text-center text-slate-900 placeholder:font-sans placeholder:tracking-normal focus:border-[#0B2447] focus:outline-none focus:ring-2 focus:ring-[#0B2447]/15"
                            autoComplete="new-password"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="submit"
                            disabled={pinSubmitting}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2447] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#133666] disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            {pinSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Mengaktifkan PIN...
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-4 w-4" />
                                Simpan PIN Baru & Buka Akses
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowPinInput((s) => !s)}
                            className="text-xs font-medium text-slate-600 hover:text-[#0B2447]"
                          >
                            {showPinInput ? 'Sembunyikan angka' : 'Tampilkan angka'}
                          </button>
                        </div>

                        {pinError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                            <span>{pinError}</span>
                          </div>
                        )}
                      </form>
                    )}

                    {/* Case C: Unlocked with verified student session -> Signer Picker + Secure PDF Downloads */}
                    {result.has_form && isPrivateUnlocked && (
                      <div className="border-t border-slate-200 pt-5 space-y-4">
                        <div className="flex items-center gap-2 text-xs text-emerald-800 font-medium">
                          <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                          <span>Sesi PIN terverifikasi · Akses edit formulir & berkas pribadi aktif.</span>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <UserCheck className="h-4 w-4 text-[#0B2447]" />
                            <span>Pilih Penandatangan Orang Tua / Wali untuk Berkas PDF:</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                {
                                  key: 'ayah',
                                  label: 'Ayah',
                                  name: result.form_signers?.ayah_nama || '-',
                                  disabled: false,
                                },
                                {
                                  key: 'ibu',
                                  label: 'Ibu',
                                  name: result.form_signers?.ibu_nama || '-',
                                  disabled: false,
                                },
                                {
                                  key: 'wali',
                                  label: 'Wali',
                                  name: hasWaliName
                                    ? result.form_signers?.wali_nama || ''
                                    : 'Belum diisi',
                                  disabled: !hasWaliName,
                                },
                              ] as const
                            ).map((opt) => {
                              const active = selectedSigner === opt.key;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  disabled={opt.disabled}
                                  onClick={() => setSelectedSigner(opt.key)}
                                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                    active
                                      ? 'border-[#0B2447] bg-[#0B2447] text-white'
                                      : opt.disabled
                                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'border-slate-300 bg-white text-slate-800 hover:border-[#0B2447]'
                                  }`}
                                >
                                  <p className="text-xs font-bold">{opt.label}</p>
                                  <p
                                    className={`text-[11px] truncate mt-0.5 ${
                                      active ? 'text-blue-100' : 'text-slate-500'
                                    }`}
                                  >
                                    {opt.name}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Penandatangan terpilih:{' '}
                            <strong className="text-slate-800">
                              {selectedSignerName || '-'}
                            </strong>{' '}
                            (otomatis tercantum pada kolom tanda tangan Orang Tua/Wali).
                          </p>
                        </div>

                        {pdfError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                            <span>{pdfError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            disabled={downloadingPdf !== null}
                            onClick={() =>
                              handleDownloadProtectedPdf(
                                'pernyataan-pdb',
                                'Surat_Pernyataan_Peserta_Didik_Baru'
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B2447] px-4 py-3 text-xs sm:text-sm font-semibold text-white hover:bg-[#133666] disabled:opacity-60 transition-colors text-center"
                          >
                            {downloadingPdf === 'pernyataan-pdb' ? (
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            ) : (
                              <Download className="h-4 w-4 shrink-0" />
                            )}
                            Unduh Surat Pernyataan PDB (PDF)
                          </button>
                          <button
                            type="button"
                            disabled={downloadingPdf !== null}
                            onClick={() =>
                              handleDownloadProtectedPdf(
                                'formulir-pdb',
                                'Formulir_Peserta_Didik_Baru'
                              )
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0B2447] bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-[#0B2447] hover:bg-[#0B2447] hover:text-white disabled:opacity-60 transition-colors text-center"
                          >
                            {downloadingPdf === 'formulir-pdb' ? (
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            ) : (
                              <Download className="h-4 w-4 shrink-0" />
                            )}
                            Unduh Formulir PDB (PDF)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Automatic Official School Letters (with Cap & TTD Kepsek) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                        2. Surat Resmi Kelulusan & Daftar Ulang (PDF)
                      </h3>
                      <span className="text-xs text-slate-500">Otomatis sesuai data siswa</span>
                    </div>

                    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3.5 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 text-[#0B2447] border border-blue-100 flex items-center justify-center shrink-0">
                            <FileCheck2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              Surat Pernyataan Diterima
                            </p>
                            <p className="text-xs text-slate-500">
                              Surat resmi penetapan kelulusan dengan Cap & TTD Kepala Sekolah
                            </p>
                          </div>
                        </div>
                        <a
                          href={`/api/public/pdf/${encodeURIComponent(result.student.nisn)}/pernyataan-diterima`}
                          download
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0B2447] bg-white px-4 py-2 text-xs font-semibold text-[#0B2447] hover:bg-[#0B2447] hover:text-white transition-colors whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Unduh PDF
                        </a>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3.5 hover:bg-slate-50/70 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 text-[#0B2447] border border-blue-100 flex items-center justify-center shrink-0">
                            <FileCheck2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              Surat Pemanggilan Daftar Ulang
                            </p>
                            <p className="text-xs text-slate-500">
                              Memuat jadwal, ruang daftar ulang, dan daftar kelengkapan berkas
                            </p>
                          </div>
                        </div>
                        <a
                          href={`/api/public/pdf/${encodeURIComponent(result.student.nisn)}/pemanggilan-daftar-ulang`}
                          download
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#0B2447] bg-white px-4 py-2 text-xs font-semibold text-[#0B2447] hover:bg-[#0B2447] hover:text-white transition-colors whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Unduh PDF
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Extra Uploaded PDF Attachments (only if Admin uploaded active files) */}
                  {result.documents.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                          Dokumen Lampiran Tambahan (PDF)
                        </h3>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {result.documents.length} berkas
                        </span>
                      </div>
                      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
                        {result.documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3.5 hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-lg bg-red-50 text-red-700 border border-red-100 flex items-center justify-center shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {doc.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  PDF · {formatFileSize(doc.file_size)}
                                </p>
                              </div>
                            </div>
                            <a
                              href={`/api/public/documents/${doc.id}/download`}
                              download
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#0B2447] hover:text-[#0B2447] transition-colors whitespace-nowrap shrink-0"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Unduh PDF
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0B2447] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#133666] transition-colors whitespace-nowrap"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Kembali ke Pencarian NISN
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : view === 'form' && result ? (
          <StudentFormWizard
            profile={profile}
            student={result.student}
            hasExistingForm={result.has_form}
            studentToken={studentToken}
            onBack={() => setView('result')}
            onSaved={handleFormSaved}
            onSessionExpired={() => {
              setStudentToken(null);
              setView('result');
              setPinError('Sesi PIN Anda telah berakhir. Silakan masukkan PIN keamanan kembali.');
            }}
          />
        ) : null}
      </main>

      {/* Clean Public Footer (No Login Admin link) */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {profile?.school_name || 'Panitia SPMB'} · Tahun Pelajaran{' '}
          {profile?.academic_year || '2026/2027'}
        </div>
      </footer>
    </div>
  );
}
