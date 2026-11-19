import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { INDONESIAN_MONTHS, isValidDdMmYyyy, toDdMmYyyy } from '../lib/api';

interface IndonesianDateInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  defaultYear?: number;
  className?: string;
}

const WEEKDAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function maskDdMmYyyy(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function parseParts(val: string): { day: number; month: number; year: number } | null {
  const normalized = toDdMmYyyy(val);
  if (!isValidDdMmYyyy(normalized)) return null;
  const [dd, mm, yyyy] = normalized.split('-').map(Number);
  return { day: dd, month: mm, year: yyyy };
}

export function IndonesianDateInput({
  value,
  onChange,
  required = false,
  placeholder = 'dd-mm-yyyy (misal: 29-09-2010)',
  defaultYear = 2010,
  className = '',
}: IndonesianDateInputProps) {
  const normalizedValue = toDdMmYyyy(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseParts(normalizedValue);
  const [viewYear, setViewYear] = useState<number>(parsed?.year || defaultYear);
  const [viewMonth, setViewMonth] = useState<number>((parsed?.month || 1) - 1);

  useEffect(() => {
    const p = parseParts(normalizedValue);
    if (p) {
      setViewYear(p.year);
      setViewMonth(p.month - 1);
    }
  }, [normalizedValue]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDdMmYyyy(e.target.value);
    onChange(masked);
  };

  const selectDate = (day: number) => {
    const dd = String(day).padStart(2, '0');
    const mm = String(viewMonth + 1).padStart(2, '0');
    onChange(`${dd}-${mm}-${viewYear}`);
    setOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 1940; y--) {
    years.push(y);
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(1940, y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(currentYear, y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const showInvalid = normalizedValue.length === 10 && !isValidDdMmYyyy(normalizedValue);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          value={normalizedValue}
          onChange={handleTextChange}
          placeholder={placeholder}
          required={required}
          className={`${className} pr-10 font-mono tabular-nums ${
            showInvalid ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
          }`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-[#0B2447] hover:bg-slate-100 transition-colors"
          aria-label="Buka kalender tanggal Indonesia"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>

      {showInvalid && (
        <p className="text-[11px] text-red-600 mt-1">
          Tanggal tidak valid. Gunakan format dd-mm-yyyy (misal 29-09-2010).
        </p>
      )}

      {open && (
        <div className="absolute z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-3.5">
          {/* Header Month & Year Controls */}
          <div className="flex items-center justify-between gap-1.5 mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5 flex-1">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-[#0B2447] focus:outline-none"
              >
                {INDONESIAN_MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono font-medium text-slate-800 focus:border-[#0B2447] focus:outline-none"
              >
                {years.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS_ID.map((w) => (
              <div key={w} className="text-[11px] font-semibold text-slate-400 py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                parsed?.day === day && parsed?.month === viewMonth + 1 && parsed?.year === viewYear;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={`h-8 w-8 mx-auto rounded-md text-xs font-mono tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-[#0B2447] text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
