import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, isValidDdMmYyyy, toDdMmYyyy } from '../../lib/api';
import type {
  FormOptionCategory,
  FormSignersSummary,
  SchoolProfile,
  Student,
  StudentFormData,
} from '../../types';
import { IndonesianDateInput } from '../IndonesianDateInput';
import { SchoolLetterhead } from '../SchoolHeader';

export interface FormSavedPayload {
  studentToken: string;
  formSigners: FormSignersSummary;
  message: string;
}

interface StudentFormWizardProps {
  profile: SchoolProfile;
  student: Student;
  hasExistingForm: boolean;
  studentToken: string | null;
  onBack: () => void;
  onSaved: (payload: FormSavedPayload) => void;
  onSessionExpired?: () => void;
}

const EMPTY_FORM: StudentFormData = {
  nama_lengkap: '',
  jenis_kelamin: '',
  nis: '',
  nik: '',
  no_kk: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  no_akta_lahir: '',
  agama: '',
  kewarganegaraan: '',
  alamat_jalan: '',
  rt: '',
  rw: '',
  dusun: '',
  desa_kelurahan: '',
  kecamatan: '',
  kabupaten_kota: '',
  provinsi: '',
  kode_pos: '',
  tinggal_bersama: '',
  moda_transportasi: '',
  anak_ke: '',

  ayah_nama: '',
  ayah_tempat_lahir: '',
  ayah_tanggal_lahir: '',
  ayah_pendidikan: '',
  ayah_pekerjaan: '',

  ibu_nama: '',
  ibu_tempat_lahir: '',
  ibu_tanggal_lahir: '',
  ibu_pendidikan: '',
  ibu_pekerjaan: '',

  wali_nama: '',
  wali_tempat_lahir: '',
  wali_tanggal_lahir: '',
  wali_pendidikan: '',
  wali_pekerjaan: '',

  no_hp_wa: '',
  email: '',

  tinggi_badan: '',
  berat_badan: '',
  lingkar_kepala: '',
  jarak_kategori: '',
  jarak_km: '',
  jumlah_saudara: '',
  asal_smp: '',
  no_seri_ijazah: '',
  nilai_tka: '',
  nilai_sem_1: '',
  nilai_sem_2: '',
  nilai_sem_3: '',
  nilai_sem_4: '',
  nilai_sem_5: '',
  jumlah_nilai: '',
};

const STEPS = [
  { number: 1, title: 'Data Pribadi', subtitle: 'Identitas & alamat lengkap' },
  { number: 2, title: 'Orang Tua / Wali & Kontak', subtitle: 'Data ayah, ibu, wali & kontak aktif' },
  { number: 3, title: 'Periodik, Nilai & Riwayat', subtitle: 'Data fisik, nilai TKA/rapor & PIN' },
];

function parseScoreInput(raw: string): number | null {
  const clean = raw.trim().replace(',', '.');
  if (!clean) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Number(clean);
}

function formatScoreNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function computeSemesterSummary(f: StudentFormData): {
  totalStr: string;
  filledCount: number;
  avgStr: string;
} {
  const vals = [f.nilai_sem_1, f.nilai_sem_2, f.nilai_sem_3, f.nilai_sem_4, f.nilai_sem_5];
  let sum = 0;
  let filledCount = 0;
  for (const v of vals) {
    const n = parseScoreInput(v);
    if (n !== null && !Number.isNaN(n)) {
      sum += n;
      filledCount++;
    }
  }
  return {
    totalStr: filledCount > 0 ? formatScoreNumber(sum) : '',
    filledCount,
    avgStr: filledCount > 0 ? formatScoreNumber(sum / filledCount) : '-',
  };
}

function sanitizeLoadedForm(
  raw: Partial<Record<keyof StudentFormData, unknown>>,
  student: Student
): StudentFormData {
  const result = { ...EMPTY_FORM };
  (Object.keys(EMPTY_FORM) as Array<keyof StudentFormData>).forEach((key) => {
    const val = raw[key];
    result[key] = val === null || val === undefined ? '' : String(val);
  });
  result.nama_lengkap = result.nama_lengkap || student.nama_lengkap;
  result.asal_smp = result.asal_smp || student.asal_sekolah;
  result.tanggal_lahir = toDdMmYyyy(result.tanggal_lahir);
  result.ayah_tanggal_lahir = toDdMmYyyy(result.ayah_tanggal_lahir);
  result.ibu_tanggal_lahir = toDdMmYyyy(result.ibu_tanggal_lahir);
  result.wali_tanggal_lahir = toDdMmYyyy(result.wali_tanggal_lahir);
  const summary = computeSemesterSummary(result);
  if (summary.filledCount > 0) {
    result.jumlah_nilai = summary.totalStr;
  }
  return result;
}

export function StudentFormWizard({
  profile,
  student,
  hasExistingForm,
  studentToken,
  onBack,
  onSaved,
  onSessionExpired,
}: StudentFormWizardProps) {
  const [step, setStep] = useState(1);
  const [isEditMode, setIsEditMode] = useState(hasExistingForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [optionsMap, setOptionsMap] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<StudentFormData>({
    ...EMPTY_FORM,
    nama_lengkap: student.nama_lengkap,
    asal_smp: student.asal_sekolah,
  });

  // PIN states (required on first submission; optional change on edit mode)
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setLoading(true);
      setError('');
      try {
        const headers: Record<string, string> = {};
        if (studentToken) {
          headers.Authorization = `Bearer ${studentToken}`;
        }
        const [optRes, formRes] = await Promise.all([
          apiFetch<{ options: Record<string, string[]> }>('/api/public/form-options'),
          apiFetch<{
            student: Student;
            form: Partial<Record<keyof StudentFormData, unknown>> | null;
            has_pin: boolean;
          }>(`/api/public/student-form/${encodeURIComponent(student.nisn)}`, { headers }),
        ]);
        if (!active) return;
        setOptionsMap(optRes.options || {});
        if (formRes.form) {
          setIsEditMode(true);
          setForm(sanitizeLoadedForm(formRes.form, student));
        } else {
          setIsEditMode(false);
          setForm({
            ...EMPTY_FORM,
            nama_lengkap: student.nama_lengkap,
            asal_smp: student.asal_sekolah,
          });
        }
      } catch (err) {
        if (!active) return;
        const status = (err as Error & { status?: number })?.status;
        if (status === 401 && onSessionExpired) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : 'Gagal memuat data formulir.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, [student.nisn, student.nama_lengkap, student.asal_sekolah, studentToken, onSessionExpired]);

  const updateField = (key: keyof StudentFormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (
        key === 'nilai_sem_1' ||
        key === 'nilai_sem_2' ||
        key === 'nilai_sem_3' ||
        key === 'nilai_sem_4' ||
        key === 'nilai_sem_5'
      ) {
        next.jumlah_nilai = computeSemesterSummary(next).totalStr;
      }
      return next;
    });
    if (error) setError('');
  };

  const getDropdownOptions = (category: FormOptionCategory, currentVal: string): string[] => {
    const base = optionsMap[category] || [];
    if (currentVal && !base.includes(currentVal)) {
      return [currentVal, ...base];
    }
    return base;
  };

  const validateStep = (targetStep: number): string | null => {
    const requiredByStep: Record<number, Array<[keyof StudentFormData, string]>> = {
      1: [
        ['nama_lengkap', 'Nama Lengkap'],
        ['jenis_kelamin', 'Jenis Kelamin'],
        ['nik', 'NIK'],
        ['no_kk', 'Nomor Kartu Keluarga'],
        ['tempat_lahir', 'Tempat Lahir'],
        ['tanggal_lahir', 'Tanggal Lahir'],
        ['agama', 'Agama'],
        ['kewarganegaraan', 'Kewarganegaraan'],
        ['alamat_jalan', 'Alamat Jalan'],
        ['rt', 'RT'],
        ['rw', 'RW'],
        ['desa_kelurahan', 'Desa / Kelurahan'],
        ['kecamatan', 'Kecamatan'],
        ['kabupaten_kota', 'Kabupaten / Kota'],
        ['provinsi', 'Provinsi'],
        ['kode_pos', 'Kode Pos'],
        ['tinggal_bersama', 'Tinggal Bersama'],
        ['moda_transportasi', 'Moda Transportasi'],
        ['anak_ke', 'Anak Ke'],
      ],
      2: [
        ['ayah_nama', 'Nama Ayah'],
        ['ayah_tempat_lahir', 'Tempat Lahir Ayah'],
        ['ayah_tanggal_lahir', 'Tanggal Lahir Ayah'],
        ['ayah_pendidikan', 'Pendidikan Ayah'],
        ['ayah_pekerjaan', 'Pekerjaan Ayah'],
        ['ibu_nama', 'Nama Ibu'],
        ['ibu_tempat_lahir', 'Tempat Lahir Ibu'],
        ['ibu_tanggal_lahir', 'Tanggal Lahir Ibu'],
        ['ibu_pendidikan', 'Pendidikan Ibu'],
        ['ibu_pekerjaan', 'Pekerjaan Ibu'],
        ['no_hp_wa', 'Nomor HP (WhatsApp)'],
      ],
      3: [
        ['tinggi_badan', 'Tinggi Badan'],
        ['berat_badan', 'Berat Badan'],
        ['lingkar_kepala', 'Lingkar Kepala'],
        ['jarak_kategori', 'Jarak Tempat Tinggal ke Sekolah'],
        ['jumlah_saudara', 'Jumlah Saudara Kandung'],
        ['asal_smp', 'Asal SMP'],
        ['nilai_sem_1', 'Nilai Semester 1'],
        ['nilai_sem_2', 'Nilai Semester 2'],
        ['nilai_sem_3', 'Nilai Semester 3'],
        ['nilai_sem_4', 'Nilai Semester 4'],
        ['nilai_sem_5', 'Nilai Semester 5'],
      ],
    };

    const missing = requiredByStep[targetStep]
      .filter(([key]) => !String(form[key] || '').trim())
      .map(([, label]) => label);

    if (missing.length > 0) {
      return `Mohon lengkapi kolom wajib pada Tahap ${targetStep}: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` (+${missing.length - 4} lainnya)` : ''}.`;
    }

    if (targetStep === 1 && !isValidDdMmYyyy(form.tanggal_lahir)) {
      return 'Format Tanggal Lahir Peserta Didik harus dd-mm-yyyy yang valid (contoh: 29-09-2010).';
    }
    if (targetStep === 2) {
      if (!isValidDdMmYyyy(form.ayah_tanggal_lahir)) {
        return 'Format Tanggal Lahir Ayah harus dd-mm-yyyy yang valid (contoh: 01-05-1978).';
      }
      if (!isValidDdMmYyyy(form.ibu_tanggal_lahir)) {
        return 'Format Tanggal Lahir Ibu harus dd-mm-yyyy yang valid (contoh: 14-11-1980).';
      }
      if (form.wali_tanggal_lahir.trim() && !isValidDdMmYyyy(form.wali_tanggal_lahir)) {
        return 'Format Tanggal Lahir Wali harus dd-mm-yyyy yang valid.';
      }
    }

    if (targetStep === 3) {
      if (form.nilai_tka.trim()) {
        const tkaVal = parseScoreInput(form.nilai_tka);
        if (tkaVal === null || Number.isNaN(tkaVal) || tkaVal < 0 || tkaVal > 1000) {
          return 'Nilai TKA harus berupa angka yang valid (contoh: 85 atau 85.5).';
        }
      }

      const semEntries: Array<[string, string]> = [
        ['Semester 1', form.nilai_sem_1],
        ['Semester 2', form.nilai_sem_2],
        ['Semester 3', form.nilai_sem_3],
        ['Semester 4', form.nilai_sem_4],
        ['Semester 5', form.nilai_sem_5],
      ];
      for (const [label, raw] of semEntries) {
        const val = parseScoreInput(raw);
        if (val === null || Number.isNaN(val) || val < 0 || val > 100) {
          return `Nilai Rata-Rata ${label} harus berupa angka antara 0 sampai 100 (maks. 2 angka desimal, contoh: 87.5).`;
        }
      }

      const cleanedPin = pin.trim();
      const cleanedConfirm = confirmPin.trim();
      if (!isEditMode) {
        if (!/^\d{6}$/.test(cleanedPin)) {
          return 'Buat PIN keamanan yang terdiri dari tepat 6 digit angka (contoh: 140526).';
        }
        if (cleanedPin !== cleanedConfirm) {
          return 'Konfirmasi PIN keamanan tidak cocok. Periksa kembali 6 digit PIN Anda.';
        }
      } else if (cleanedPin || cleanedConfirm) {
        if (!/^\d{6}$/.test(cleanedPin)) {
          return 'PIN keamanan baru harus terdiri dari tepat 6 digit angka.';
        }
        if (cleanedPin !== cleanedConfirm) {
          return 'Konfirmasi PIN keamanan baru tidak cocok.';
        }
      }
    }

    return null;
  };

  const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const errMsg = validateStep(step);
    if (errMsg) {
      setError(errMsg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError('');
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrev = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setError('');
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpStep = (targetNumber: number) => {
    // Allow jumping freely across all 3 steps in edit mode, or backward in new form mode
    if (isEditMode || targetNumber < step) {
      setError('');
      setStep(targetNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) {
      return;
    }

    const err1 = validateStep(1);
    if (err1) {
      setStep(1);
      setError(err1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const err2 = validateStep(2);
    if (err2) {
      setStep(2);
      setError(err2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const err3 = validateStep(3);
    if (err3) {
      setStep(3);
      setError(err3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const headers: Record<string, string> = {};
      if (studentToken) {
        headers.Authorization = `Bearer ${studentToken}`;
      }
      const payload: Record<string, string> = { ...form };
      if (!isEditMode) {
        payload.pin = pin.trim();
      } else if (pin.trim()) {
        payload.new_pin = pin.trim();
      }

      const res = await apiFetch<{
        message: string;
        student_token: string;
        form_signers: FormSignersSummary;
      }>(`/api/public/student-form/${encodeURIComponent(student.nisn)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });

      onSaved({
        studentToken: res.student_token,
        formSigners: res.form_signers,
        message: res.message,
      });
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401 && onSessionExpired) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Gagal menyimpan formulir daftar ulang.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B2447] focus:outline-none focus:ring-2 focus:ring-[#0B2447]/15 transition-colors';
  const labelClass = 'block text-sm font-medium text-slate-800 mb-1.5';

  const renderSelect = (
    label: string,
    fieldKey: keyof StudentFormData,
    category: FormOptionCategory,
    required = true
  ) => {
    const opts = getDropdownOptions(category, form[fieldKey]);
    return (
      <div>
        <label className={labelClass}>
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        <select
          value={form[fieldKey]}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          className={inputClass}
          required={required}
        >
          <option value="">-- Pilih {label} --</option>
          {opts.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B2447] transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Hasil Seleksi
        </button>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>NISN</span>
          <span className="font-mono font-semibold text-slate-800 tabular-nums">{student.nisn}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate max-w-[200px] sm:max-w-xs font-medium text-slate-700">
            {student.nama_lengkap}
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <SchoolLetterhead
          profile={profile}
          subtitle="Formulir Daftar Ulang Calon Peserta Didik Baru"
        />

        {/* Stepper (clickable across all 3 steps in edit mode) */}
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STEPS.map((s) => {
              const isCurrent = step === s.number;
              const isCompleted = isEditMode ? step !== s.number : step > s.number;
              const canClick = isEditMode || s.number < step;
              return (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => handleJumpStep(s.number)}
                  disabled={!canClick && !isCurrent}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
                    isCurrent
                      ? 'border-[#0B2447] bg-[#0B2447]/[0.04]'
                      : isCompleted
                        ? 'border-emerald-200 bg-emerald-50/50 cursor-pointer hover:bg-emerald-50'
                        : 'border-slate-200 bg-slate-50/60 opacity-70 cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold tabular-nums ${
                      isCurrent
                        ? 'bg-[#0B2447] text-white'
                        : isCompleted
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : s.number}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold leading-snug ${
                        isCurrent
                          ? 'text-[#0B2447]'
                          : isCompleted
                            ? 'text-emerald-900'
                            : 'text-slate-700'
                      }`}
                    >
                      Tahap {s.number}: {s.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{s.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {isEditMode && (
            <p className="text-xs text-slate-500 mt-2.5">
              Mode Edit Aktif — Anda dapat mengklik langsung Tahap 1, Tahap 2, atau Tahap 3 di atas untuk memperbarui bagian tertentu.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#0B2447]" />
            <p className="text-sm">Memuat formulir dan daftar pilihan...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* TAHAP 1: DATA PRIBADI */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Tahap 1 — Data Pribadi Peserta Didik
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Lengkapi data sesuai Kartu Keluarga (KK) dan Akta Kelahiran. Format tanggal:{' '}
                    <span className="font-mono font-semibold text-slate-700">dd-mm-yyyy</span>.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className={labelClass}>
                      Nama Lengkap <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nama_lengkap}
                      onChange={(e) => updateField('nama_lengkap', e.target.value)}
                      className={inputClass}
                      placeholder="Sesuai Ijazah / Akta Kelahiran"
                      required
                    />
                  </div>

                  {renderSelect('Jenis Kelamin', 'jenis_kelamin', 'jenis_kelamin', true)}

                  <div>
                    <label className={labelClass}>NIS (Nomor Induk Siswa SMP, opsional)</label>
                    <input
                      type="text"
                      value={form.nis}
                      onChange={(e) => updateField('nis', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Nomor Induk Siswa dari sekolah asal"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      NIK (Nomor Induk Kependudukan) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.nik}
                      onChange={(e) => updateField('nik', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="16 digit NIK sesuai KK"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Nomor Kartu Keluarga (KK) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.no_kk}
                      onChange={(e) => updateField('no_kk', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="16 digit Nomor KK"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Tempat Lahir <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.tempat_lahir}
                      onChange={(e) => updateField('tempat_lahir', e.target.value)}
                      className={inputClass}
                      placeholder="Contoh: Ciamis"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      Tanggal Lahir (dd-mm-yyyy) <span className="text-red-600">*</span>
                    </label>
                    <IndonesianDateInput
                      value={form.tanggal_lahir}
                      onChange={(val) => updateField('tanggal_lahir', val)}
                      defaultYear={2010}
                      placeholder="dd-mm-yyyy (misal: 29-09-2010)"
                      className={inputClass}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>No. Registrasi Akta Lahir</label>
                    <input
                      type="text"
                      value={form.no_akta_lahir}
                      onChange={(e) => updateField('no_akta_lahir', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 3207-LU-14052011-0012"
                    />
                  </div>

                  {renderSelect('Agama', 'agama', 'agama', true)}
                  {renderSelect('Kewarganegaraan', 'kewarganegaraan', 'kewarganegaraan', true)}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h4 className="font-display text-base font-semibold text-slate-900 mb-4">
                    Alamat Tempat Tinggal
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
                    <div className="md:col-span-6">
                      <label className={labelClass}>
                        Alamat Jalan <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.alamat_jalan}
                        onChange={(e) => updateField('alamat_jalan', e.target.value)}
                        className={inputClass}
                        placeholder="Nama jalan, blok, nomor rumah"
                        required
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className={labelClass}>
                        RT <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.rt}
                        onChange={(e) => updateField('rt', e.target.value)}
                        className={`${inputClass} font-mono`}
                        placeholder="001"
                        required
                      />
                    </div>

                    <div className="md:col-span-1">
                      <label className={labelClass}>
                        RW <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.rw}
                        onChange={(e) => updateField('rw', e.target.value)}
                        className={`${inputClass} font-mono`}
                        placeholder="002"
                        required
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className={labelClass}>Dusun</label>
                      <input
                        type="text"
                        value={form.dusun}
                        onChange={(e) => updateField('dusun', e.target.value)}
                        className={inputClass}
                        placeholder="Nama dusun / kampung (opsional)"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className={labelClass}>
                        Desa / Kelurahan <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.desa_kelurahan}
                        onChange={(e) => updateField('desa_kelurahan', e.target.value)}
                        className={inputClass}
                        placeholder="Nama desa / kelurahan"
                        required
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className={labelClass}>
                        Kecamatan <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.kecamatan}
                        onChange={(e) => updateField('kecamatan', e.target.value)}
                        className={inputClass}
                        placeholder="Contoh: Cihaurbeuti"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelClass}>
                        Kabupaten / Kota <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.kabupaten_kota}
                        onChange={(e) => updateField('kabupaten_kota', e.target.value)}
                        className={inputClass}
                        placeholder="Contoh: Kabupaten Ciamis"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelClass}>
                        Provinsi <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.provinsi}
                        onChange={(e) => updateField('provinsi', e.target.value)}
                        className={inputClass}
                        placeholder="Contoh: Jawa Barat"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelClass}>
                        Kode Pos <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.kode_pos}
                        onChange={(e) => updateField('kode_pos', e.target.value)}
                        className={`${inputClass} font-mono`}
                        placeholder="46262"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                  {renderSelect('Tinggal Bersama', 'tinggal_bersama', 'tinggal_bersama', true)}
                  {renderSelect('Moda Transportasi', 'moda_transportasi', 'moda_transportasi', true)}
                  <div>
                    <label className={labelClass}>
                      Anak Ke- <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.anak_ke}
                      onChange={(e) => updateField('anak_ke', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 1"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAHAP 2: DATA ORANG TUA / WALI & KONTAK */}
            {step === 2 && (
              <div className="space-y-8">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Tahap 2 — Data Orang Tua / Wali & Kontak
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Isi data Ayah dan Ibu kandung dengan benar. Bagian Wali bersifat opsional jika
                    tidak tinggal bersama wali. Format tanggal:{' '}
                    <span className="font-mono font-semibold text-slate-700">dd-mm-yyyy</span>.
                  </p>
                </div>

                {/* Data Ayah */}
                <div className="space-y-4">
                  <h4 className="font-display text-base font-semibold text-[#0B2447]">
                    A. Data Ayah Kandung
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className={labelClass}>
                        Nama Ayah <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ayah_nama}
                        onChange={(e) => updateField('ayah_nama', e.target.value)}
                        className={inputClass}
                        placeholder="Nama lengkap ayah tanpa gelar"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Tempat Lahir Ayah <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ayah_tempat_lahir}
                        onChange={(e) => updateField('ayah_tempat_lahir', e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Tanggal Lahir Ayah (dd-mm-yyyy) <span className="text-red-600">*</span>
                      </label>
                      <IndonesianDateInput
                        value={form.ayah_tanggal_lahir}
                        onChange={(val) => updateField('ayah_tanggal_lahir', val)}
                        defaultYear={1978}
                        placeholder="dd-mm-yyyy (misal: 01-05-1978)"
                        className={inputClass}
                        required
                      />
                    </div>
                    {renderSelect('Pendidikan Ayah', 'ayah_pendidikan', 'pendidikan', true)}
                    {renderSelect('Pekerjaan Ayah', 'ayah_pekerjaan', 'pekerjaan', true)}
                  </div>
                </div>

                {/* Data Ibu */}
                <div className="border-t border-slate-200 pt-6 space-y-4">
                  <h4 className="font-display text-base font-semibold text-[#0B2447]">
                    B. Data Ibu Kandung
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className={labelClass}>
                        Nama Ibu <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ibu_nama}
                        onChange={(e) => updateField('ibu_nama', e.target.value)}
                        className={inputClass}
                        placeholder="Nama lengkap ibu sesuai KK"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Tempat Lahir Ibu <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ibu_tempat_lahir}
                        onChange={(e) => updateField('ibu_tempat_lahir', e.target.value)}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Tanggal Lahir Ibu (dd-mm-yyyy) <span className="text-red-600">*</span>
                      </label>
                      <IndonesianDateInput
                        value={form.ibu_tanggal_lahir}
                        onChange={(val) => updateField('ibu_tanggal_lahir', val)}
                        defaultYear={1980}
                        placeholder="dd-mm-yyyy (misal: 14-11-1980)"
                        className={inputClass}
                        required
                      />
                    </div>
                    {renderSelect('Pendidikan Ibu', 'ibu_pendidikan', 'pendidikan', true)}
                    {renderSelect('Pekerjaan Ibu', 'ibu_pekerjaan', 'pekerjaan', true)}
                  </div>
                </div>

                {/* Data Wali (Opsional) */}
                <div className="border-t border-slate-200 pt-6 space-y-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="font-display text-base font-semibold text-slate-800">
                      C. Data Wali
                    </h4>
                    <span className="text-xs text-slate-500">
                      Opsional — kosongkan jika tidak ada
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className={labelClass}>Nama Wali</label>
                      <input
                        type="text"
                        value={form.wali_nama}
                        onChange={(e) => updateField('wali_nama', e.target.value)}
                        className={inputClass}
                        placeholder="Nama lengkap wali (jika ada)"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tempat Lahir Wali</label>
                      <input
                        type="text"
                        value={form.wali_tempat_lahir}
                        onChange={(e) => updateField('wali_tempat_lahir', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tanggal Lahir Wali (dd-mm-yyyy)</label>
                      <IndonesianDateInput
                        value={form.wali_tanggal_lahir}
                        onChange={(val) => updateField('wali_tanggal_lahir', val)}
                        defaultYear={1975}
                        placeholder="dd-mm-yyyy (opsional)"
                        className={inputClass}
                      />
                    </div>
                    {renderSelect('Pendidikan Wali', 'wali_pendidikan', 'pendidikan', false)}
                    {renderSelect('Pekerjaan Wali', 'wali_pekerjaan', 'pekerjaan', false)}
                  </div>
                </div>

                {/* Kontak */}
                <div className="border-t border-slate-200 pt-6 space-y-4">
                  <h4 className="font-display text-base font-semibold text-[#0B2447]">
                    D. Kontak Aktif
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className={labelClass}>
                        Nomor HP (WhatsApp) <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="tel"
                        value={form.no_hp_wa}
                        onChange={(e) => updateField('no_hp_wa', e.target.value)}
                        className={`${inputClass} font-mono`}
                        placeholder="Contoh: 081234567890"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Alamat Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        className={inputClass}
                        placeholder="contoh@email.com (opsional)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAHAP 3: DATA PERIODIK, RIWAYAT SEKOLAH & PIN KEAMANAN */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Tahap 3 — Data Periodik & Riwayat Sekolah
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Lengkapi data periodik serta periksa kembali seluruh isian sebelum menyimpan
                    formulir daftar ulang Anda.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className={labelClass}>
                      Tinggi Badan (cm) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={250}
                      value={form.tinggi_badan}
                      onChange={(e) => updateField('tinggi_badan', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 162"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Berat Badan (kg) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={200}
                      value={form.berat_badan}
                      onChange={(e) => updateField('berat_badan', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 52"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Lingkar Kepala (cm) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={30}
                      max={80}
                      value={form.lingkar_kepala}
                      onChange={(e) => updateField('lingkar_kepala', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 55"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1">
                    {renderSelect(
                      'Jarak Tempat Tinggal ke Sekolah',
                      'jarak_kategori',
                      'jarak_sekolah',
                      true
                    )}
                  </div>
                  <div className="md:col-span-1">
                    <label className={labelClass}>Detail Jarak (dalam km)</label>
                    <input
                      type="text"
                      value={form.jarak_km}
                      onChange={(e) => updateField('jarak_km', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 2.5"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className={labelClass}>
                      Jumlah Saudara Kandung <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.jumlah_saudara}
                      onChange={(e) => updateField('jumlah_saudara', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: 2"
                      required
                    />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClass}>
                      Asal SMP / MTs <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.asal_smp}
                      onChange={(e) => updateField('asal_smp', e.target.value)}
                      className={inputClass}
                      placeholder="Nama lengkap sekolah asal"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      No. Seri Ijazah SMP (opsional jika belum terbit)
                    </label>
                    <input
                      type="text"
                      value={form.no_seri_ijazah}
                      onChange={(e) => updateField('no_seri_ijazah', e.target.value)}
                      className={`${inputClass} font-mono`}
                      placeholder="Contoh: DN-02/D-SMP/24/0123456"
                    />
                  </div>
                </div>

                {/* Nilai Akademik: TKA + Rata-Rata Rapor Semester 1-5 + Jumlah Nilai Otomatis */}
                {(() => {
                  const semSummary = computeSemesterSummary(form);
                  const semFields: Array<{ key: keyof StudentFormData; label: string }> = [
                    { key: 'nilai_sem_1', label: 'Semester 1' },
                    { key: 'nilai_sem_2', label: 'Semester 2' },
                    { key: 'nilai_sem_3', label: 'Semester 3' },
                    { key: 'nilai_sem_4', label: 'Semester 4' },
                    { key: 'nilai_sem_5', label: 'Semester 5' },
                  ];
                  return (
                    <div className="border-t border-slate-200 pt-6 space-y-5">
                      <div>
                        <h4 className="font-display text-base font-semibold text-[#0B2447]">
                          Nilai Akademik (TKA & Rata-Rata Rapor Semester 1–5)
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Gunakan titik atau koma untuk angka desimal (contoh: 87.5 atau 87,5). Jumlah Nilai dihitung otomatis dari penjumlahan Nilai Semester 1 s.d. Semester 5.
                        </p>
                      </div>

                      <div className="max-w-sm">
                        <label className={labelClass}>
                          Nilai TKA (Tes Kemampuan Akademik)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.nilai_tka}
                          onChange={(e) => updateField('nilai_tka', e.target.value)}
                          className={`${inputClass} font-mono tabular-nums`}
                          placeholder="Contoh: 88.5 (opsional jika tidak ada)"
                        />
                      </div>

                      <div className="space-y-2.5">
                        <p className="text-sm font-medium text-slate-800">
                          Nilai Rata-Rata Rapor Semester 1 sampai Semester 5{' '}
                          <span className="text-red-600">*</span>
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {semFields.map((sf) => (
                            <div key={sf.key}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {sf.label} <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={form[sf.key]}
                                onChange={(e) => updateField(sf.key, e.target.value)}
                                className={`${inputClass} font-mono tabular-nums text-center`}
                                placeholder="0–100"
                                required
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-[#0B2447]/20 bg-[#F4F7FB] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-[#0B2447]">
                            Jumlah Nilai (Semester 1 s.d. 5)
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Terisi {semSummary.filledCount} dari 5 semester
                            {semSummary.filledCount > 0 && (
                              <>
                                {' · '}Rata-rata keseluruhan:{' '}
                                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                                  {semSummary.avgStr}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-2xl font-bold text-[#0B2447] tabular-nums">
                            {semSummary.totalStr || '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* PIN Keamanan 6 Digit */}
                <div className="rounded-xl border border-[#0B2447]/20 bg-[#F4F7FB] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 rounded-lg bg-[#0B2447] text-white flex items-center justify-center shrink-0 mt-0.5">
                        {isEditMode ? (
                          <KeyRound className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-display text-sm font-bold text-[#0B2447]">
                          {isEditMode
                            ? 'Ubah PIN Keamanan Pribadi (Opsional)'
                            : 'Buat PIN Keamanan Pribadi (6 Digit Angka) *'}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          {isEditMode
                            ? 'Kosongkan kedua kolom di bawah jika tetap ingin menggunakan PIN yang sama. Isi 6 digit angka baru jika ingin mengganti PIN.'
                            : 'PIN ini mengunci data pribadi Anda (NIK, KK, alamat, nomor HP) serta akses edit formulir dan unduh berkas PDF pribadi agar tidak bisa dibuka oleh orang lain.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPin((s) => !s)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#0B2447] shrink-0 whitespace-nowrap"
                    >
                      {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {showPin ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {isEditMode ? 'PIN Baru (6 Digit)' : 'Buat PIN 6 Digit'}{' '}
                        {!isEditMode && <span className="text-red-600">*</span>}
                      </label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="new-password"
                        value={pin}
                        onChange={(e) => {
                          setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                          if (error) setError('');
                        }}
                        placeholder="6 digit angka"
                        className={`${inputClass} font-mono tracking-[0.25em] text-center`}
                        required={!isEditMode}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {isEditMode ? 'Konfirmasi PIN Baru' : 'Konfirmasi PIN 6 Digit'}{' '}
                        {!isEditMode && <span className="text-red-600">*</span>}
                      </label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="new-password"
                        value={confirmPin}
                        onChange={(e) => {
                          setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                          if (error) setError('');
                        }}
                        placeholder="Ulangi 6 digit angka"
                        className={`${inputClass} font-mono tracking-[0.25em] text-center`}
                        required={!isEditMode}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Catat dan simpan baik-baik PIN Anda. Jika suatu saat lupa, hubungi Panitia SPMB sekolah untuk mereset PIN.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-[#0B2447] shrink-0 mt-0.5" />
                  <span>
                    Dengan menekan tombol <strong>Simpan Formulir</strong>, saya menyatakan bahwa
                    seluruh data yang diisikan adalah benar dan dapat dipertanggungjawabkan untuk
                    keperluan administrasi daftar ulang {profile.school_name}.
                  </span>
                </div>
              </div>
            )}

            {/* Navigation Footer (distinct button keys prevent premature form submission on Step 2 -> 3) */}
            <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between gap-4">
              {step > 1 ? (
                <button
                  key="btn-prev-step"
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Sebelumnya
                </button>
              ) : (
                <button
                  key="btn-cancel-wizard"
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  Batal
                </button>
              )}

              {step < 3 ? (
                <button
                  key="btn-next-step"
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B2447] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#133666] transition-colors whitespace-nowrap"
                >
                  Selanjutnya
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  key="btn-submit-form"
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {isEditMode ? 'Simpan Perubahan' : 'Simpan Formulir & Aktifkan PIN'}
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
