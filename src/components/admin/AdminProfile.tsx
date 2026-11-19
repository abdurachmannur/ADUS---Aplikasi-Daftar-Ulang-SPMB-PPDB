import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  apiFetch,
  formatIndonesianDate,
  getWibPartsFromTimestamp,
} from '../../lib/api';
import type { SchoolProfile } from '../../types';
import { SchoolLetterhead, SchoolLogo } from '../SchoolHeader';

interface ProfileResponse {
  profile: SchoolProfile;
  server_now_ms: number;
  is_open: boolean;
}

interface AdminProfileProps {
  onProfileUpdated?: (profile: SchoolProfile) => void;
}

export function AdminProfile({ onProfileUpdated }: AdminProfileProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [schoolName, setSchoolName] = useState('');
  const [appName, setAppName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [announcementDate, setAnnouncementDate] = useState('');
  const [announcementTime, setAnnouncementTime] = useState('');
  const [skNumber, setSkNumber] = useState('');
  const [skDetail, setSkDetail] = useState('');

  const [kopInstansi, setKopInstansi] = useState('');
  const [kopDinas, setKopDinas] = useState('');
  const [kopCabang, setKopCabang] = useState('');
  const [kopAlamat, setKopAlamat] = useState('');
  const [kopEmail, setKopEmail] = useState('');

  const [logoPath, setLogoPath] = useState('');
  const [logoDinasPath, setLogoDinasPath] = useState('');
  const [kopPath, setKopPath] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [serverNowMs, setServerNowMs] = useState(Date.now());

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [resetLogo, setResetLogo] = useState(false);

  const [logoDinasFile, setLogoDinasFile] = useState<File | null>(null);
  const [logoDinasPreview, setLogoDinasPreview] = useState('');
  const [removeLogoDinas, setRemoveLogoDinas] = useState(false);

  const [kopFile, setKopFile] = useState<File | null>(null);
  const [kopPreview, setKopPreview] = useState('');
  const [removeKop, setRemoveKop] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoDinasInputRef = useRef<HTMLInputElement>(null);
  const kopInputRef = useRef<HTMLInputElement>(null);

  const applyData = (res: ProfileResponse) => {
    setSchoolName(res.profile.school_name);
    setAppName(res.profile.app_name);
    setAcademicYear(res.profile.academic_year);
    setAnnouncementDate(res.profile.announcement_date);
    setAnnouncementTime(res.profile.announcement_time);
    setSkNumber(res.profile.sk_number);
    setSkDetail(res.profile.sk_detail || '');
    setKopInstansi(res.profile.kop_instansi || '');
    setKopDinas(res.profile.kop_dinas || '');
    setKopCabang(res.profile.kop_cabang || '');
    setKopAlamat(res.profile.kop_alamat || '');
    setKopEmail(res.profile.kop_email || '');
    setLogoPath(res.profile.logo_path || '');
    setLogoDinasPath(res.profile.logo_dinas_path || '');
    setKopPath(res.profile.kop_surat_path || '');
    setIsOpen(res.is_open);
    setServerNowMs(res.server_now_ms);
    setLogoFile(null);
    setLogoPreview('');
    setResetLogo(false);
    setLogoDinasFile(null);
    setLogoDinasPreview('');
    setRemoveLogoDinas(false);
    setKopFile(null);
    setKopPreview('');
    setRemoveKop(false);
  };

  useEffect(() => {
    let active = true;
    apiFetch<ProfileResponse>('/api/admin/school-profile', {}, true)
      .then((res) => {
        if (active) applyData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat profil sekolah.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleQuickSchedule = (offsetMinutes: number) => {
    const target = getWibPartsFromTimestamp(Date.now() + offsetMinutes * 60 * 1000);
    setAnnouncementDate(target.date);
    setAnnouncementTime(target.time);
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('school_name', schoolName.trim());
      formData.append('app_name', appName.trim());
      formData.append('academic_year', academicYear.trim());
      formData.append('announcement_date', announcementDate);
      formData.append('announcement_time', announcementTime);
      formData.append('sk_number', skNumber.trim());
      formData.append('sk_detail', skDetail.trim());
      formData.append('kop_instansi', kopInstansi.trim());
      formData.append('kop_dinas', kopDinas.trim());
      formData.append('kop_cabang', kopCabang.trim());
      formData.append('kop_alamat', kopAlamat.trim());
      formData.append('kop_email', kopEmail.trim());

      if (logoFile) {
        formData.append('logo', logoFile);
      } else if (resetLogo) {
        formData.append('reset_logo', 'true');
      }

      if (logoDinasFile) {
        formData.append('logo_dinas', logoDinasFile);
      } else if (removeLogoDinas) {
        formData.append('remove_logo_dinas', 'true');
      }

      if (kopFile) {
        formData.append('kop_surat', kopFile);
      } else if (removeKop) {
        formData.append('remove_kop_surat', 'true');
      }

      const res = await apiFetch<ProfileResponse & { message: string }>(
        '/api/admin/school-profile',
        {
          method: 'PUT',
          body: formData,
        },
        true
      );

      applyData(res);
      setSuccess(res.message);
      onProfileUpdated?.(res.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil sekolah.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 flex items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
        <span className="text-sm">Memuat pengaturan profil sekolah...</span>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15';
  const currentWib = getWibPartsFromTimestamp(serverNowMs);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Core School Identity, SK Detail, Kop Text & Schedule */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Identitas Sekolah & Keputusan SK Pengumuman
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ditampilkan secara dinamis pada halaman cek kelulusan, hasil seleksi siswa, dan cetakan surat PDF.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nama Sekolah <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nama Aplikasi <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tahun Pelajaran <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="Contoh: 2026/2027"
                  className={inputClass}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nomor SK Pengumuman
                </label>
                <input
                  type="text"
                  value={skNumber}
                  onChange={(e) => setSkNumber(e.target.value)}
                  placeholder="Contoh: 1244/PK.07.02/SMAN1CHRBT"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Keterangan Detail Keputusan SK (Tampil di Tampilan Siswa)
                </label>
                <textarea
                  rows={4}
                  value={skDetail}
                  onChange={(e) => setSkDetail(e.target.value)}
                  placeholder="Contoh: Berdasarkan Keputusan Kepala SMA Negeri 1 Cihaurbeuti Nomor ... tentang Penetapan Hasil Seleksi SPMB ..."
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Teks ini akan ditampilkan tepat di bawah tulisan &quot;Pengumuman Hasil Seleksi SPMB — Nomor SK&quot; pada halaman hasil seleksi siswa.
                </p>
              </div>
            </div>
          </div>

          {/* Teks Kop Surat Resmi */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Teks Kop Surat Resmi (Untuk Halaman & Generator PDF)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Digunakan secara otomatis pada Kop Surat apabila gambar Kop Surat tidak diunggah.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 1 (Pemerintah Daerah / Yayasan)
                </label>
                <input
                  type="text"
                  value={kopInstansi}
                  onChange={(e) => setKopInstansi(e.target.value)}
                  placeholder="PEMERINTAH DAERAH PROVINSI JAWA BARAT"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 2 (Dinas Pendidikan)
                </label>
                <input
                  type="text"
                  value={kopDinas}
                  onChange={(e) => setKopDinas(e.target.value)}
                  placeholder="DINAS PENDIDIKAN"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Baris 3 (Cabang Dinas / Wilayah)
                </label>
                <input
                  type="text"
                  value={kopCabang}
                  onChange={(e) => setKopCabang(e.target.value)}
                  placeholder="CABANG DINAS PENDIDIKAN WILAYAH XIII"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat & Telepon Sekolah
                </label>
                <input
                  type="text"
                  value={kopAlamat}
                  onChange={(e) => setKopAlamat(e.target.value)}
                  placeholder="Jl. Kartawijaya 600 Pamokolan Tlp. (0265) 420316 Cihaurbeuti Ciamis 46262"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email / Website Sekolah
                </label>
                <input
                  type="text"
                  value={kopEmail}
                  onChange={(e) => setKopEmail(e.target.value)}
                  placeholder="e-mail : sman1beauty@gmail.com"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Live Symmetric Kop Surat Preview */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Pratinjau Kop Surat (Tampilan Halaman & Surat)
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 overflow-x-auto">
                <SchoolLetterhead
                  profile={{
                    id: 1,
                    school_name: schoolName || 'Nama Sekolah',
                    app_name: appName || 'SPMB',
                    academic_year: academicYear || '2026/2027',
                    logo_path: logoPreview || (resetLogo ? '' : logoPath),
                    logo_dinas_path: logoDinasPreview || (removeLogoDinas ? '' : logoDinasPath),
                    kop_surat_path: kopPreview || (removeKop ? '' : kopPath),
                    announcement_date: announcementDate,
                    announcement_time: announcementTime,
                    sk_number: skNumber,
                    sk_detail: skDetail,
                    kop_instansi: kopInstansi,
                    kop_dinas: kopDinas,
                    kop_cabang: kopCabang,
                    kop_alamat: kopAlamat,
                    kop_email: kopEmail,
                    updated_at: '',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Schedule Lock Controls */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Kunci Jadwal Pengumuman (WIB)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sebelum tanggal dan jam ini tercapai, halaman publik otomatis menampilkan hitung mundur.
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                  isOpen
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {isOpen ? 'Status: Terbuka' : 'Status: Hitung Mundur'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tanggal Pengumuman <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={announcementDate}
                  onChange={(e) => setAnnouncementDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Jam Pengumuman (WIB) <span className="text-red-600">*</span>
                </label>
                <input
                  type="time"
                  value={announcementTime}
                  onChange={(e) => setAnnouncementTime(e.target.value)}
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                <span>
                  Waktu server saat ini:{' '}
                  <strong className="font-mono text-slate-900">
                    {formatIndonesianDate(currentWib.date)}, {currentWib.time} WIB
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickSchedule(-5)}
                  className="rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 font-medium text-emerald-700 hover:bg-emerald-50 transition-colors whitespace-nowrap"
                >
                  Atur Buka Sekarang
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSchedule(120)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  Atur +2 Jam (Hitung Mundur)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Logo & Kop Surat Uploads */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-sm font-bold text-slate-900">Logo Sekolah</h3>
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 gap-3">
              <SchoolLogo
                src={logoPreview || (resetLogo ? '' : logoPath)}
                schoolName={schoolName || 'Sekolah'}
                size="lg"
              />
              <p className="text-xs text-slate-500 text-center">
                Format PNG atau JPG (disarankan PNG, maks. 5 MB)
              </p>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                  setResetLogo(false);
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Pilih Logo
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogoFile(null);
                  setLogoPreview('');
                  setResetLogo(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                title="Kembalikan logo bawaan"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>

          {/* Upload Logo Dinas (Untuk Kop Surat) */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#1677FF]" />
                Logo Dinas (Untuk Kop Surat)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ditampilkan di sisi kiri Kop Surat otomatis (halaman hasil & semua PDF resmi) dengan teks tepat di tengah simetris. Jika kosong, akan memakai Logo Sekolah.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-5 min-h-[120px] gap-2">
              {logoDinasPreview || (!removeLogoDinas && logoDinasPath) ? (
                <img
                  src={logoDinasPreview || logoDinasPath}
                  alt="Pratinjau Logo Dinas"
                  referrerPolicy="no-referrer"
                  className="h-20 w-20 object-contain"
                />
              ) : (
                <div className="text-center text-slate-400 space-y-1">
                  <Building2 className="h-7 w-7 mx-auto" />
                  <p className="text-xs">Belum ada Logo Dinas</p>
                  <p className="text-[11px]">Format PNG transparan atau JPG (maks. 5 MB)</p>
                </div>
              )}
            </div>

            <input
              ref={logoDinasInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLogoDinasFile(file);
                  setLogoDinasPreview(URL.createObjectURL(file));
                  setRemoveLogoDinas(false);
                }
              }}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => logoDinasInputRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Pilih Logo Dinas
              </button>
              {(logoDinasPath || logoDinasPreview) && !removeLogoDinas && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoDinasFile(null);
                    setLogoDinasPreview('');
                    setRemoveLogoDinas(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Gambar Kop Surat Resmi (Opsional)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Jika diunggah (PNG/JPG), gambar kop surat utuh akan menggantikan kop surat teks dan Logo Dinas pada halaman hasil seleksi serta semua PDF.
              </p>
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 flex flex-col items-center justify-center min-h-[120px] gap-2">
              {kopPreview || (!removeKop && kopPath) ? (
                <img
                  src={kopPreview || kopPath}
                  alt="Pratinjau Kop Surat"
                  referrerPolicy="no-referrer"
                  className="max-h-28 w-full object-contain rounded"
                />
              ) : (
                <div className="text-center text-slate-400 space-y-1">
                  <ImageIcon className="h-7 w-7 mx-auto" />
                  <p className="text-xs">Belum ada gambar kop surat utuh</p>
                  <p className="text-[11px] text-slate-400">
                    Menggunakan teks kop surat & Logo Dinas secara otomatis
                  </p>
                </div>
              )}
            </div>

            <input
              ref={kopInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setKopFile(file);
                  setKopPreview(URL.createObjectURL(file));
                  setRemoveKop(false);
                }
              }}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => kopInputRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Unggah Kop Surat
              </button>
              {(kopPath || kopPreview) && !removeKop && (
                <button
                  type="button"
                  onClick={() => {
                    setKopFile(null);
                    setKopPreview('');
                    setRemoveKop(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Action Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1677FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan Perubahan...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Simpan Pengaturan Profil
            </>
          )}
        </button>
      </div>
    </form>
  );
}
