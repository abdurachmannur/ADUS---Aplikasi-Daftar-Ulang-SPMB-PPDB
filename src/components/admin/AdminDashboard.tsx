import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  Settings,
  UserCheck,
  Users,
  UserX,
  AlertCircle,
} from 'lucide-react';
import { apiFetch, formatDateTimeWib, formatIndonesianDate } from '../../lib/api';
import type { DashboardStats, SchoolProfile } from '../../types';

interface AdminDashboardProps {
  onNavigateTab: (tab: string) => void;
}

interface DashboardResponse {
  stats: DashboardStats;
  profile: SchoolProfile;
  is_open: boolean;
}

export function AdminDashboard({ onNavigateTab }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<DashboardResponse>('/api/admin/dashboard', {}, true)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat ringkasan dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 flex items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
        <span className="text-sm">Memuat statistik SPMB...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700 flex items-center gap-2.5">
        <AlertCircle className="h-5 w-5 shrink-0" />
        <span>{error || 'Data dashboard tidak tersedia.'}</span>
      </div>
    );
  }

  const { stats, profile, is_open } = data;
  const completionPct =
    stats.accepted_count > 0
      ? Math.round((stats.forms_submitted_count / stats.accepted_count) * 100)
      : 0;

  const kpiCards = [
    {
      label: 'Total Calon Siswa',
      value: stats.total_students,
      sub: `Tahun Pelajaran ${profile.academic_year}`,
      icon: Users,
      iconBg: 'bg-blue-50 text-[#1677FF]',
    },
    {
      label: 'Dinyatakan Diterima',
      value: stats.accepted_count,
      sub:
        stats.total_students > 0
          ? `${Math.round((stats.accepted_count / stats.total_students) * 100)}% dari total peserta`
          : '0% dari total peserta',
      icon: UserCheck,
      iconBg: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Tidak Diterima',
      value: stats.rejected_count,
      sub:
        stats.total_students > 0
          ? `${Math.round((stats.rejected_count / stats.total_students) * 100)}% dari total peserta`
          : '0% dari total peserta',
      icon: UserX,
      iconBg: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Sudah Mengisi Formulir',
      value: stats.forms_submitted_count,
      sub: `Dari ${stats.accepted_count} siswa diterima (${completionPct}%)`,
      icon: ClipboardCheck,
      iconBg: 'bg-indigo-50 text-indigo-700',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white border border-slate-200 rounded-lg p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                <p className="font-mono text-3xl font-bold text-slate-900 tabular-nums mt-2">
                  {kpi.value}
                </p>
                <p className="text-xs text-slate-500 mt-1.5 truncate">{kpi.sub}</p>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${kpi.iconBg}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-Column Operational Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule & System Status */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900">
                Status Jadwal Pengumuman
              </h2>
              <CalendarClock className="h-4 w-4 text-slate-400" />
            </div>

            <div
              className={`rounded-lg border p-4 ${
                is_open
                  ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                  : 'border-amber-200 bg-amber-50/60 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{is_open ? 'Pengumuman Sedang Terbuka' : 'Mode Hitung Mundur (Terkunci)'}</span>
              </div>
              <p className="text-xs mt-1.5 leading-relaxed opacity-90">
                Jadwal aktif:{' '}
                <strong>{formatIndonesianDate(profile.announcement_date)}</strong> pukul{' '}
                <strong className="font-mono">{profile.announcement_time} WIB</strong>
              </p>
            </div>

            <div className="space-y-2.5 text-sm border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Nomor SK</span>
                <span className="font-mono font-medium text-slate-800">{profile.sk_number || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Dokumen PDF Aktif</span>
                <span className="font-mono font-medium text-slate-800 tabular-nums">
                  {stats.active_documents_count} berkas
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('profile')}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Atur Profil & Jadwal Pengumuman
          </button>
        </div>

        {/* Re-registration Progress & Recent Submissions */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Progres Pengisian Formulir Daftar Ulang
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {stats.forms_submitted_count} dari {stats.accepted_count} calon siswa diterima telah melengkapi formulir
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('forms')}
              className="text-xs font-semibold text-[#1677FF] hover:text-[#0958D9] whitespace-nowrap"
            >
              Lihat Semua Formulir →
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600">Tingkat Kelengkapan</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {completionPct}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#16A34A] transition-all duration-300"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Pengisian Formulir Terbaru
            </h3>
            {stats.recent_forms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 px-4 text-center text-sm text-slate-500">
                <FileCheck2 className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                Belum ada peserta didik yang menyimpan formulir daftar ulang.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-2.5 pr-4">Nama Lengkap</th>
                      <th className="py-2.5 px-3">NISN</th>
                      <th className="py-2.5 px-3">Jalur</th>
                      <th className="py-2.5 pl-3 text-right">Terakhir Disimpan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.recent_forms.map((item) => (
                      <tr key={item.student_id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-4 font-medium text-slate-900">
                          {item.nama_lengkap}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-600 tabular-nums">
                          {item.nisn}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          {item.jalur_pendaftaran}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeWib(item.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
