import { useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import type { SchoolProfile } from '../types';

interface SchoolLogoProps {
  src?: string;
  schoolName: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SchoolLogo({ src, schoolName, size = 'md' }: SchoolLogoProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const dims =
    size === 'sm'
      ? 'h-10 w-10'
      : size === 'lg'
        ? 'h-20 w-20 sm:h-24 sm:w-24'
        : 'h-16 w-16';

  if (!src || failed) {
    return (
      <div
        className={`${dims} shrink-0 rounded-lg bg-[#0B2447] text-amber-300 flex items-center justify-center border border-[#1E3A8A]/40`}
        aria-label={`Logo ${schoolName}`}
      >
        <GraduationCap
          className={size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'}
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Logo ${schoolName}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} shrink-0 object-contain rounded-lg bg-white`}
    />
  );
}

interface SchoolLetterheadProps {
  profile: SchoolProfile;
  subtitle?: string;
}

export function SchoolLetterhead({ profile, subtitle }: SchoolLetterheadProps) {
  const [kopFailed, setKopFailed] = useState(false);

  useEffect(() => {
    setKopFailed(false);
  }, [profile.kop_surat_path]);

  if (profile.kop_surat_path && !kopFailed) {
    return (
      <div className="border-b-2 border-[#0B2447] pb-4 mb-6">
        <img
          src={profile.kop_surat_path}
          alt={`Kop Surat ${profile.school_name}`}
          referrerPolicy="no-referrer"
          onError={() => setKopFailed(true)}
          className="w-full max-h-40 object-contain mx-auto"
        />
      </div>
    );
  }

  const hasCustomKopText = Boolean(profile.kop_instansi || profile.kop_dinas || profile.kop_alamat);
  // Use Logo Dinas on the left for official letterhead (falls back to School Logo if Logo Dinas is not set)
  const leftLogoSrc = profile.logo_dinas_path || profile.logo_path;

  return (
    <div className="border-b-[3px] border-double border-[#0B2447] pb-5 mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-[76px_1fr_76px] items-center gap-3 sm:gap-4 text-center">
        {/* Left: Logo Dinas */}
        <div className="flex items-center justify-center">
          <SchoolLogo
            src={leftLogoSrc}
            schoolName={profile.logo_dinas_path ? 'Logo Dinas Pendidikan' : profile.school_name}
            size="md"
          />
        </div>

        {/* Center: Symmetrical Kop Surat Text */}
        <div className="space-y-0.5 min-w-0">
          {hasCustomKopText ? (
            <>
              {profile.kop_instansi && (
                <p className="text-xs font-medium tracking-wide text-slate-700 uppercase">
                  {profile.kop_instansi}
                </p>
              )}
              {profile.kop_dinas && (
                <p className="text-xs font-medium tracking-wide text-slate-700 uppercase">
                  {profile.kop_dinas}
                </p>
              )}
              {profile.kop_cabang && (
                <p className="text-xs sm:text-sm font-semibold tracking-wide text-slate-800 uppercase">
                  {profile.kop_cabang}
                </p>
              )}
              <h2 className="font-display text-lg sm:text-2xl font-bold text-[#0B2447] tracking-tight uppercase">
                {profile.school_name}
              </h2>
              {profile.kop_alamat && (
                <p className="text-[11px] sm:text-xs text-slate-600">{profile.kop_alamat}</p>
              )}
              {profile.kop_email && (
                <p className="text-[11px] sm:text-xs text-blue-900 italic">{profile.kop_email}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium tracking-wider text-slate-600 uppercase">
                Panitia Sistem Penerimaan Murid Baru (SPMB)
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0B2447] tracking-tight">
                {profile.school_name}
              </h2>
              <p className="text-sm text-slate-600">
                {subtitle || profile.app_name} · Tahun Pelajaran {profile.academic_year}
              </p>
            </>
          )}
        </div>

        {/* Right: Invisible symmetrical spacer matching left logo width so text stays dead-center */}
        <div className="hidden sm:block" aria-hidden="true" />
      </div>
    </div>
  );
}
