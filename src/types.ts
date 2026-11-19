export type FormOptionCategory =
  | 'jenis_kelamin'
  | 'agama'
  | 'kewarganegaraan'
  | 'tinggal_bersama'
  | 'moda_transportasi'
  | 'pendidikan'
  | 'pekerjaan'
  | 'jarak_sekolah';

export const FORM_OPTION_CATEGORIES: Array<{
  key: FormOptionCategory;
  label: string;
  description: string;
}> = [
  {
    key: 'jenis_kelamin',
    label: 'Jenis Kelamin',
    description: 'Pilihan jenis kelamin pada Tahap 1 Data Pribadi.',
  },
  {
    key: 'agama',
    label: 'Agama',
    description: 'Pilihan agama resmi sesuai standar Dapodik.',
  },
  {
    key: 'kewarganegaraan',
    label: 'Kewarganegaraan',
    description: 'Status kewarganegaraan calon peserta didik.',
  },
  {
    key: 'tinggal_bersama',
    label: 'Tinggal Bersama',
    description: 'Status tempat tinggal calon peserta didik saat ini.',
  },
  {
    key: 'moda_transportasi',
    label: 'Moda Transportasi',
    description: 'Alat transportasi utama menuju sekolah.',
  },
  {
    key: 'pendidikan',
    label: 'Pendidikan',
    description: 'Digunakan bersama untuk data Ayah, Ibu, dan Wali.',
  },
  {
    key: 'pekerjaan',
    label: 'Pekerjaan',
    description: 'Digunakan bersama untuk data Ayah, Ibu, dan Wali.',
  },
  {
    key: 'jarak_sekolah',
    label: 'Jarak Tempat Tinggal ke Sekolah',
    description: 'Kategori jarak tempat tinggal ke sekolah pada Tahap 3.',
  },
];

export interface SchoolProfile {
  id: number;
  school_name: string;
  app_name: string;
  academic_year: string;
  announcement_date: string;
  announcement_time: string;
  sk_number: string;
  sk_detail: string;
  kop_instansi: string;
  kop_dinas: string;
  kop_cabang: string;
  kop_alamat: string;
  kop_email: string;
  logo_path: string;
  logo_dinas_path: string;
  kop_surat_path: string;
  updated_at?: string;
}

export interface LetterSettings {
  id: number;
  kepsek_nama: string;
  kepsek_nip: string;
  cap_path: string;
  ttd_path: string;
  cap_x: number;
  cap_y: number;
  cap_width: number;
  ttd_x: number;
  ttd_y: number;
  ttd_width: number;

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

  updated_at?: string;
}

export interface PublicConfigResponse {
  profile: SchoolProfile;
  server_now_ms: number;
  announcement_timestamp_ms: number;
  is_open: boolean;
}

export interface Student {
  id: number;
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
  created_at?: string;
  updated_at?: string;
  has_form?: boolean;
  has_pin?: boolean;
  form_updated_at?: string | null;
}

export interface StudentFormData {
  // Tahap 1 - Data Pribadi
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
  kabupaten_kota: string;
  provinsi: string;
  kode_pos: string;
  tinggal_bersama: string;
  moda_transportasi: string;
  anak_ke: string;

  // Tahap 2 - Data Orang Tua / Wali & Kontak
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

  // Tahap 3 - Data Periodik, Riwayat Sekolah & Nilai Akademik
  tinggi_badan: string;
  berat_badan: string;
  lingkar_kepala: string;
  jarak_kategori: string;
  jarak_km: string;
  jumlah_saudara: string;
  asal_smp: string;
  no_seri_ijazah: string;
  nilai_tka: string;
  nilai_sem_1: string;
  nilai_sem_2: string;
  nilai_sem_3: string;
  nilai_sem_4: string;
  nilai_sem_5: string;
  jumlah_nilai: string;
}

export interface StudentFormRecord extends StudentFormData {
  id: number;
  student_id: number;
  submitted_at: string;
  updated_at: string;
}

export interface FormOption {
  id: number;
  category: FormOptionCategory;
  label: string;
  is_active: number;
  sort_order: number;
}

export interface DocumentItem {
  id: number;
  title: string;
  file_name: string;
  file_path: string;
  file_size: number;
  is_active: number;
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  created_at: string;
}

export interface DashboardStats {
  total_students: number;
  accepted_count: number;
  rejected_count: number;
  forms_submitted_count: number;
  active_documents_count: number;
  recent_forms: Array<{
    student_id: number;
    nama_lengkap: string;
    nisn: string;
    jalur_pendaftaran: string;
    asal_sekolah: string;
    updated_at: string;
  }>;
}

export interface FormSignersSummary {
  ayah_nama: string;
  ibu_nama: string;
  wali_nama: string;
}

export interface CheckNisnResponse {
  student: Student;
  has_form: boolean;
  has_pin: boolean;
  form_updated_at: string | null;
  form_signers: FormSignersSummary | null;
  documents: DocumentItem[];
}

export interface BackupFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
  trigger: 'pre-reset' | 'pre-restore' | 'manual';
  trigger_label: string;
}

export interface MaintenanceSummary {
  school_name: string;
  academic_year: string;
  sk_number: string;
  counts: {
    students: number;
    accepted_students: number;
    student_forms: number;
    documents: number;
    form_options: number;
    users: number;
  };
  storage: {
    db_size_bytes: number;
    uploads_size_bytes: number;
    total_size_bytes: number;
  };
  backups: BackupFileInfo[];
}
