import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDateTimeWib,
  formatFileSize,
} from '../../lib/api';
import type { DocumentItem } from '../../types';

export function AdminDocuments() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [title, setTitle] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ documents: DocumentItem[] }>('/api/admin/documents', {}, true);
      setDocs(res.documents);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat daftar dokumen PDF.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const openAddModal = () => {
    setEditingDoc(null);
    setTitle('');
    setIsActive(true);
    setPdfFile(null);
    setModalError('');
    setModalOpen(true);
  };

  const openEditModal = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setIsActive(Boolean(doc.is_active));
    setPdfFile(null);
    setModalError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setModalError('Judul dokumen wajib diisi.');
      return;
    }
    if (!editingDoc && !pdfFile) {
      setModalError('Pilih file PDF untuk diunggah.');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('is_active', String(isActive));
      if (pdfFile) {
        fd.append('file', pdfFile);
      }

      if (editingDoc) {
        await apiFetch(`/api/admin/documents/${editingDoc.id}`, { method: 'PUT', body: fd }, true);
        setNotice({ type: 'success', text: 'Dokumen PDF berhasil diperbarui.' });
      } else {
        await apiFetch('/api/admin/documents', { method: 'POST', body: fd }, true);
        setNotice({ type: 'success', text: 'Dokumen PDF baru berhasil diunggah.' });
      }
      setModalOpen(false);
      await loadDocs();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menyimpan dokumen PDF.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (doc: DocumentItem) => {
    try {
      const fd = new FormData();
      fd.append('title', doc.title);
      fd.append('is_active', String(!doc.is_active));
      await apiFetch(`/api/admin/documents/${doc.id}`, { method: 'PUT', body: fd }, true);
      await loadDocs();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah status dokumen.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/documents/${deleteTarget.id}`, { method: 'DELETE' }, true);
      setNotice({ type: 'success', text: `Dokumen "${deleteTarget.title}" berhasil dihapus.` });
      setDeleteTarget(null);
      await loadDocs();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus dokumen.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handlePreviewDownload = async (doc: DocumentItem) => {
    try {
      await downloadAuthenticatedFile(`/api/admin/documents/${doc.id}/download`, doc.file_name);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengunduh file PDF.',
      });
    }
  };

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
          <button type="button" onClick={() => setNotice(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900">
            Dokumen Daftar Ulang (PDF)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dokumen berstatus aktif akan tampil sebagai tombol unduh pada halaman hasil seleksi siswa yang dinyatakan DITERIMA.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Unggah Dokumen PDF
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
            Memuat daftar dokumen...
          </div>
        ) : docs.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <FileText className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-600">Belum ada dokumen PDF yang diunggah.</p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9]"
            >
              <Upload className="h-3.5 w-3.5" />
              Unggah PDF Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Judul Dokumen</th>
                  <th className="py-3 px-4">Nama Berkas</th>
                  <th className="py-3 px-4">Ukuran</th>
                  <th className="py-3 px-4">Diunggah</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-md bg-red-50 text-red-700 border border-red-100 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-slate-900">{doc.title}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 max-w-xs truncate">
                      {doc.file_name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatDateTimeWib(doc.created_at)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(doc)}
                        className={`inline-flex items-center gap-2 text-xs font-semibold ${
                          doc.is_active ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            doc.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              doc.is_active ? 'translate-x-4.5' : 'translate-x-1'
                            }`}
                          />
                        </span>
                        {doc.is_active ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handlePreviewDownload(doc)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-[#1677FF] hover:bg-blue-50 transition-colors"
                          title="Unduh berkas PDF"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(doc)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-[#1677FF] hover:bg-blue-50 transition-colors"
                          title="Edit / Ganti PDF"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(doc)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Hapus dokumen"
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
      </div>

      {/* Upload / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {editingDoc ? 'Edit / Ganti Dokumen PDF' : 'Unggah Dokumen PDF Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Judul Tampilan Dokumen *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Surat Pernyataan Diterima"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {editingDoc ? 'Ganti File PDF (opsional)' : 'File PDF *'}
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3.5 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  required={!editingDoc}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Format .pdf, ukuran maksimal 10 MB.
                  {editingDoc && !pdfFile ? ` Berkas saat ini: ${editingDoc.file_name}` : ''}
                </p>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1677FF] focus:ring-[#1677FF]"
                />
                <span>Tampilkan dokumen ini pada halaman siswa diterima</span>
              </label>

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
                  {editingDoc ? 'Simpan Perubahan' : 'Unggah PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Hapus Dokumen PDF?</h3>
            <p className="text-sm text-slate-600">
              Berkas <strong>{deleteTarget.title}</strong> akan dihapus permanen dari server dan tidak
              lagi dapat diunduh oleh calon siswa.
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
                Hapus Dokumen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
