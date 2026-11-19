import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { FORM_OPTION_CATEGORIES } from '../../types';
import type { FormOption, FormOptionCategory } from '../../types';

export function AdminFormOptions() {
  const [activeCategory, setActiveCategory] = useState<FormOptionCategory>('jenis_kelamin');
  const [allOptions, setAllOptions] = useState<FormOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add inline form
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const res = await apiFetch<{ options: FormOption[] }>('/api/admin/form-options', {}, true);
      setAllOptions(res.options);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat daftar pilihan formulir.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const currentMeta = FORM_OPTION_CATEGORIES.find((c) => c.key === activeCategory)!;
  const currentOptions = allOptions.filter((o) => o.category === activeCategory);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newLabel.trim();
    if (!cleaned) return;
    setAdding(true);
    setNotice(null);
    try {
      await apiFetch(
        '/api/admin/form-options',
        {
          method: 'POST',
          body: JSON.stringify({ category: activeCategory, label: cleaned, is_active: true }),
        },
        true
      );
      setNewLabel('');
      setNotice({ type: 'success', text: `Pilihan "${cleaned}" berhasil ditambahkan.` });
      await loadOptions();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menambahkan pilihan.',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (opt: FormOption) => {
    const cleaned = editingLabel.trim();
    if (!cleaned) return;
    setUpdatingId(opt.id);
    setNotice(null);
    try {
      await apiFetch(
        `/api/admin/form-options/${opt.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ label: cleaned }),
        },
        true
      );
      setEditingId(null);
      setNotice({ type: 'success', text: 'Label pilihan berhasil diperbarui.' });
      await loadOptions();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui pilihan.',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (opt: FormOption) => {
    setUpdatingId(opt.id);
    setNotice(null);
    try {
      await apiFetch(
        `/api/admin/form-options/${opt.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ is_active: !opt.is_active }),
        },
        true
      );
      await loadOptions();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah status pilihan.',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (opt: FormOption) => {
    setUpdatingId(opt.id);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/form-options/${opt.id}`, { method: 'DELETE' }, true);
      setNotice({ type: 'success', text: `Pilihan "${opt.label}" berhasil dihapus.` });
      await loadOptions();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus pilihan.',
      });
    } finally {
      setUpdatingId(null);
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

      {/* Category Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="flex flex-wrap gap-1.5">
          {FORM_OPTION_CATEGORIES.map((cat) => {
            const count = allOptions.filter((o) => o.category === cat.key && o.is_active).length;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.key);
                  setEditingId(null);
                  setNewLabel('');
                }}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#1677FF] text-white'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    isActive ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Management Panel */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              {currentMeta.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{currentMeta.description}</p>
          </div>

          <form onSubmit={handleAdd} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={`Tambah pilihan ${currentMeta.label.toLowerCase()}...`}
              className="flex-1 md:w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15"
              required
            />
            <button
              type="submit"
              disabled={adding || !newLabel.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Tambah
            </button>
          </form>
        </div>

        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
            Memuat pilihan dropdown...
          </div>
        ) : currentOptions.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Belum ada pilihan pada kategori ini. Tambahkan pilihan baru melalui kolom di atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-16">No</th>
                  <th className="py-3 px-4">Label Pilihan Dropdown</th>
                  <th className="py-3 px-4 w-36">Status Tampil</th>
                  <th className="py-3 px-4 w-36 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentOptions.map((opt, idx) => {
                  const isEditing = editingId === opt.id;
                  const busy = updatingId === opt.id;
                  return (
                    <tr key={opt.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2 max-w-md">
                            <input
                              type="text"
                              value={editingLabel}
                              onChange={(e) => setEditingLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(opt);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="flex-1 rounded-md border border-[#1677FF] bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20"
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSaveEdit(opt)}
                              className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                              title="Simpan"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
                              title="Batal"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`font-medium ${
                              opt.is_active ? 'text-slate-900' : 'text-slate-400 line-through'
                            }`}
                          >
                            {opt.label}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleActive(opt)}
                          className={`inline-flex items-center gap-2 text-xs font-semibold transition-colors ${
                            opt.is_active ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          <span
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              opt.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                opt.is_active ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </span>
                          {opt.is_active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(opt.id);
                              setEditingLabel(opt.label);
                            }}
                            className="p-1.5 rounded-md text-slate-500 hover:text-[#1677FF] hover:bg-blue-50 transition-colors"
                            title="Ubah label"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(opt)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus pilihan"
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
      </div>
    </div>
  );
}
