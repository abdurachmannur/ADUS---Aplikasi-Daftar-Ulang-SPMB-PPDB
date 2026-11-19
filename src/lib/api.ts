const TOKEN_STORAGE_KEY = 'spmb_admin_token';

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  withAuth = false
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (withAuth) {
    const token = getAdminToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `Permintaan gagal (${response.status}).`;
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return data as T;
}

export async function downloadFileWithBearer(
  url: string,
  token: string | null,
  fallbackName: string
): Promise<void> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'Gagal mengunduh berkas.';
    try {
      const json = await response.json();
      if (json?.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadAuthenticatedFile(url: string, fallbackName: string): Promise<void> {
  return downloadFileWithBearer(url, getAdminToken(), fallbackName);
}

export const INDONESIAN_MONTHS = [
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

/**
 * Converts either YYYY-MM-DD or DD-MM-YYYY into DD-MM-YYYY for Indonesian form inputs.
 */
export function toDdMmYyyy(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  const idMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (idMatch) {
    return `${idMatch[1]}-${idMatch[2]}-${idMatch[3]}`;
  }
  return trimmed;
}

/**
 * Validates that a DD-MM-YYYY string represents a real calendar date.
 */
export function isValidDdMmYyyy(value: string | null | undefined): boolean {
  if (!value) return false;
  const match = value.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const testDate = new Date(year, month - 1, day);
  return (
    testDate.getFullYear() === year &&
    testDate.getMonth() === month - 1 &&
    testDate.getDate() === day
  );
}

/**
 * Formats either YYYY-MM-DD or DD-MM-YYYY into formal Indonesian date (e.g., "29 September 2010").
 */
export function formatIndonesianDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const trimmed = dateStr.trim();
  let day = 0;
  let month = 0;
  let year = 0;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const idMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (idMatch) {
    day = Number(idMatch[1]);
    month = Number(idMatch[2]);
    year = Number(idMatch[3]);
  } else {
    return trimmed;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || Number.isNaN(year)) {
    return trimmed;
  }
  return `${String(day).padStart(2, '0')} ${INDONESIAN_MONTHS[month - 1]} ${year}`;
}

export function formatDateTimeWib(sqliteDateTime: string | null | undefined): string {
  if (!sqliteDateTime) return '-';
  const iso = sqliteDateTime.includes('T')
    ? sqliteDateTime
    : `${sqliteDateTime.replace(' ', 'T')}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return sqliteDateTime;

  const wibMs = parsed.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = String(wib.getUTCDate()).padStart(2, '0');
  const m = months[wib.getUTCMonth()];
  const y = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${d} ${m} ${y}, ${hh}:${mm} WIB`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getWibPartsFromTimestamp(ms: number): { date: string; time: string } {
  const wib = new Date(ms + 7 * 60 * 60 * 1000);
  const year = wib.getUTCFullYear();
  const month = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  const hours = String(wib.getUTCHours()).padStart(2, '0');
  const minutes = String(wib.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}
