import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { apiFetch, setAdminToken } from '../../lib/api';
import type { AdminUser, PublicConfigResponse, SchoolProfile } from '../../types';
import { SchoolLogo } from '../SchoolHeader';

interface AdminLoginProps {
  onSuccess: (user: AdminUser) => void;
  onBackPublic: () => void;
}

export function AdminLogin({ onSuccess, onBackPublic }: AdminLoginProps) {
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<PublicConfigResponse>('/api/public/config')
      .then((res) => setProfile(res.profile))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: AdminUser }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAdminToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke panel admin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col justify-between px-4 py-8">
      <div className="max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={onBackPublic}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Halaman Pengumuman
        </button>
      </div>

      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <div className="flex flex-col items-center text-center mb-7">
            <SchoolLogo
              src={profile?.logo_path}
              schoolName={profile?.school_name || 'SPMB'}
              size="md"
            />
            <h1 className="font-display text-xl font-bold text-slate-900 mt-4 tracking-tight">
              Panel Administrasi SPMB
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {profile?.school_name || 'Sistem Penerimaan Murid Baru'}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Masukkan username"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20"
                required
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Masukkan password"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1677FF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memverifikasi...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Masuk ke Panel Admin
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 mt-8">
        © {new Date().getFullYear()} {profile?.school_name || 'Panitia SPMB'}
      </footer>
    </div>
  );
}
