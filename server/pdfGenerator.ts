import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { UPLOADS_DIR } from './db.ts';

export interface PdfSchoolProfile {
  school_name: string;
  app_name: string;
  academic_year: string;
  sk_number: string;
  sk_detail?: string;
  kop_instansi?: string;
  kop_dinas?: string;
  kop_cabang?: string;
  kop_alamat?: string;
  kop_email?: string;
  logo_path?: string;
  logo_dinas_path?: string;
  kop_surat_path?: string;
}

export interface PdfLetterSettings {
  kepsek_nama: string;
  kepsek_nip: string;
  cap_path?: string;
  ttd_path?: string;
  cap_x?: number;
  cap_y?: number;
  cap_width?: number;
  ttd_x?: number;
  ttd_y?: number;
  ttd_width?: number;

  diterima_nomor: string;
  diterima_pembuka: string;
  diterima_penutup: string;
  diterima_titimangsa: string;
  diterima_jabatan: string;

  pemanggilan_judul: string;
  pemanggilan_titimangsa: string;
  pemanggilan_jabatan: string;
  default_du_hari: string;
  default_du_tanggal: string;
  default_du_waktu: string;
  default_du_ruang: string;
  pemanggilan_catatan_1: string;
  pemanggilan_kelengkapan: string;
  pemanggilan_catatan_3: string;

  pernyataan_pdb_judul: string;
  pernyataan_pdb_pengantar: string;
  pernyataan_pdb_isi: string;
  pernyataan_pdb_penutup: string;
  pernyataan_pdb_titimangsa: string;
  pernyataan_pdb_materai: string;
}

export interface PdfStudent {
  no_urut: string;
  no_pendaftaran: string;
  nama_lengkap: string;
  nisn: string;
  asal_sekolah: string;
  jalur_pendaftaran: string;
  status: 'DITERIMA' | 'TIDAK DITERIMA';
  daftar_ulang_hari?: string;
  daftar_ulang_tanggal?: string;
  daftar_ulang_waktu?: string;
  daftar_ulang_ruang?: string;
}

export interface PdfStudentForm {
  nama_lengkap: string;
  jenis_kelamin: string;
  nis: string;
  nik: string;
  no_kk: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  no_akta_lahir: string;
  agama: string;
  kewarganegaraan: string;
  alamat_jalan: string;
  rt: string;
  rw: string;
  dusun: string;
  desa_kelurahan: string;
  kecamatan: string;
  kabupaten_kota?: string;
  provinsi?: string;
  kode_pos: string;
  tinggal_bersama: string;
  moda_transportasi: string;
  anak_ke: string;

  ayah_nama: string;
  ayah_tempat_lahir: string;
  ayah_tanggal_lahir: string;
  ayah_pendidikan: string;
  ayah_pekerjaan: string;

  ibu_nama: string;
  ibu_tempat_lahir: string;
  ibu_tanggal_lahir: string;
  ibu_pendidikan: string;
  ibu_pekerjaan: string;

  wali_nama: string;
  wali_tempat_lahir: string;
  wali_tanggal_lahir: string;
  wali_pendidikan: string;
  wali_pekerjaan: string;

  no_hp_wa: string;
  email: string;

  tinggi_badan: string;
  berat_badan: string;
  lingkar_kepala: string;
  jarak_kategori: string;
  jarak_km: string;
  jumlah_saudara: string;
  asal_smp: string;
  no_seri_ijazah: string;
  nilai_tka?: string;
  nilai_sem_1?: string;
  nilai_sem_2?: string;
  nilai_sem_3?: string;
  nilai_sem_4?: string;
  nilai_sem_5?: string;
  jumlah_nilai?: string;
}

export type SignerType = 'ayah' | 'ibu' | 'wali';

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const NAVY = '#0B2447';
const NAVY_MID = '#1E3A8A';
const SLATE_TEXT = '#0F172A';
const SLATE_MUTED = '#475569';
const BORDER_LINE = '#CBD5E1';
const SURFACE_SOFT = '#EFF4FA';
const SURFACE_ZEBRA = '#F8FAFC';

export function formatDateIdLong(raw: string | null | undefined): string {
  if (!raw) return '-';
  const s = raw.trim();
  let day = 0;
  let month = 0;
  let year = 0;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const id = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (id) {
    day = Number(id[1]);
    month = Number(id[2]);
    year = Number(id[3]);
  } else {
    return s;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return s;
  return `${String(day).padStart(2, '0')} ${MONTHS_ID[month - 1]} ${year}`;
}

function resolveRasterImagePath(publicUrlPath: string | undefined): string | null {
  if (!publicUrlPath) return null;
  const trimmed = publicUrlPath.trim();
  if (!trimmed) return null;

  let fullPath = '';
  if (trimmed.startsWith('/uploads/')) {
    const rel = trimmed.replace(/^\/uploads\//, '');
    fullPath = path.resolve(UPLOADS_DIR, rel);
    if (!fullPath.startsWith(UPLOADS_DIR)) return null;
  } else if (trimmed.startsWith('/src/assets/')) {
    const root = process.cwd();
    const rel = trimmed.replace(/^\//, '');
    const srcCandidate = path.resolve(root, rel);
    const distCandidate = path.resolve(root, 'dist', rel);
    fullPath = fs.existsSync(srcCandidate) ? srcCandidate : distCandidate;
  } else {
    return null;
  }

  if (!fs.existsSync(fullPath)) return null;
  const ext = path.extname(fullPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
  return fullPath;
}

function getSignerDetails(form: PdfStudentForm, signer: SignerType): {
  name: string;
  job: string;
  roleLabel: string;
  relationLabel: string;
} {
  if (signer === 'ibu') {
    return {
      name: form.ibu_nama || '-',
      job: form.ibu_pekerjaan || '-',
      roleLabel: 'Orang Tua / Ibu',
      relationLabel: 'Ibu Kandung',
    };
  }
  if (signer === 'wali') {
    return {
      name: form.wali_nama || '-',
      job: form.wali_pekerjaan || '-',
      roleLabel: 'Wali Peserta Didik',
      relationLabel: 'Wali',
    };
  }
  return {
    name: form.ayah_nama || '-',
    job: form.ayah_pekerjaan || '-',
    roleLabel: 'Orang Tua / Ayah',
    relationLabel: 'Ayah Kandung',
  };
}

function formatFullAddress(form: PdfStudentForm): string {
  const parts: string[] = [];
  if (form.alamat_jalan) parts.push(form.alamat_jalan);
  if (form.dusun && !form.alamat_jalan.toLowerCase().includes(form.dusun.toLowerCase())) {
    parts.push(`Dusun ${form.dusun}`);
  }
  if (form.rt || form.rw) {
    parts.push(`RT ${form.rt || '-'} / RW ${form.rw || '-'}`);
  }
  if (form.desa_kelurahan) parts.push(`Desa/Kel. ${form.desa_kelurahan}`);
  if (form.kecamatan) parts.push(`Kec. ${form.kecamatan}`);
  if (form.kabupaten_kota) parts.push(form.kabupaten_kota);
  if (form.provinsi) parts.push(`Prov. ${form.provinsi}`);
  if (form.kode_pos) parts.push(form.kode_pos);
  return parts.join(', ').trim() || '-';
}

/**
 * Symmetric Official Kop Surat:
 * - If custom full Kop image is uploaded, displays it centered.
 * - Otherwise displays Logo Dinas on the left (falls back to School Logo if Dinas Logo not uploaded)
 *   and centers all Kop Surat text lines symmetrically around the exact horizontal midpoint of the A4 page.
 */
function drawKopSurat(
  doc: PDFKit.PDFDocument,
  profile: PdfSchoolProfile,
  options?: { accentColor?: string; modernFont?: boolean; marginX?: number }
): number {
  const pageWidth = doc.page.width;
  const marginX = options?.marginX ?? 52;
  const accentColor = options?.accentColor ?? '#000000';
  const modern = Boolean(options?.modernFont);
  const contentWidth = pageWidth - marginX * 2;
  let y = 30;

  const kopImage = resolveRasterImagePath(profile.kop_surat_path);
  if (kopImage) {
    try {
      doc.image(kopImage, marginX, y, { fit: [contentWidth, 84], align: 'center' });
      y += 88;
    } catch {
      // Fallback to structured text letterhead below
    }
  }

  if (!kopImage) {
    const logoFile =
      resolveRasterImagePath(profile.logo_dinas_path) ||
      resolveRasterImagePath(profile.logo_path);
    const logoBoxW = 62;

    if (logoFile) {
      try {
        doc.image(logoFile, marginX, y + 3, { fit: [logoBoxW, 64], align: 'center', valign: 'center' });
      } catch {
        // Ignore invalid image
      }
    }

    // Symmetric text column: equal horizontal inset on both left and right so text is dead-center on A4
    const symPad = 68;
    const textX = marginX + symPad;
    const textW = contentWidth - symPad * 2;
    const roman = modern ? 'Helvetica' : 'Times-Roman';
    const bold = modern ? 'Helvetica-Bold' : 'Times-Bold';
    const italic = modern ? 'Helvetica-Oblique' : 'Times-Italic';

    if (profile.kop_instansi) {
      doc
        .font(roman)
        .fontSize(modern ? 9.5 : 10.5)
        .fillColor(modern ? SLATE_MUTED : '#000000')
        .text(profile.kop_instansi.toUpperCase(), textX, y, { width: textW, align: 'center' });
      y = doc.y + 1.5;
    }
    if (profile.kop_dinas) {
      doc
        .font(roman)
        .fontSize(modern ? 9.5 : 10.5)
        .fillColor(modern ? SLATE_MUTED : '#000000')
        .text(profile.kop_dinas.toUpperCase(), textX, y, { width: textW, align: 'center' });
      y = doc.y + 1.5;
    }
    if (profile.kop_cabang) {
      doc
        .font(modern ? bold : roman)
        .fontSize(modern ? 9.5 : 11)
        .fillColor(modern ? SLATE_TEXT : '#000000')
        .text(profile.kop_cabang.toUpperCase(), textX, y, { width: textW, align: 'center' });
      y = doc.y + 2;
    }

    doc
      .font(bold)
      .fontSize(modern ? 13.5 : 14)
      .fillColor(modern ? NAVY : '#000000')
      .text(profile.school_name.toUpperCase(), textX, y, { width: textW, align: 'center' });
    y = doc.y + 2;

    if (profile.kop_alamat) {
      doc
        .font(roman)
        .fontSize(8)
        .fillColor(modern ? SLATE_MUTED : '#000000')
        .text(profile.kop_alamat, textX, y, { width: textW, align: 'center' });
      y = doc.y + 1;
    }
    if (profile.kop_email) {
      doc
        .font(italic)
        .fontSize(8)
        .fillColor(NAVY_MID)
        .text(profile.kop_email, textX, y, { width: textW, align: 'center' });
      y = doc.y + 2;
    }
    doc.fillColor('#000000');
    y = Math.max(y + 4, 104);
  }

  // Double horizontal rule under Kop Surat
  doc
    .save()
    .lineWidth(2.2)
    .strokeColor(accentColor)
    .moveTo(marginX, y)
    .lineTo(pageWidth - marginX, y)
    .stroke();
  doc
    .lineWidth(0.75)
    .strokeColor(accentColor)
    .moveTo(marginX, y + 3.2)
    .lineTo(pageWidth - marginX, y + 3.2)
    .stroke()
    .restore();

  return y + 14;
}

/**
 * Draws the Principal signature block using the exact PDF-point coordinates & widths
 * configured in the interactive Admin drag-and-resize preview canvas.
 */
function drawKepsekSignatureBlock(
  doc: PDFKit.PDFDocument,
  settings: PdfLetterSettings,
  titimangsa: string,
  jabatan: string,
  startY: number
): number {
  const sigX = 320;
  const sigWidth = 220;
  const nameY = startY + 78;

  // 1. Draw text anchors first (exact 1:1 z-order & metrics with Admin preview canvas)
  doc.font('Times-Roman').fontSize(10.5).fillColor('#000000');
  doc.text(titimangsa, sigX, startY, { width: sigWidth, lineBreak: false });
  doc.text(jabatan, sigX, startY + 14, { width: sigWidth, lineBreak: false });

  doc
    .font('Times-Bold')
    .fontSize(10.5)
    .text(settings.kepsek_nama, sigX, nameY, { width: sigWidth, lineBreak: false });
  doc
    .font('Times-Roman')
    .fontSize(10.5)
    .text(`NIP. ${settings.kepsek_nip}`, sigX, nameY + 14, { width: sigWidth, lineBreak: false });

  // 2. Overlay Cap Sekolah & Tanda Tangan at exact PDF-point offsets from (sigX, startY)
  const capFile = resolveRasterImagePath(settings.cap_path);
  const ttdFile = resolveRasterImagePath(settings.ttd_path);

  const capX = Number.isFinite(Number(settings.cap_x)) ? Number(settings.cap_x) : -46;
  const capY = Number.isFinite(Number(settings.cap_y)) ? Number(settings.cap_y) : 6;
  const capWidth = Math.max(32, Math.min(200, Number(settings.cap_width) || 86));

  const ttdX = Number.isFinite(Number(settings.ttd_x)) ? Number(settings.ttd_x) : 0;
  const ttdY = Number.isFinite(Number(settings.ttd_y)) ? Number(settings.ttd_y) : 18;
  const ttdWidth = Math.max(36, Math.min(220, Number(settings.ttd_width) || 124));

  if (capFile) {
    try {
      doc.save();
      doc.fillOpacity(0.9);
      doc.image(capFile, sigX + capX, startY + capY, { width: capWidth });
      doc.restore();
    } catch {
      // ignore image errors
    }
  }
  if (ttdFile) {
    try {
      doc.save();
      doc.image(ttdFile, sigX + ttdX, startY + ttdY, { width: ttdWidth });
      doc.restore();
    } catch {
      // ignore image errors
    }
  }

  // Restore deterministic cursor below NIP so subsequent elements are never shifted by doc.image
  doc.x = 52;
  doc.y = nameY + 34;
  return nameY + 34;
}

function setupPdfHeaders(res: Response, fileName: string, inline = false): void {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`
  );
}

// ============================================================================
// 1. SURAT PERNYATAAN DITERIMA (dengan Kop Simetris, Cap Sekolah & TTD Kepsek)
// ============================================================================
export function streamSuratPernyataanDiterimaPdf(
  res: Response,
  profile: PdfSchoolProfile,
  settings: PdfLetterSettings,
  student: PdfStudent,
  inline = false
): void {
  setupPdfHeaders(res, `Surat_Pernyataan_Diterima_${student.nisn}.pdf`, inline);
  const doc = new PDFDocument({ size: 'A4', margin: 52 });
  doc.pipe(res);

  const marginX = 52;
  const contentWidth = doc.page.width - marginX * 2;
  let y = drawKopSurat(doc, profile);

  doc.font('Times-Bold').fontSize(12.5).fillColor('#000000');
  doc.text('SURAT PERNYATAAN', marginX, y, { width: contentWidth, align: 'center', underline: true });
  y += 16;

  doc
    .font('Times-Roman')
    .fontSize(10.5)
    .text(`Nomor : ${settings.diterima_nomor}`, marginX, y, {
      width: contentWidth,
      align: 'center',
    });
  y += 28;

  doc
    .font('Times-Roman')
    .fontSize(10.5)
    .text(settings.diterima_pembuka, marginX, y, {
      width: contentWidth,
      align: 'justify',
      lineGap: 4,
    });
  y = doc.y + 18;

  doc.font('Times-Roman').fontSize(10.5).text('Calon Peserta Didik :', marginX, y);
  y += 18;

  const infoRows: Array<[string, string, boolean?]> = [
    ['No Urut', student.no_urut],
    ['Nomor Pendaftaran', student.no_pendaftaran],
    ['Nama Lengkap', student.nama_lengkap.toUpperCase(), true],
    ['NISN', student.nisn],
    ['Asal Sekolah', student.asal_sekolah.toUpperCase()],
    ['Jalur Pendaftaran', student.jalur_pendaftaran.toUpperCase()],
  ];

  const labelW = 128;
  for (const [label, value, isBold] of infoRows) {
    doc.font('Times-Roman').fontSize(10.5).text(label, marginX, y, { width: labelW });
    doc.text(':', marginX + labelW, y, { width: 12 });
    doc
      .font(isBold ? 'Times-Bold' : 'Times-Roman')
      .fontSize(10.5)
      .text(value || '-', marginX + labelW + 12, y, { width: contentWidth - labelW - 12 });
    y = Math.max(y + 18, doc.y + 4);
  }

  y += 8;
  doc.font('Times-Bold').fontSize(11.5).text('Dinyatakan', marginX, y, {
    width: contentWidth,
    align: 'center',
  });
  y += 22;

  const part1 = 'DITERIMA';
  const sep = ' / ';
  const part2 = 'TIDAK DITERIMA';
  const star = '*';

  doc.font('Times-BoldItalic').fontSize(12);
  const w1 = doc.widthOfString(part1);
  const wSep = doc.widthOfString(sep);
  const w2 = doc.widthOfString(part2);
  const wStar = doc.widthOfString(star);
  const totalW = w1 + wSep + w2 + wStar;
  const startX = marginX + (contentWidth - totalW) / 2;

  doc.text(part1, startX, y, { continued: false });
  doc.text(sep, startX + w1, y, { continued: false });
  doc.text(part2, startX + w1 + wSep, y, { continued: false });
  doc.text(star, startX + w1 + wSep + w2, y, { continued: false });

  const strikeY = y + 6.5;
  doc.save().lineWidth(1.2).strokeColor('#000000');
  if (student.status === 'DITERIMA') {
    doc.moveTo(startX + w1 + wSep, strikeY).lineTo(startX + w1 + wSep + w2, strikeY).stroke();
  } else {
    doc.moveTo(startX, strikeY).lineTo(startX + w1, strikeY).stroke();
  }
  doc.restore();

  y += 28;

  const closingLines = settings.diterima_penutup.split('\n').filter((l) => l.trim().length > 0);
  for (const line of closingLines) {
    doc
      .font('Times-Roman')
      .fontSize(10.5)
      .text(line, marginX, y, { width: contentWidth, align: 'justify', lineGap: 4 });
    y = doc.y + 8;
  }

  y += 16;
  drawKepsekSignatureBlock(
    doc,
    settings,
    settings.diterima_titimangsa,
    settings.diterima_jabatan || 'Kepala,',
    y
  );

  doc.end();
}

// ============================================================================
// 2. SURAT PEMANGGILAN DAFTAR ULANG (Kop Simetris, Cap, TTD, & Jadwal Per Siswa)
// ============================================================================
export function streamSuratPemanggilanPdf(
  res: Response,
  profile: PdfSchoolProfile,
  settings: PdfLetterSettings,
  student: PdfStudent,
  inline = false
): void {
  setupPdfHeaders(res, `Surat_Pemanggilan_Daftar_Ulang_${student.nisn}.pdf`, inline);
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(res);

  const marginX = 52;
  const contentWidth = doc.page.width - marginX * 2;
  let y = drawKopSurat(doc, profile);

  doc.font('Times-Bold').fontSize(11.5).fillColor('#000000');
  const titleLines = settings.pemanggilan_judul
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of titleLines) {
    doc.text(line.toUpperCase(), marginX, y, { width: contentWidth, align: 'center' });
    y += 14;
  }
  doc.text(`TAHUN PELAJARAN ${profile.academic_year}`, marginX, y, {
    width: contentWidth,
    align: 'center',
  });
  y += 22;

  const rows: Array<[string, string, boolean?]> = [
    ['1. No. Urut Daftar Ulang', student.no_urut, true],
    ['2. Nomor Pendaftaran', student.no_pendaftaran],
    ['3. Nama Lengkap', student.nama_lengkap.toUpperCase(), true],
    ['4. NISN', student.nisn],
    ['5. Sekolah Asal', student.asal_sekolah.toUpperCase()],
    ['6. Pilihan Jalur Pendaftaran', student.jalur_pendaftaran.toUpperCase()],
  ];

  const labelW = 152;
  for (const [label, value, isBold] of rows) {
    doc.font('Times-Roman').fontSize(10).text(label, marginX, y, { width: labelW });
    doc.text(':', marginX + labelW, y, { width: 10 });
    doc
      .font(isBold ? 'Times-Bold' : 'Times-Roman')
      .fontSize(10)
      .text(value || '-', marginX + labelW + 10, y, { width: contentWidth - labelW - 10 });
    y = Math.max(y + 15, doc.y + 3);
  }

  y += 8;
  y = drawKepsekSignatureBlock(
    doc,
    settings,
    settings.pemanggilan_titimangsa,
    settings.pemanggilan_jabatan || 'Kepala Sekolah,',
    y
  );

  y += 2;
  doc.font('Times-BoldItalic').fontSize(10).text('Catatan :', marginX, y, { underline: true });
  y += 14;

  doc.font('Times-Roman').fontSize(9.5).text('1.', marginX, y, { width: 14 });
  doc.text(settings.pemanggilan_catatan_1, marginX + 16, y, {
    width: contentWidth - 16,
    lineGap: 2,
  });
  y = doc.y + 6;

  const duHari = (student.daftar_ulang_hari || '').trim() || settings.default_du_hari;
  const duTanggal = (student.daftar_ulang_tanggal || '').trim() || settings.default_du_tanggal;
  const duWaktu = (student.daftar_ulang_waktu || '').trim() || settings.default_du_waktu;
  const duRuang = (student.daftar_ulang_ruang || '').trim() || settings.default_du_ruang;

  const tableX = marginX + 16;
  const tableW = contentWidth - 16;
  const colWidths = [tableW * 0.22, tableW * 0.28, tableW * 0.28, tableW * 0.22];
  const headers = ['HARI', 'TANGGAL', 'WAKTU', 'RUANG'];
  const values = [duHari, duTanggal, duWaktu, duRuang];
  const headerH = 19;
  const rowH = 22;

  doc.save().lineWidth(0.75).strokeColor('#000000');
  let curX = tableX;
  for (let i = 0; i < 4; i++) {
    doc.rect(curX, y, colWidths[i], headerH).stroke();
    doc
      .font('Times-Bold')
      .fontSize(9.5)
      .text(headers[i], curX + 2, y + 5, { width: colWidths[i] - 4, align: 'center' });

    doc.rect(curX, y + headerH, colWidths[i], rowH).stroke();
    doc
      .font('Times-Roman')
      .fontSize(9.5)
      .text(values[i] || '-', curX + 2, y + headerH + 6, {
        width: colWidths[i] - 4,
        align: 'center',
      });
    curX += colWidths[i];
  }
  doc.restore();
  y += headerH + rowH + 8;

  doc.font('Times-Roman').fontSize(9.5).text('2.', marginX, y, { width: 14 });
  doc.text(
    'Kelengkapan yang harus dibawa/disiapkan : (disusun berurutan dan dimasukkan ke dalam MAP)',
    marginX + 16,
    y,
    { width: contentWidth - 16 }
  );
  y = doc.y + 4;

  const checklistLines = settings.pemanggilan_kelengkapan
    .split('\n')
    .filter((l) => l.trim().length > 0);

  for (const rawLine of checklistLines) {
    if (y > doc.page.height - 64) {
      doc.addPage();
      y = 48;
    }
    const isSubIndented = /^\s{2,}/.test(rawLine);
    const trimmed = rawLine.trim();
    const isHighlighted = /^[a-e]\./i.test(trimmed) || trimmed.startsWith('(');

    const indentX = isSubIndented ? marginX + 42 : marginX + 28;
    const itemWidth = doc.page.width - marginX - indentX;

    doc
      .font(
        trimmed.startsWith('(')
          ? 'Times-BoldItalic'
          : isHighlighted
            ? 'Times-Bold'
            : 'Times-Roman'
      )
      .fontSize(8.8)
      .text(trimmed, indentX, y, { width: itemWidth, lineGap: 1.5 });
    y = doc.y + 1.5;
  }

  y += 5;
  if (y > doc.page.height - 54) {
    doc.addPage();
    y = 48;
  }

  doc.font('Times-Roman').fontSize(9.5).text('3.', marginX, y, { width: 14 });
  doc.text(settings.pemanggilan_catatan_3, marginX + 16, y, {
    width: contentWidth - 16,
    lineGap: 2,
  });

  doc.end();
}

// ============================================================================
// 3. SURAT PERNYATAAN PESERTA DIDIK BARU — GAYA MODERN AKADEMIS NAVY
// ============================================================================
export function streamSuratPernyataanPdbPdf(
  res: Response,
  profile: PdfSchoolProfile,
  settings: PdfLetterSettings,
  student: PdfStudent,
  form: PdfStudentForm,
  signer: SignerType,
  inline = false
): void {
  setupPdfHeaders(res, `Surat_Pernyataan_Peserta_Didik_Baru_${student.nisn}.pdf`, inline);
  const doc = new PDFDocument({ size: 'A4', margin: 46 });
  doc.pipe(res);

  const marginX = 46;
  const contentWidth = doc.page.width - marginX * 2;
  const signerInfo = getSignerDetails(form, signer);

  // Symmetric Kop Surat (Modern Navy Accent)
  let y = drawKopSurat(doc, profile, { accentColor: NAVY, modernFont: true, marginX });

  // Document Title Block
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(NAVY)
    .text(settings.pernyataan_pdb_judul.toUpperCase(), marginX, y, {
      width: contentWidth,
      align: 'center',
    });
  y = doc.y + 2;
  doc
    .font('Helvetica')
    .fontSize(8.8)
    .fillColor(SLATE_MUTED)
    .text(`Tahun Pelajaran ${profile.academic_year}  ·  No. Pendaftaran: ${student.no_pendaftaran}`, marginX, y, {
      width: contentWidth,
      align: 'center',
    });
  y = doc.y + 12;

  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(SLATE_TEXT)
    .text('Saya yang bertanda tangan di bawah ini:', marginX, y);
  y = doc.y + 6;

  // Clean Structured Identity Table Card
  const fullAddress = formatFullAddress(form);
  const identityRows: Array<[string, string]> = [
    ['Nama Peserta Didik', (form.nama_lengkap || student.nama_lengkap).toUpperCase()],
    ['NISN / No. Pendaftaran', `${student.nisn}  /  ${student.no_pendaftaran}`],
    ['Tempat, Tanggal Lahir', `${form.tempat_lahir}, ${formatDateIdLong(form.tanggal_lahir)}`],
    ['Jenis Kelamin / Agama', `${form.jenis_kelamin || '-'}  /  ${form.agama || '-'}`],
    [`Nama ${signerInfo.relationLabel}`, signerInfo.name],
    [`Pekerjaan ${signerInfo.relationLabel}`, signerInfo.job],
    ['Alamat Lengkap', fullAddress],
    ['Nomor HP / WhatsApp', form.no_hp_wa || '-'],
  ];

  const labelColW = 148;
  const valColW = contentWidth - labelColW;
  const tableStartY = y;

  for (let idx = 0; idx < identityRows.length; idx++) {
    const [label, value] = identityRows[idx];
    doc.font('Helvetica').fontSize(9);
    const valH = doc.heightOfString(value || '-', { width: valColW - 16, lineGap: 1.5 });
    const rowH = Math.max(18, valH + 7);

    if (idx % 2 === 0) {
      doc.save().rect(marginX, y, contentWidth, rowH).fill(SURFACE_ZEBRA).restore();
    }
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor(BORDER_LINE)
      .moveTo(marginX, y + rowH)
      .lineTo(marginX + contentWidth, y + rowH)
      .stroke()
      .moveTo(marginX + labelColW, y)
      .lineTo(marginX + labelColW, y + rowH)
      .stroke()
      .restore();

    doc
      .font('Helvetica-Bold')
      .fontSize(8.6)
      .fillColor(SLATE_MUTED)
      .text(label, marginX + 8, y + 4.5, { width: labelColW - 14 });

    doc
      .font(idx === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor(idx === 0 ? NAVY : SLATE_TEXT)
      .text(value || '-', marginX + labelColW + 8, y + 4.5, {
        width: valColW - 16,
        lineGap: 1.5,
      });

    y += rowH;
  }

  // Outer frame for identity table
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor(BORDER_LINE)
    .rect(marginX, tableStartY, contentWidth, y - tableStartY)
    .stroke()
    .restore();

  y += 14;

  // MENYATAKAN Navy Divider Banner
  doc.save().rect(marginX, y, contentWidth, 20).fill(SURFACE_SOFT).restore();
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor(NAVY)
    .moveTo(marginX, y)
    .lineTo(marginX + contentWidth, y)
    .stroke()
    .moveTo(marginX, y + 20)
    .lineTo(marginX + contentWidth, y + 20)
    .stroke()
    .restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(NAVY)
    .text('M E N Y A T A K A N', marginX, y + 5, { width: contentWidth, align: 'center' });
  y += 28;

  // Opening clause intro
  doc
    .font('Helvetica-Bold')
    .fontSize(9.2)
    .fillColor(SLATE_TEXT)
    .text(settings.pernyataan_pdb_pengantar, marginX, y, { width: contentWidth, lineGap: 2 });
  y = doc.y + 6;

  // Clauses list
  const clauseLines = settings.pernyataan_pdb_isi
    .split('\n')
    .filter((l) => l.trim().length > 0);

  for (const rawLine of clauseLines) {
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = 46;
    }
    const isSub = /^\s+[a-z]\./i.test(rawLine);
    const trimmed = rawLine.trim();
    const numMatch = trimmed.match(/^([0-9]+\.|[a-z]\.)\s*(.*)$/i);

    if (numMatch) {
      const marker = numMatch[1];
      const body = numMatch[2];
      const baseX = isSub ? marginX + 20 : marginX + 2;
      doc.font('Helvetica-Bold').fontSize(9.2).fillColor(NAVY).text(marker, baseX, y, { width: 16 });
      doc
        .font('Helvetica')
        .fontSize(9.2)
        .fillColor(SLATE_TEXT)
        .text(body, baseX + 18, y, {
          width: marginX + contentWidth - (baseX + 18),
          align: 'justify',
          lineGap: 2.2,
        });
    } else {
      doc
        .font('Helvetica')
        .fontSize(9.2)
        .fillColor(SLATE_TEXT)
        .text(trimmed, marginX + 18, y, {
          width: contentWidth - 18,
          align: 'justify',
          lineGap: 2.2,
        });
    }
    y = doc.y + 4;
  }

  y += 6;
  doc
    .font('Helvetica')
    .fontSize(9.2)
    .fillColor(SLATE_TEXT)
    .text(settings.pernyataan_pdb_penutup, marginX, y, {
      width: contentWidth,
      align: 'justify',
      lineGap: 2.2,
    });
  y = doc.y + 16;

  if (y > doc.page.height - 135) {
    doc.addPage();
    y = 48;
  }

  // Two-column Clean Signature Block
  const colW = 205;
  const leftColX = marginX + 6;
  const rightColX = marginX + contentWidth - colW - 6;

  doc.font('Helvetica').fontSize(9.2).fillColor(SLATE_TEXT);
  doc.text('Mengetahui,', leftColX, y, { width: colW });
  doc.font('Helvetica-Bold').text(signerInfo.roleLabel, leftColX, y + 13, { width: colW });

  doc.font('Helvetica').text(settings.pernyataan_pdb_titimangsa, rightColX, y, { width: colW });
  doc.font('Helvetica-Bold').text('Yang Membuat Pernyataan,', rightColX, y + 13, { width: colW });

  // Clean subtle dashed Materai box
  if (settings.pernyataan_pdb_materai) {
    const boxX = rightColX + 6;
    const boxY = y + 32;
    const boxW = 94;
    const boxH = 34;
    doc
      .save()
      .lineWidth(0.6)
      .dash(2.5, { space: 2 })
      .strokeColor('#94A3B8')
      .rect(boxX, boxY, boxW, boxH)
      .stroke()
      .undash()
      .restore();
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(SLATE_MUTED)
      .text(settings.pernyataan_pdb_materai, boxX + 4, boxY + 12, {
        width: boxW - 8,
        align: 'center',
      });
  }

  const sigLineY = y + 80;
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor(NAVY)
    .moveTo(leftColX, sigLineY)
    .lineTo(leftColX + 185, sigLineY)
    .stroke()
    .moveTo(rightColX, sigLineY)
    .lineTo(rightColX + 185, sigLineY)
    .stroke()
    .restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(9.2)
    .fillColor(NAVY)
    .text(signerInfo.name, leftColX, sigLineY + 5, { width: 190 });
  doc.text((form.nama_lengkap || student.nama_lengkap).toUpperCase(), rightColX, sigLineY + 5, {
    width: 190,
  });

  doc
    .font('Helvetica')
    .fontSize(7.8)
    .fillColor(SLATE_MUTED)
    .text(`(${signerInfo.relationLabel})`, leftColX, doc.y + 1, { width: 190 });
  doc.text(`NISN. ${student.nisn}`, rightColX, sigLineY + 17, { width: 190 });

  doc.end();
}

// ============================================================================
// 4. FORMULIR PESERTA DIDIK BARU — GAYA MODERN AKADEMIS NAVY & TABEL RAPI
// ============================================================================
export function streamFormulirPdbPdf(
  res: Response,
  profile: PdfSchoolProfile,
  settings: PdfLetterSettings,
  student: PdfStudent,
  form: PdfStudentForm,
  signer: SignerType,
  inline = false
): void {
  setupPdfHeaders(res, `Formulir_Peserta_Didik_Baru_${student.nisn}.pdf`, inline);
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  doc.pipe(res);

  const marginX = 42;
  const contentWidth = doc.page.width - marginX * 2;
  const signerInfo = getSignerDetails(form, signer);

  // Symmetric Modern Kop Surat
  let y = drawKopSurat(doc, profile, { accentColor: NAVY, modernFont: true, marginX });

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.page.height - 46) {
      doc.addPage();
      y = 40;
    }
  };

  // Modern Title & Metadata Summary Strip
  doc
    .font('Helvetica-Bold')
    .fontSize(12.5)
    .fillColor(NAVY)
    .text('FORMULIR DATA PESERTA DIDIK BARU', marginX, y, {
      width: contentWidth,
      align: 'center',
    });
  y = doc.y + 2;
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(SLATE_MUTED)
    .text(`Tahun Pelajaran ${profile.academic_year}`, marginX, y, {
      width: contentWidth,
      align: 'center',
    });
  y = doc.y + 8;

  // Compact Registration Metadata Bar (4 cells)
  const metaH = 26;
  const metaCols = [
    { label: 'NO. URUT', val: student.no_urut },
    { label: 'NO. PENDAFTARAN', val: student.no_pendaftaran },
    { label: 'NISN', val: student.nisn },
    { label: 'JALUR SELEKSI', val: student.jalur_pendaftaran },
  ];
  const metaW = contentWidth / 4;
  doc.save().rect(marginX, y, contentWidth, metaH).fill(SURFACE_SOFT).restore();
  doc.save().lineWidth(0.75).strokeColor(BORDER_LINE).rect(marginX, y, contentWidth, metaH).stroke();
  for (let i = 0; i < metaCols.length; i++) {
    const cx = marginX + i * metaW;
    if (i > 0) {
      doc.moveTo(cx, y).lineTo(cx, y + metaH).stroke();
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(6.8)
      .fillColor(SLATE_MUTED)
      .text(metaCols[i].label, cx + 6, y + 4, { width: metaW - 12 });
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(NAVY)
      .text(metaCols[i].val || '-', cx + 6, y + 13, { width: metaW - 12, ellipsis: true });
  }
  doc.restore();
  y += metaH + 10;

  // Section Table Renderer (Ink-friendly soft navy tint header + crisp 2-column grid)
  const drawSectionTable = (sectionTitle: string, rows: Array<[string, string | null | undefined]>) => {
    const labelW = 166;
    const valW = contentWidth - labelW;

    ensureSpace(44);
    // Section Header Bar
    doc.save().rect(marginX, y, contentWidth, 18).fill(SURFACE_SOFT).restore();
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(NAVY)
      .moveTo(marginX, y)
      .lineTo(marginX + contentWidth, y)
      .stroke()
      .lineWidth(0.6)
      .strokeColor(BORDER_LINE)
      .rect(marginX, y, contentWidth, 18)
      .stroke()
      .restore();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.8)
      .fillColor(NAVY)
      .text(sectionTitle.toUpperCase(), marginX + 8, y + 4.5, { width: contentWidth - 16 });
    y += 18;

    for (let i = 0; i < rows.length; i++) {
      const [label, rawVal] = rows[i];
      const val = rawVal && rawVal.trim() ? rawVal.trim() : '-';
      doc.font('Helvetica').fontSize(8.6);
      const valH = doc.heightOfString(val, { width: valW - 16, lineGap: 1.4 });
      const rowH = Math.max(16.5, valH + 6);

      if (y + rowH > doc.page.height - 46) {
        doc.addPage();
        y = 40;
      }

      if (i % 2 === 1) {
        doc.save().rect(marginX, y, contentWidth, rowH).fill(SURFACE_ZEBRA).restore();
      }

      doc
        .save()
        .lineWidth(0.5)
        .strokeColor(BORDER_LINE)
        .rect(marginX, y, contentWidth, rowH)
        .stroke()
        .moveTo(marginX + labelW, y)
        .lineTo(marginX + labelW, y + rowH)
        .stroke()
        .restore();

      doc
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .fillColor(SLATE_MUTED)
        .text(label, marginX + 8, y + 4, { width: labelW - 14 });

      doc
        .font('Helvetica')
        .fontSize(8.6)
        .fillColor(SLATE_TEXT)
        .text(val, marginX + labelW + 8, y + 4, { width: valW - 16, lineGap: 1.4 });

      y += rowH;
    }

    y += 9;
  };

  // I. DATA PRIBADI
  drawSectionTable('I. Data Pribadi Peserta Didik', [
    ['Nama Lengkap', (form.nama_lengkap || student.nama_lengkap).toUpperCase()],
    ['Jenis Kelamin', form.jenis_kelamin],
    ['NISN / NIS (Sekolah Asal)', `${student.nisn}  /  ${form.nis || '-'}`],
    ['NIK / No. KITAS', form.nik],
    ['Nomor Kartu Keluarga (KK)', form.no_kk],
    ['Tempat, Tanggal Lahir', `${form.tempat_lahir}, ${formatDateIdLong(form.tanggal_lahir)}`],
    ['No. Registrasi Akta Lahir', form.no_akta_lahir],
    ['Agama / Kewarganegaraan', `${form.agama || '-'}  /  ${form.kewarganegaraan || '-'}`],
    ['Alamat Jalan', form.alamat_jalan],
    ['RT / RW / Dusun', `RT ${form.rt || '-'} / RW ${form.rw || '-'}${form.dusun ? ` · Dusun ${form.dusun}` : ''}`],
    ['Desa / Kelurahan & Kecamatan', `${form.desa_kelurahan || '-'}, Kec. ${form.kecamatan || '-'}`],
    ['Kabupaten / Kota & Provinsi', `${form.kabupaten_kota || '-'}, Prov. ${form.provinsi || '-'}`],
    ['Kode Pos', form.kode_pos],
    ['Tinggal Bersama', form.tinggal_bersama],
    ['Moda Transportasi', form.moda_transportasi],
    ['Anak Ke-', form.anak_ke],
  ]);

  // II. DATA AYAH KANDUNG
  drawSectionTable('II. Data Ayah Kandung', [
    ['Nama Ayah Kandung', form.ayah_nama],
    [
      'Tempat, Tanggal Lahir',
      `${form.ayah_tempat_lahir}, ${formatDateIdLong(form.ayah_tanggal_lahir)}`,
    ],
    ['Pendidikan Terakhir', form.ayah_pendidikan],
    ['Pekerjaan', form.ayah_pekerjaan],
  ]);

  // III. DATA IBU KANDUNG
  drawSectionTable('III. Data Ibu Kandung', [
    ['Nama Ibu Kandung', form.ibu_nama],
    [
      'Tempat, Tanggal Lahir',
      `${form.ibu_tempat_lahir}, ${formatDateIdLong(form.ibu_tanggal_lahir)}`,
    ],
    ['Pendidikan Terakhir', form.ibu_pendidikan],
    ['Pekerjaan', form.ibu_pekerjaan],
  ]);

  // IV. DATA WALI (Always structured cleanly; shows '-' if empty)
  drawSectionTable('IV. Data Wali (Opsional)', [
    ['Nama Wali', form.wali_nama],
    [
      'Tempat, Tanggal Lahir',
      form.wali_tempat_lahir || form.wali_tanggal_lahir
        ? `${form.wali_tempat_lahir || '-'}${form.wali_tanggal_lahir ? `, ${formatDateIdLong(form.wali_tanggal_lahir)}` : ''}`
        : '-',
    ],
    ['Pendidikan Terakhir', form.wali_pendidikan],
    ['Pekerjaan', form.wali_pekerjaan],
  ]);

  // V. KONTAK AKTIF
  drawSectionTable('V. Kontak Aktif', [
    ['Nomor HP (WhatsApp)', form.no_hp_wa],
    ['Alamat Email', form.email],
  ]);

  // VI. DATA PERIODIK, RIWAYAT SEKOLAH & NILAI AKADEMIK
  drawSectionTable('VI. Data Periodik, Riwayat Sekolah & Nilai Akademik', [
    ['Tinggi / Berat / Lingkar Kepala', `${form.tinggi_badan || '-'} cm  ·  ${form.berat_badan || '-'} kg  ·  ${form.lingkar_kepala || '-'} cm`],
    [
      'Jarak Tempat Tinggal ke Sekolah',
      form.jarak_km ? `${form.jarak_kategori} (${form.jarak_km} km)` : form.jarak_kategori,
    ],
    ['Jumlah Saudara Kandung', form.jumlah_saudara],
    ['Asal Sekolah (SMP / MTs)', form.asal_smp || student.asal_sekolah],
    ['Nomor Seri Ijazah SMP / MTs', form.no_seri_ijazah],
    ['Nilai TKA (Tes Kemampuan Akademik)', form.nilai_tka || '-'],
  ]);

  // Compact 6-column Academic Report Score Grid (Semester 1-5 + Jumlah Nilai)
  ensureSpace(46);
  const scoreCols = [
    { label: 'SEMESTER 1', val: form.nilai_sem_1 || '-' },
    { label: 'SEMESTER 2', val: form.nilai_sem_2 || '-' },
    { label: 'SEMESTER 3', val: form.nilai_sem_3 || '-' },
    { label: 'SEMESTER 4', val: form.nilai_sem_4 || '-' },
    { label: 'SEMESTER 5', val: form.nilai_sem_5 || '-' },
    { label: 'JUMLAH NILAI', val: form.jumlah_nilai || '-', highlight: true },
  ];
  const scoreColW = contentWidth / scoreCols.length;
  const headerH = 16;
  const valueH = 19;

  doc.save().rect(marginX, y, contentWidth, headerH).fill(SURFACE_SOFT).restore();
  doc
    .save()
    .rect(marginX + scoreColW * 5, y, scoreColW, headerH + valueH)
    .fill('#E2ECF8')
    .restore();

  doc
    .save()
    .lineWidth(0.6)
    .strokeColor(BORDER_LINE)
    .rect(marginX, y, contentWidth, headerH + valueH)
    .stroke()
    .moveTo(marginX, y + headerH)
    .lineTo(marginX + contentWidth, y + headerH)
    .stroke();
  for (let i = 1; i < scoreCols.length; i++) {
    const cx = marginX + i * scoreColW;
    doc.moveTo(cx, y).lineTo(cx, y + headerH + valueH).stroke();
  }
  doc.restore();

  for (let i = 0; i < scoreCols.length; i++) {
    const cx = marginX + i * scoreColW;
    doc
      .font('Helvetica-Bold')
      .fontSize(7.1)
      .fillColor(scoreCols[i].highlight ? NAVY : SLATE_MUTED)
      .text(scoreCols[i].label, cx + 3, y + 4.5, { width: scoreColW - 6, align: 'center' });
    doc
      .font(scoreCols[i].highlight ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(scoreCols[i].highlight ? 9.2 : 8.8)
      .fillColor(scoreCols[i].highlight ? NAVY : SLATE_TEXT)
      .text(scoreCols[i].val, cx + 3, y + headerH + 5, { width: scoreColW - 6, align: 'center' });
  }
  y += headerH + valueH + 10;

  // Signature Block
  ensureSpace(122);
  y += 6;

  const colW = 205;
  const leftX = marginX + 6;
  const rightX = marginX + contentWidth - colW - 6;

  doc.font('Helvetica').fontSize(9).fillColor(SLATE_TEXT);
  doc.text(settings.pernyataan_pdb_titimangsa, rightX, y, { width: colW });
  y += 14;

  doc.font('Helvetica-Bold').text('Calon Peserta Didik Baru,', leftX, y, { width: colW });
  doc.text(`Mengetahui, ${signerInfo.roleLabel}`, rightX, y, { width: colW });

  const sigLineY = y + 60;
  doc
    .save()
    .lineWidth(0.8)
    .strokeColor(NAVY)
    .moveTo(leftX, sigLineY)
    .lineTo(leftX + 190, sigLineY)
    .stroke()
    .moveTo(rightX, sigLineY)
    .lineTo(rightX + 190, sigLineY)
    .stroke()
    .restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(NAVY)
    .text((form.nama_lengkap || student.nama_lengkap).toUpperCase(), leftX, sigLineY + 5, {
      width: 195,
    });
  doc.text(signerInfo.name, rightX, sigLineY + 5, { width: 195 });

  doc
    .font('Helvetica')
    .fontSize(7.6)
    .fillColor(SLATE_MUTED)
    .text(`NISN. ${student.nisn}`, leftX, sigLineY + 17, { width: 195 });
  doc.text(`(${signerInfo.relationLabel})`, rightX, sigLineY + 17, { width: 195 });

  // Subtle legal disclaimer footer
  doc
    .save()
    .lineWidth(0.5)
    .strokeColor(BORDER_LINE)
    .moveTo(marginX, sigLineY + 34)
    .lineTo(marginX + contentWidth, sigLineY + 34)
    .stroke()
    .restore();
  doc
    .font('Helvetica-Oblique')
    .fontSize(7.4)
    .fillColor(SLATE_MUTED)
    .text(
      'Orang Tua/Wali dan Peserta Didik bertanggung jawab secara hukum terhadap kebenaran seluruh data yang tercantum pada formulir ini.',
      marginX,
      sigLineY + 39,
      { width: contentWidth, align: 'center' }
    );

  doc.end();
}
