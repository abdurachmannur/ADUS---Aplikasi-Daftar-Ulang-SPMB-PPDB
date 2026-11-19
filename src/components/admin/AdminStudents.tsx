import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile } from '../../lib/api';
import type { Student } from '../../types';

interface StudentFormState {
  no_urut: string;
  no_pendaftaran: string;
  nama_lengkap: string;
  nisn: string;
  asal_sekolah: string;
  jalur_pendaftaran: string;
  status: 'DITERIMA' | 'TIDAK DITERIMA';
  daftar_ulang_hari: string;
  daftar_ulang_tanggal: string;
  daftar_ulang_waktu: string;
  daftar_ulang_ruang: string;
}

const EMPTY_STUDENT: StudentFormState = {
  no_urut: '',
  no_pendaftaran: '',
  nama_lengkap: '',
  nisn: '',
  asal_sekolah: '',
  jalur_pendaftaran: 'Domisili',
  status: 'DITERIMA',
  daftar_ulang_hari: '',
  daftar_ulang_tanggal: '',
  daftar_ulang_waktu: '',
  daftar_ulang_ruang: '',
};

export function AdminStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DITERIMA' | 'TIDAK DITERIMA'>('ALL');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StudentFormState>(EMPTY_STUDENT);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Multi-select bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Excel import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      const res = await apiFetch<{ students: Student[] }>(
        `/api/admin/students?${qs.toString()}`,
        {},
        true
      );
      setStudents(res.students);
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const visibleIds = new Set(res.students.map((s) => s.id));
        const next = new Set<number>();
        prev.forEach((id) => {
          if (visibleIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat data siswa.',
      });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = window.setTimeout(fetchStudents, 200);
    return () => window.clearTimeout(t);
  }, [fetchStudents]);

  const openAddModal = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_STUDENT,
      no_urut: `T1-${String(students.length + 1).padStart(3, '0')}`,
    });
    setModalError('');
    setModalOpen(true);
  };

  const openEditModal = (s: Student) => {
    setEditingId(s.id);
    setForm({
      no_urut: s.no_urut,
      no_pendaftaran: s.no_pendaftaran,
      nama_lengkap: s.nama_lengkap,
      nisn: s.nisn,
      asal_sekolah: s.asal_sekolah,
      jalur_pendaftaran: s.jalur_pendaftaran,
      status: s.status,
      daftar_ulang_hari: s.daftar_ulang_hari || '',
      daftar_ulang_tanggal: s.daftar_ulang_tanggal || '',
      daftar_ulang_waktu: s.daftar_ulang_waktu || '',
      daftar_ulang_ruang: s.daftar_ulang_ruang || '',
    });
    setModalError('');
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      if (editingId) {
        await apiFetch(
          `/api/admin/students/${editingId}`,
          { method: 'PUT', body: JSON.stringify(form) },
          true
        );
        setNotice({ type: 'success', text: 'Data siswa berhasil diperbarui.' });
      } else {
        await apiFetch(
          '/api/admin/students',
          { method: 'POST', body: JSON.stringify(form) },
          true
        );
        setNotice({ type: 'success', text: 'Data siswa baru berhasil ditambahkan.' });
      }
      setModalOpen(false);
      fetchStudents();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/students/${deleteTarget.id}`, { method: 'DELETE' }, true);
      setNotice({
        type: 'success',
        text: `Data siswa "${deleteTarget.nama_lengkap}" berhasil dihapus.`,
      });
      setDeleteTarget(null);
      fetchStudents();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus data siswa.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const allVisibleSelected =
    students.length > 0 && students.every((s) => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await apiFetch<{ message: string; deleted_count: number }>(
        '/api/admin/students/bulk-delete',
        { method: 'POST', body: JSON.stringify({ ids }) },
        true
      );
      setNotice({ type: 'success', text: res.message });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchStudents();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus data siswa terpilih.',
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadAuthenticatedFile(
        '/api/admin/students/template',
        'Template_Impor_Siswa_SPMB.xlsx'
      );
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengunduh template Excel.',
      });
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await apiFetch<{
        message: string;
        summary: { inserted: number; updated: number; skipped: number; errors: string[] };
      }>('/api/admin/students/import', { method: 'POST', body: fd }, true);
      setImportResult({
        message: res.message,
        errors: res.summary.errors || [],
      });
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchStudents();
    } catch (err) {
      setImportResult({
        message: err instanceof Error ? err.message : 'Impor Excel gagal.',
        errors: [],
      });
    } finally {
      setImporting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15';

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
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
              placeholder="Cari nama, NISN, no pendaftaran, asal sekolah..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
            />
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0">
            {(
              [
                { key: 'ALL', label: 'Semua' },
                { key: 'DITERIMA', label: 'Diterima' },
                { key: 'TIDAK DITERIMA', label: 'Tidak Diterima' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Template Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setImportResult(null);
              setImportFile(null);
              setImportOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Impor Excel
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Siswa
          </button>
        </div>
      </div>

      {/* Contextual Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium text-red-900">
            <strong className="font-mono tabular-nums">{selectedIds.size}</strong> data siswa
            dipilih
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
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
              Hapus {selectedIds.size} Siswa Terpilih
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
            Memuat data siswa...
          </div>
        ) : students.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Belum ada data siswa yang cocok dengan filter pencarian.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9]"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Data Siswa
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Pilih semua siswa yang tampil"
                      className="h-4 w-4 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF]"
                    />
                  </th>
                  <th className="py-3 px-4 w-24">No Urut</th>
                  <th className="py-3 px-4">No Pendaftaran</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">NISN</th>
                  <th className="py-3 px-4">Asal Sekolah</th>
                  <th className="py-3 px-4">Jalur</th>
                  <th className="py-3 px-4">Ruang / Jadwal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((s) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-blue-50/50 hover:bg-blue-50/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(s.id)}
                        aria-label={`Pilih ${s.nama_lengkap}`}
                        className="h-4 w-4 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF]"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {s.no_urut}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {s.no_pendaftaran}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{s.nama_lengkap}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-800 tabular-nums">
                      {s.nisn}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{s.asal_sekolah}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {s.jalur_pendaftaran}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {s.daftar_ulang_ruang || s.daftar_ulang_tanggal ? (
                        <span>
                          {[s.daftar_ulang_ruang, s.daftar_ulang_tanggal].filter(Boolean).join(' · ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">Default global</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          s.status === 'DITERIMA' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-[#1677FF] hover:bg-blue-50 transition-colors"
                          title="Edit siswa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Hapus siswa"
                        >
                          <Trash2 className="h-4 w-4" />
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
            Menampilkan{' '}
            <strong className="font-mono text-slate-800 tabular-nums">{students.length}</strong>{' '}
            data siswa
          </span>
        </div>
      </div>

      {/* Add/Edit Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-xl w-full overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingId ? 'Edit Data Siswa' : 'Tambah Data Siswa'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No Urut *
                  </label>
                  <input
                    type="text"
                    value={form.no_urut}
                    onChange={(e) => setForm({ ...form, no_urut: e.target.value })}
                    className={`${inputClass} font-mono`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No Pendaftaran *
                  </label>
                  <input
                    type="text"
                    value={form.no_pendaftaran}
                    onChange={(e) => setForm({ ...form, no_pendaftaran: e.target.value })}
                    className={`${inputClass} font-mono`}
                    placeholder="SPMB-2026-0004"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap *
                  </label>
                  <input
                    type="text"
                    value={form.nama_lengkap}
                    onChange={(e) => setForm({ ...form, nama_lengkap: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NISN *</label>
                  <input
                    type="text"
                    value={form.nisn}
                    onChange={(e) => setForm({ ...form, nisn: e.target.value })}
                    className={`${inputClass} font-mono`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jalur Pendaftaran *
                  </label>
                  <input
                    type="text"
                    value={form.jalur_pendaftaran}
                    onChange={(e) => setForm({ ...form, jalur_pendaftaran: e.target.value })}
                    placeholder="Domisili / Prestasi / Afirmasi / Mutasi"
                    className={inputClass}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Asal Sekolah *
                  </label>
                  <input
                    type="text"
                    value={form.asal_sekolah}
                    onChange={(e) => setForm({ ...form, asal_sekolah: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status Kelulusan *
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as 'DITERIMA' | 'TIDAK DITERIMA' })
                    }
                    className={inputClass}
                  >
                    <option value="DITERIMA">DITERIMA</option>
                    <option value="TIDAK DITERIMA">TIDAK DITERIMA</option>
                  </select>
                </div>
              </div>

              {/* Optional Per-Student Schedule Override for Surat Pemanggilan */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Jadwal & Ruang Daftar Ulang Khusus Siswa Ini (Opsional)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Kosongkan jika ingin memakai jadwal default global dari menu Template & Pengaturan Surat.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hari
                    </label>
                    <input
                      type="text"
                      value={form.daftar_ulang_hari}
                      onChange={(e) => setForm({ ...form, daftar_ulang_hari: e.target.value })}
                      placeholder="JUM'AT"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tanggal
                    </label>
                    <input
                      type="text"
                      value={form.daftar_ulang_tanggal}
                      onChange={(e) => setForm({ ...form, daftar_ulang_tanggal: e.target.value })}
                      placeholder="26 JUNI 2026"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Waktu
                    </label>
                    <input
                      type="text"
                      value={form.daftar_ulang_waktu}
                      onChange={(e) => setForm({ ...form, daftar_ulang_waktu: e.target.value })}
                      placeholder="08.00-14.00 WIB"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Ruang
                    </label>
                    <input
                      type="text"
                      value={form.daftar_ulang_ruang}
                      onChange={(e) => setForm({ ...form, daftar_ulang_ruang: e.target.value })}
                      placeholder="RUANG 01"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Impor Massal Data Siswa (.xlsx)
              </h3>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleImportSubmit} className="p-6 space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-800">Panduan Format Kolom Excel:</p>
                <p>
                  Kolom wajib: <span className="font-mono">No Urut</span>,{' '}
                  <span className="font-mono">No Pendaftaran</span>,{' '}
                  <span className="font-mono">Nama Lengkap</span>,{' '}
                  <span className="font-mono">NISN</span>,{' '}
                  <span className="font-mono">Asal Sekolah</span>,{' '}
                  <span className="font-mono">Jalur Pendaftaran</span>,{' '}
                  <span className="font-mono">Status</span>. Kolom opsional jadwal pemanggilan:{' '}
                  <span className="font-mono">Hari Daftar Ulang</span>,{' '}
                  <span className="font-mono">Tanggal Daftar Ulang</span>,{' '}
                  <span className="font-mono">Waktu Daftar Ulang</span>,{' '}
                  <span className="font-mono">Ruang Daftar Ulang</span>.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-[#1677FF] font-semibold hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh Template Excel (.xlsx)
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pilih File Excel (.xlsx / .xls)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  required
                />
              </div>

              {importResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1.5">
                  <p className="font-semibold text-slate-900">{importResult.message}</p>
                  {importResult.errors.length > 0 && (
                    <ul className="list-disc pl-4 text-red-700 space-y-0.5">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={!importFile || importing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Mengimpor...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Mulai Impor
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Hapus Data Siswa?</h3>
            <p className="text-sm text-slate-600">
              Data <strong>{deleteTarget.nama_lengkap}</strong> (NISN{' '}
              <span className="font-mono">{deleteTarget.nisn}</span>) beserta isian formulir daftar
              ulangnya akan dihapus permanen.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">
              Hapus {selectedIds.size} Data Siswa Terpilih?
            </h3>
            <p className="text-sm text-slate-600">
              Seluruh <strong className="font-mono">{selectedIds.size}</strong> data siswa yang
              dipilih beserta isian formulir daftar ulang dan PIN terkait akan dihapus permanen.
              Untuk pembersihan satu tahun ajaran lengkap dengan Auto-Backup otomatis, Anda juga
              dapat menggunakan menu <strong>Backup, Restore &amp; Tahun Baru</strong>.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {bulkDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ya, Hapus {selectedIds.size} Siswa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
