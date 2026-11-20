import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  Loader2,
  Move,
  RotateCcw,
  Save,
  Stamp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile, getAdminToken } from '../../lib/api';
import type { LetterSettings } from '../../types';

type LetterTab = 'kepsek' | 'diterima' | 'pemanggilan' | 'pernyataan_pdb';
type ActiveLayer = 'cap' | 'ttd';
type PreviewLetterMode = 'diterima' | 'pemanggilan';

// Full unclipped PDF-point coordinate box around (sigX, startY) matching drawKepsekSignatureBlock:
// Left edge = sigX - 120pt, Right edge = sigX + 240pt (360pt total)
// Top edge = startY - 28pt, Bottom edge = startY + 132pt (160pt total)
const CANVAS_PT_W = 360;
const CANVAS_PT_H = 160;
const ORIGIN_X = 120;
const ORIGIN_Y = 28;

const DEFAULT_PLACEMENT = {
  cap_x: -46,
  cap_y: 6,
  cap_width: 86,
  ttd_x: 0,
  ttd_y: 18,
  ttd_width: 124,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function AdminLetterSettings() {
  const [activeTab, setActiveTab] = useState<LetterTab>('kepsek');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState<LetterSettings | null>(null);

  const [capFile, setCapFile] = useState<File | null>(null);
  const [capPreview, setCapPreview] = useState('');
  const [removeCap, setRemoveCap] = useState(false);

  const [ttdFile, setTtdFile] = useState<File | null>(null);
  const [ttdPreview, setTtdPreview] = useState('');
  const [removeTtd, setRemoveTtd] = useState(false);

  const capInputRef = useRef<HTMLInputElement>(null);
  const ttdInputRef = useRef<HTMLInputElement>(null);

  // Interactive drag & resize state for Cap & TTD preview
  const [selectedLayer, setSelectedLayer] = useState<ActiveLayer>('ttd');
  const [previewLetterMode, setPreviewLetterMode] = useState<PreviewLetterMode>('diterima');
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1.25);

  // Live PDF Modal state (renders actual PDFKit output with current coordinates)
  const [livePdfUrl, setLivePdfUrl] = useState<string | null>(null);
  const [livePdfTitle, setLivePdfTitle] = useState('');
  const [loadingLivePdf, setLoadingLivePdf] = useState(false);

  const dragSessionRef = useRef<{
    layer: ActiveLayer;
    mode: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    aspect: number;
    scale: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ settings: LetterSettings }>('/api/admin/letter-settings', {}, true)
      .then((res) => {
        if (active) setForm(res.settings);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan surat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Measure canvas width dynamically so px/pt ratio is exact with zero horizontal scroll
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const syncScale = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40) {
        setCanvasScale(rect.width / CANVAS_PT_W);
      }
    };
    syncScale();
    const ro = new ResizeObserver(syncScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab, loading]);

  // Revoke live PDF blob URL on unmount or replacement
  useEffect(() => {
    return () => {
      if (livePdfUrl) URL.revokeObjectURL(livePdfUrl);
    };
  }, [livePdfUrl]);

  const updateField = (key: keyof LetterSettings, value: string | number) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (success) setSuccess('');
    if (error) setError('');
  };

  const handleResetPlacement = () => {
    setForm((prev) => (prev ? { ...prev, ...DEFAULT_PLACEMENT } : prev));
    if (success) setSuccess('');
  };

  const startDragOrResize = (
    e: React.PointerEvent<HTMLElement>,
    layer: ActiveLayer,
    mode: 'move' | 'resize'
  ) => {
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedLayer(layer);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const containerEl =
      mode === 'resize'
        ? (e.currentTarget.parentElement as HTMLElement | null)
        : (e.currentTarget as HTMLElement);
    const rect = containerEl?.getBoundingClientRect();
    const aspect =
      rect && rect.width > 10 && rect.height > 10 ? rect.height / rect.width : 0.6;

    dragSessionRef.current = {
      layer,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX:
        layer === 'cap'
          ? Number(form.cap_x ?? DEFAULT_PLACEMENT.cap_x)
          : Number(form.ttd_x ?? DEFAULT_PLACEMENT.ttd_x),
      startY:
        layer === 'cap'
          ? Number(form.cap_y ?? DEFAULT_PLACEMENT.cap_y)
          : Number(form.ttd_y ?? DEFAULT_PLACEMENT.ttd_y),
      startW:
        layer === 'cap'
          ? Number(form.cap_width ?? DEFAULT_PLACEMENT.cap_width)
          : Number(form.ttd_width ?? DEFAULT_PLACEMENT.ttd_width),
      aspect,
      scale: canvasScale || 1.25,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const session = dragSessionRef.current;
    if (!session) return;
    e.stopPropagation();
    const dxPt = (e.clientX - session.startClientX) / session.scale;
    const dyPt = (e.clientY - session.startClientY) / session.scale;

    // Aspect-locked projection onto the bottom-right corner ray for natural diagonal resizing
    const projectedDeltaW =
      (dxPt + dyPt * session.aspect) / (1 + session.aspect * session.aspect);

    setForm((prev) => {
      if (!prev) return prev;
      if (session.layer === 'cap') {
        if (session.mode === 'move') {
          return {
            ...prev,
            cap_x: clamp(session.startX + dxPt, -120, 180),
            cap_y: clamp(session.startY + dyPt, -40, 110),
          };
        }
        return {
          ...prev,
          cap_width: clamp(session.startW + projectedDeltaW, 32, 180),
        };
      }
      if (session.mode === 'move') {
        return {
          ...prev,
          ttd_x: clamp(session.startX + dxPt, -100, 180),
          ttd_y: clamp(session.startY + dyPt, -40, 110),
        };
      }
      return {
        ...prev,
        ttd_width: clamp(session.startW + projectedDeltaW, 36, 210),
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (dragSessionRef.current) {
      e.stopPropagation();
      dragSessionRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore if pointer already released
      }
    }
  };

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!form) return;
    const step = e.shiftKey ? 5 : 1;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    setForm((prev) => {
      if (!prev) return prev;
      if (selectedLayer === 'cap') {
        return {
          ...prev,
          cap_x: clamp(Number(prev.cap_x ?? DEFAULT_PLACEMENT.cap_x) + dx, -120, 180),
          cap_y: clamp(Number(prev.cap_y ?? DEFAULT_PLACEMENT.cap_y) + dy, -40, 110),
        };
      }
      return {
        ...prev,
        ttd_x: clamp(Number(prev.ttd_x ?? DEFAULT_PLACEMENT.ttd_x) + dx, -100, 180),
        ttd_y: clamp(Number(prev.ttd_y ?? DEFAULT_PLACEMENT.ttd_y) + dy, -40, 110),
      };
    });
  };

  const buildLivePreviewQuery = (): string => {
    if (!form) return '';
    const params = new URLSearchParams();
    params.set('cap_x', String(form.cap_x ?? DEFAULT_PLACEMENT.cap_x));
    params.set('cap_y', String(form.cap_y ?? DEFAULT_PLACEMENT.cap_y));
    params.set('cap_width', String(form.cap_width ?? DEFAULT_PLACEMENT.cap_width));
    params.set('ttd_x', String(form.ttd_x ?? DEFAULT_PLACEMENT.ttd_x));
    params.set('ttd_y', String(form.ttd_y ?? DEFAULT_PLACEMENT.ttd_y));
    params.set('ttd_width', String(form.ttd_width ?? DEFAULT_PLACEMENT.ttd_width));
    if (form.kepsek_nama) params.set('kepsek_nama', form.kepsek_nama);
    if (form.kepsek_nip) params.set('kepsek_nip', form.kepsek_nip);
    if (form.diterima_titimangsa) params.set('diterima_titimangsa', form.diterima_titimangsa);
    if (form.diterima_jabatan) params.set('diterima_jabatan', form.diterima_jabatan);
    if (form.pemanggilan_titimangsa)
      params.set('pemanggilan_titimangsa', form.pemanggilan_titimangsa);
    if (form.pemanggilan_jabatan) params.set('pemanggilan_jabatan', form.pemanggilan_jabatan);
    return params.toString();
  };

  const handleOpenLivePdfModal = async () => {
    if (!form) return;
    if (capFile || ttdFile) {
      setError(
        'Simpan terlebih dahulu gambar Cap/TTD yang baru diunggah agar tampil di pratinjau PDF asli.'
      );
      return;
    }
    setLoadingLivePdf(true);
    setError('');
    try {
      const docType =
        previewLetterMode === 'diterima' ? 'pernyataan-diterima' : 'pemanggilan-daftar-ulang';
      const title =
        previewLetterMode === 'diterima'
          ? 'Pratinjau PDF Asli — Surat Pernyataan Diterima'
          : 'Pratinjau PDF Asli — Surat Pemanggilan Daftar Ulang';
      const qs = buildLivePreviewQuery();
      const token = getAdminToken();
      const resp = await fetch(`/api/admin/letter-settings/preview/${docType}?inline=1&${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.error || 'Gagal memuat pratinjau PDF asli.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setLivePdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setLivePdfTitle(title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka pratinjau PDF asli.');
    } finally {
      setLoadingLivePdf(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const fd = new FormData();
      const textKeys: Array<keyof LetterSettings> = [
        'kepsek_nama',
        'kepsek_nip',
        'diterima_nomor',
        'diterima_pembuka',
        'diterima_penutup',
        'diterima_titimangsa',
        'diterima_jabatan',
        'pemanggilan_judul',
        'pemanggilan_titimangsa',
        'pemanggilan_jabatan',
        'default_du_hari',
        'default_du_tanggal',
        'default_du_waktu',
        'default_du_ruang',
        'pemanggilan_catatan_1',
        'pemanggilan_kelengkapan',
        'pemanggilan_catatan_3',
        'pernyataan_pdb_judul',
        'pernyataan_pdb_pengantar',
        'pernyataan_pdb_isi',
        'pernyataan_pdb_penutup',
        'pernyataan_pdb_titimangsa',
        'pernyataan_pdb_materai',
        'cap_x',
        'cap_y',
        'cap_width',
        'ttd_x',
        'ttd_y',
        'ttd_width',
      ];

      for (const k of textKeys) {
        fd.append(k, String(form[k] ?? ''));
      }

      if (capFile) {
        fd.append('cap_sekolah', capFile);
      } else if (removeCap) {
        fd.append('remove_cap', 'true');
      }

      if (ttdFile) {
        fd.append('ttd_kepsek', ttdFile);
      } else if (removeTtd) {
        fd.append('remove_ttd', 'true');
      }

      const res = await apiFetch<{ message: string; settings: LetterSettings }>(
        '/api/admin/letter-settings',
        { method: 'PUT', body: fd },
        true
      );

      setForm(res.settings);
      setCapFile(null);
      setCapPreview('');
      setRemoveCap(false);
      setTtdFile(null);
      setTtdPreview('');
      setRemoveTtd(false);
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan template surat.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewPdf = async (
    docType: 'pernyataan-diterima' | 'pemanggilan-daftar-ulang' | 'pernyataan-pdb' | 'formulir-pdb',
    fileName: string
  ) => {
    setPreviewing(docType);
    setError('');
    try {
      const qs = buildLivePreviewQuery();
      await downloadAuthenticatedFile(
        `/api/admin/letter-settings/preview/${docType}${qs ? `?${qs}` : ''}`,
        fileName
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh pratinjau PDF.');
    } finally {
      setPreviewing(null);
    }
  };

  if (loading || !form) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 flex items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
        <span className="text-sm">Memuat pengaturan template surat...</span>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15';

  const adminToken = getAdminToken();
  const currentCapSrc =
    capPreview ||
    (removeCap || !form.cap_path
      ? ''
      : `/api/admin/letter-settings/asset/cap?token=${encodeURIComponent(adminToken || '')}&v=${encodeURIComponent(form.cap_path)}`);
  const currentTtdSrc =
    ttdPreview ||
    (removeTtd || !form.ttd_path
      ? ''
      : `/api/admin/letter-settings/asset/ttd?token=${encodeURIComponent(adminToken || '')}&v=${encodeURIComponent(form.ttd_path)}`);
  return (
    <form onSubmit={handleSave} className="space-y-5">
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

      {/* Navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-wrap gap-1.5">
        {(
          [
            { key: 'kepsek', label: '1. Kepala Sekolah, Cap & TTD' },
            { key: 'diterima', label: '2. Surat Pernyataan Diterima' },
            { key: 'pemanggilan', label: '3. Surat Pemanggilan Daftar Ulang' },
            { key: 'pernyataan_pdb', label: '4. Pernyataan & Formulir PDB' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-[#1677FF] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: KEPALA SEKOLAH, CAP & TTD */}
      {activeTab === 'kepsek' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-6 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Identitas Penandatangan & Stempel Sekolah
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Digunakan otomatis pada <strong>Surat Pernyataan Diterima</strong> dan{' '}
                <strong>Surat Pemanggilan Daftar Ulang</strong>. Unggah gambar PNG berlatar
                transparan agar Cap Sekolah dan Tanda Tangan menyatu alami di atas kertas surat.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap & Gelar Kepala Sekolah *
                </label>
                <input
                  type="text"
                  value={form.kepsek_nama}
                  onChange={(e) => updateField('kepsek_nama', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  NIP Kepala Sekolah *
                </label>
                <input
                  type="text"
                  value={form.kepsek_nip}
                  onChange={(e) => updateField('kepsek_nip', e.target.value)}
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {/* Upload Cap Sekolah */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Stamp className="h-4 w-4 text-[#1677FF]" />
                  <span>Cap / Stempel Sekolah (PNG Transparan)</span>
                </div>
                <div className="h-32 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-2">
                  {currentCapSrc ? (
                    <img
                      src={currentCapSrc}
                      alt="Pratinjau Cap Sekolah"
                      referrerPolicy="no-referrer"
                      className="max-h-28 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada gambar Cap Sekolah</span>
                  )}
                </div>
                <input
                  ref={capInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCapFile(file);
                      setCapPreview(URL.createObjectURL(file));
                      setRemoveCap(false);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => capInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Unggah Cap
                  </button>
                  {currentCapSrc && (
                    <button
                      type="button"
                      onClick={() => {
                        setCapFile(null);
                        setCapPreview('');
                        setRemoveCap(true);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  )}
                </div>
              </div>

              {/* Upload TTD Kepala Sekolah */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <FileSignature className="h-4 w-4 text-[#1677FF]" />
                  <span>Tanda Tangan Kepala Sekolah (PNG Transparan)</span>
                </div>
                <div className="h-32 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-2">
                  {currentTtdSrc ? (
                    <img
                      src={currentTtdSrc}
                      alt="Pratinjau Tanda Tangan"
                      referrerPolicy="no-referrer"
                      className="max-h-28 max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada gambar Tanda Tangan</span>
                  )}
                </div>
                <input
                  ref={ttdInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setTtdFile(file);
                      setTtdPreview(URL.createObjectURL(file));
                      setRemoveTtd(false);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => ttdInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Unggah TTD
                  </button>
                  {currentTtdSrc && (
                    <button
                      type="button"
                      onClick={() => {
                        setTtdFile(null);
                        setTtdPreview('');
                        setRemoveTtd(true);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Drag & Resize Calibration Studio (1:1 PDF-Point Parity) */}
          <div className="xl:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Pratinjau & Kalibrasi Presisi Cap & TTD (1:1 PDF)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Geser langsung, tarik sudut kanan-bawah untuk ubah ukuran, atau gunakan tombol panah keyboard (Shift+Panah = 5pt).
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={loadingLivePdf}
                  onClick={handleOpenLivePdfModal}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#1677FF] bg-[#1677FF]/5 px-2.5 py-1 text-[11px] font-semibold text-[#1677FF] hover:bg-[#1677FF]/10 disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {loadingLivePdf ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  Pratinjau PDF Asli
                </button>
                <button
                  type="button"
                  onClick={handleResetPlacement}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  title="Kembalikan posisi dan ukuran default"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>

            {/* Layer & Letter Mode Switchers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedLayer('cap')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedLayer === 'cap'
                      ? 'bg-white text-[#1677FF] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Stamp className="h-3.5 w-3.5" />
                  Atur Cap
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLayer('ttd')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedLayer === 'ttd'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSignature className="h-3.5 w-3.5" />
                  Atur TTD
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewLetterMode('diterima')}
                  className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    previewLetterMode === 'diterima'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Surat Diterima
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewLetterMode('pemanggilan')}
                  className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    previewLetterMode === 'pemanggilan'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Surat Pemanggilan
                </button>
              </div>
            </div>

            {/* Responsive 1:1 PDF-Point Coordinate Canvas (Zero Clipping, Zero Horizontal Scroll) */}
            <div
              ref={canvasRef}
              tabIndex={0}
              onKeyDown={handleCanvasKeyDown}
              aria-label="Kanvas pratinjau posisi Cap Sekolah dan Tanda Tangan Kepala Sekolah"
              className="relative w-full aspect-[360/160] rounded-md border border-slate-300 bg-white select-none overflow-hidden shadow-inner focus:outline-none focus:ring-2 focus:ring-[#1677FF]/30"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)',
                backgroundSize: '14px 14px',
              }}
            >
              {/* Subtle vertical guide at X = 0 (text left edge sigX = 320pt) */}
              <div
                className="absolute top-0 bottom-0 border-l border-dashed border-slate-200 pointer-events-none"
                style={{ left: `${ORIGIN_X * canvasScale}px` }}
              />

              {/* Layer 1 (z-10): Exact Text Anchors Matching drawKepsekSignatureBlock */}
              <div
                className="absolute z-10 text-black pointer-events-none whitespace-nowrap"
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  lineHeight: 1.15,
                  left: `${ORIGIN_X * canvasScale}px`,
                  top: `${ORIGIN_Y * canvasScale}px`,
                  fontSize: `${10.5 * canvasScale}px`,
                }}
              >
                {previewLetterMode === 'diterima'
                  ? form.diterima_titimangsa || 'Cihaurbeuti, 22 Juni 2026'
                  : form.pemanggilan_titimangsa || 'Cihaurbeuti, 22 Juni 2026'}
              </div>
              <div
                className="absolute z-10 text-black pointer-events-none whitespace-nowrap"
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  lineHeight: 1.15,
                  left: `${ORIGIN_X * canvasScale}px`,
                  top: `${(ORIGIN_Y + 14) * canvasScale}px`,
                  fontSize: `${10.5 * canvasScale}px`,
                }}
              >
                {previewLetterMode === 'diterima'
                  ? form.diterima_jabatan || 'Kepala,'
                  : form.pemanggilan_jabatan || 'Kepala Sekolah,'}
              </div>
              <div
                className="absolute z-10 font-bold text-black pointer-events-none whitespace-nowrap"
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  lineHeight: 1.15,
                  left: `${ORIGIN_X * canvasScale}px`,
                  top: `${(ORIGIN_Y + 78) * canvasScale}px`,
                  fontSize: `${10.5 * canvasScale}px`,
                }}
              >
                {form.kepsek_nama || 'Nama Kepala Sekolah'}
              </div>
              <div
                className="absolute z-10 text-black pointer-events-none whitespace-nowrap"
                style={{
                  fontFamily: '"Times New Roman", Times, serif',
                  lineHeight: 1.15,
                  left: `${ORIGIN_X * canvasScale}px`,
                  top: `${(ORIGIN_Y + 92) * canvasScale}px`,
                  fontSize: `${10.5 * canvasScale}px`,
                }}
              >
                NIP. {form.kepsek_nip || '-'}
              </div>

              {/* Layer 2 (z-20): Draggable & Resizable Cap Sekolah (Exact PDF Z-Order) */}
              {currentCapSrc && (
                <div
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => startDragOrResize(e, 'cap', 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className={`absolute z-20 touch-none cursor-grab active:cursor-grabbing ${
                    selectedLayer === 'cap'
                      ? 'ring-1 ring-[#1677FF] ring-dashed bg-[#1677FF]/[0.04]'
                      : 'hover:ring-1 hover:ring-slate-400/70'
                  }`}
                  style={{
                    left: `${(ORIGIN_X + Number(form.cap_x ?? DEFAULT_PLACEMENT.cap_x)) * canvasScale}px`,
                    top: `${(ORIGIN_Y + Number(form.cap_y ?? DEFAULT_PLACEMENT.cap_y)) * canvasScale}px`,
                    width: `${Number(form.cap_width ?? DEFAULT_PLACEMENT.cap_width) * canvasScale}px`,
                  }}
                >
                  <img
                    src={currentCapSrc}
                    alt="Cap Sekolah"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto block opacity-90 mix-blend-multiply pointer-events-none"
                  />
                  {selectedLayer === 'cap' && (
                    <div
                      title="Tarik sudut untuk mengubah ukuran Cap Sekolah"
                      onPointerDown={(e) => startDragOrResize(e, 'cap', 'resize')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="absolute -right-2 -bottom-2 h-4 w-4 rounded-sm bg-[#1677FF] border-2 border-white shadow cursor-nwse-resize"
                    />
                  )}
                </div>
              )}

              {/* Layer 3 (z-30): Draggable & Resizable TTD Kepala Sekolah (Exact PDF Z-Order) */}
              {currentTtdSrc && (
                <div
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => startDragOrResize(e, 'ttd', 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className={`absolute z-30 touch-none cursor-grab active:cursor-grabbing ${
                    selectedLayer === 'ttd'
                      ? 'ring-1 ring-emerald-600 ring-dashed bg-emerald-500/[0.04]'
                      : 'hover:ring-1 hover:ring-slate-400/70'
                  }`}
                  style={{
                    left: `${(ORIGIN_X + Number(form.ttd_x ?? DEFAULT_PLACEMENT.ttd_x)) * canvasScale}px`,
                    top: `${(ORIGIN_Y + Number(form.ttd_y ?? DEFAULT_PLACEMENT.ttd_y)) * canvasScale}px`,
                    width: `${Number(form.ttd_width ?? DEFAULT_PLACEMENT.ttd_width) * canvasScale}px`,
                  }}
                >
                  <img
                    src={currentTtdSrc}
                    alt="Tanda Tangan Kepala Sekolah"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto block mix-blend-multiply pointer-events-none"
                  />
                  {selectedLayer === 'ttd' && (
                    <div
                      title="Tarik sudut untuk mengubah ukuran Tanda Tangan"
                      onPointerDown={(e) => startDragOrResize(e, 'ttd', 'resize')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="absolute -right-2 -bottom-2 h-4 w-4 rounded-sm bg-emerald-600 border-2 border-white shadow cursor-nwse-resize"
                    />
                  )}
                </div>
              )}

              {!currentCapSrc && !currentTtdSrc && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-50/60 pointer-events-none">
                  <span className="text-[11px] text-slate-400 bg-white/95 px-3 py-1 rounded border border-slate-200">
                    Unggah Cap / TTD untuk mengatur posisi
                  </span>
                </div>
              )}
            </div>

            {/* Precision Sliders & Numeric Readout */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
              {selectedLayer === 'cap' ? (
                <>
                  <div className="flex items-center justify-between text-slate-700 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Move className="h-3.5 w-3.5 text-[#1677FF]" />
                      Posisi & Ukuran Cap Sekolah
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      X:{form.cap_x}pt · Y:{form.cap_y}pt · L:{form.cap_width}pt
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Lebar Cap</span>
                        <span className="font-mono tabular-nums">{form.cap_width} pt</span>
                      </div>
                      <input
                        type="range"
                        min={32}
                        max={180}
                        value={Number(form.cap_width ?? DEFAULT_PLACEMENT.cap_width)}
                        onChange={(e) => updateField('cap_width', Number(e.target.value))}
                        className="w-full accent-[#1677FF]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                          <span>Geser Kiri/Kanan (X)</span>
                          <span className="font-mono tabular-nums">{form.cap_x} pt</span>
                        </div>
                        <input
                          type="range"
                          min={-120}
                          max={180}
                          value={Number(form.cap_x ?? DEFAULT_PLACEMENT.cap_x)}
                          onChange={(e) => updateField('cap_x', Number(e.target.value))}
                          className="w-full accent-[#1677FF]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                          <span>Geser Atas/Bawah (Y)</span>
                          <span className="font-mono tabular-nums">{form.cap_y} pt</span>
                        </div>
                        <input
                          type="range"
                          min={-40}
                          max={110}
                          value={Number(form.cap_y ?? DEFAULT_PLACEMENT.cap_y)}
                          onChange={(e) => updateField('cap_y', Number(e.target.value))}
                          className="w-full accent-[#1677FF]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-slate-700 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Move className="h-3.5 w-3.5 text-emerald-600" />
                      Posisi & Ukuran Tanda Tangan
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      X:{form.ttd_x}pt · Y:{form.ttd_y}pt · L:{form.ttd_width}pt
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Lebar Tanda Tangan</span>
                        <span className="font-mono tabular-nums">{form.ttd_width} pt</span>
                      </div>
                      <input
                        type="range"
                        min={36}
                        max={210}
                        value={Number(form.ttd_width ?? DEFAULT_PLACEMENT.ttd_width)}
                        onChange={(e) => updateField('ttd_width', Number(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                          <span>Geser Kiri/Kanan (X)</span>
                          <span className="font-mono tabular-nums">{form.ttd_x} pt</span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={180}
                          value={Number(form.ttd_x ?? DEFAULT_PLACEMENT.ttd_x)}
                          onChange={(e) => updateField('ttd_x', Number(e.target.value))}
                          className="w-full accent-emerald-600"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                          <span>Geser Atas/Bawah (Y)</span>
                          <span className="font-mono tabular-nums">{form.ttd_y} pt</span>
                        </div>
                        <input
                          type="range"
                          min={-40}
                          max={110}
                          value={Number(form.ttd_y ?? DEFAULT_PLACEMENT.ttd_y)}
                          onChange={(e) => updateField('ttd_y', Number(e.target.value))}
                          className="w-full accent-emerald-600"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Gunakan <strong>Pratinjau PDF Asli</strong> untuk memastikan posisi Cap & TTD 100% sesuai di kertas A4 sebelum menekan <strong>Simpan Semua Pengaturan Surat</strong>.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: SURAT PERNYATAAN DITERIMA */}
      {activeTab === 'diterima' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Template Surat Pernyataan Diterima
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Data siswa dan coretan status DITERIMA / TIDAK DITERIMA* akan terisi otomatis per siswa.
              </p>
            </div>
            <button
              type="button"
              disabled={previewing === 'pernyataan-diterima'}
              onClick={() =>
                handlePreviewPdf(
                  'pernyataan-diterima',
                  'Pratinjau_Surat_Pernyataan_Diterima.pdf'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {previewing === 'pernyataan-diterima' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Unduh Pratinjau PDF
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nomor Surat Pernyataan *
              </label>
              <input
                type="text"
                value={form.diterima_nomor}
                onChange={(e) => updateField('diterima_nomor', e.target.value)}
                className={`${inputClass} font-mono`}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Titi Mangsa *
              </label>
              <input
                type="text"
                value={form.diterima_titimangsa}
                onChange={(e) => updateField('diterima_titimangsa', e.target.value)}
                placeholder="Cihaurbeuti, 22 Juni 2026"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Label Jabatan Penandatangan *
              </label>
              <input
                type="text"
                value={form.diterima_jabatan}
                onChange={(e) => updateField('diterima_jabatan', e.target.value)}
                placeholder="Kepala,"
                className={inputClass}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Paragraf Pembuka (Dasar Keputusan SK) *
            </label>
            <textarea
              rows={4}
              value={form.diterima_pembuka}
              onChange={(e) => updateField('diterima_pembuka', e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Paragraf Penutup *
            </label>
            <textarea
              rows={4}
              value={form.diterima_penutup}
              onChange={(e) => updateField('diterima_penutup', e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>
      )}

      {/* TAB 3: SURAT PEMANGGILAN DAFTAR ULANG */}
      {activeTab === 'pemanggilan' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Template Surat Pemanggilan Daftar Ulang
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Jadwal & Ruang di bawah menjadi nilai default global jika kolom jadwal pada data per siswa dikosongkan.
              </p>
            </div>
            <button
              type="button"
              disabled={previewing === 'pemanggilan-daftar-ulang'}
              onClick={() =>
                handlePreviewPdf(
                  'pemanggilan-daftar-ulang',
                  'Pratinjau_Surat_Pemanggilan_Daftar_Ulang.pdf'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {previewing === 'pemanggilan-daftar-ulang' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Unduh Pratinjau PDF
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Judul Surat (baris baru diperbolehkan) *
              </label>
              <textarea
                rows={2}
                value={form.pemanggilan_judul}
                onChange={(e) => updateField('pemanggilan_judul', e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Titi Mangsa *
              </label>
              <input
                type="text"
                value={form.pemanggilan_titimangsa}
                onChange={(e) => updateField('pemanggilan_titimangsa', e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Label Jabatan Penandatangan *
              </label>
              <input
                type="text"
                value={form.pemanggilan_jabatan}
                onChange={(e) => updateField('pemanggilan_jabatan', e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-800">
              Jadwal & Ruang Daftar Ulang Default Global (dapat dioverride per siswa di menu Data Siswa)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">HARI</label>
                <input
                  type="text"
                  value={form.default_du_hari}
                  onChange={(e) => updateField('default_du_hari', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  TANGGAL
                </label>
                <input
                  type="text"
                  value={form.default_du_tanggal}
                  onChange={(e) => updateField('default_du_tanggal', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">WAKTU</label>
                <input
                  type="text"
                  value={form.default_du_waktu}
                  onChange={(e) => updateField('default_du_waktu', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">RUANG</label>
                <input
                  type="text"
                  value={form.default_du_ruang}
                  onChange={(e) => updateField('default_du_ruang', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan Poin 1 (Pengantar Jadwal) *
            </label>
            <input
              type="text"
              value={form.pemanggilan_catatan_1}
              onChange={(e) => updateField('pemanggilan_catatan_1', e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Daftar Kelengkapan Berkas (Catatan Poin 2 — satu baris per butir) *
            </label>
            <textarea
              rows={12}
              value={form.pemanggilan_kelengkapan}
              onChange={(e) => updateField('pemanggilan_kelengkapan', e.target.value)}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Awali baris dengan spasi (3 spasi) untuk sub-poin menjorok ke dalam (misal sub-persyaratan jalur 1–4).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan Poin 3 (Peringatan Penutup) *
            </label>
            <textarea
              rows={2}
              value={form.pemanggilan_catatan_3}
              onChange={(e) => updateField('pemanggilan_catatan_3', e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>
      )}

      {/* TAB 4: SURAT PERNYATAAN & FORMULIR PESERTA DIDIK BARU */}
      {activeTab === 'pernyataan_pdb' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Template Surat Pernyataan & Titi Mangsa Formulir Peserta Didik Baru
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Titi Mangsa di sini berlaku untuk PDF Surat Pernyataan Peserta Didik Baru sekaligus PDF Formulir Peserta Didik Baru.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={previewing === 'pernyataan-pdb'}
                onClick={() =>
                  handlePreviewPdf(
                    'pernyataan-pdb',
                    'Pratinjau_Surat_Pernyataan_Peserta_Didik_Baru.pdf'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {previewing === 'pernyataan-pdb' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Pratinjau Pernyataan PDB
              </button>
              <button
                type="button"
                disabled={previewing === 'formulir-pdb'}
                onClick={() =>
                  handlePreviewPdf('formulir-pdb', 'Pratinjau_Formulir_Peserta_Didik_Baru.pdf')
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {previewing === 'formulir-pdb' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Pratinjau Formulir PDB
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Judul Surat Pernyataan *
              </label>
              <input
                type="text"
                value={form.pernyataan_pdb_judul}
                onChange={(e) => updateField('pernyataan_pdb_judul', e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Titi Mangsa *
              </label>
              <input
                type="text"
                value={form.pernyataan_pdb_titimangsa}
                onChange={(e) => updateField('pernyataan_pdb_titimangsa', e.target.value)}
                placeholder="Cihaurbeuti, 13 Juli 2026"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Teks Materai
              </label>
              <input
                type="text"
                value={form.pernyataan_pdb_materai}
                onChange={(e) => updateField('pernyataan_pdb_materai', e.target.value)}
                placeholder="Materai Rp.10.000"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kalimat Pengantar Pernyataan *
            </label>
            <input
              type="text"
              value={form.pernyataan_pdb_pengantar}
              onChange={(e) => updateField('pernyataan_pdb_pengantar', e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Isi Poin-Poin Pernyataan (satu baris per poin) *
            </label>
            <textarea
              rows={11}
              value={form.pernyataan_pdb_isi}
              onChange={(e) => updateField('pernyataan_pdb_isi', e.target.value)}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Gunakan nomor 1., 2., dst. dan awali spasi untuk sub-poin a., b., c.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kalimat Penutup Pernyataan *
            </label>
            <textarea
              rows={2}
              value={form.pernyataan_pdb_penutup}
              onChange={(e) => updateField('pernyataan_pdb_penutup', e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>
      )}

      {/* Save Action */}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1677FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan Template Surat...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Simpan Semua Pengaturan Surat
            </>
          )}
        </button>
      </div>

      {/* Live PDF Verification Modal */}
      {livePdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-4xl h-[86vh] rounded-xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">{livePdfTitle}</h3>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Cap (X:{form.cap_x}, Y:{form.cap_y}, L:{form.cap_width}pt) · TTD (X:{form.ttd_x}, Y:{form.ttd_y}, L:{form.ttd_width}pt)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(livePdfUrl);
                  setLivePdfUrl(null);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Tutup
              </button>
            </div>
            <div className="flex-1 bg-slate-100">
              <iframe
                src={livePdfUrl}
                title={livePdfTitle}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
