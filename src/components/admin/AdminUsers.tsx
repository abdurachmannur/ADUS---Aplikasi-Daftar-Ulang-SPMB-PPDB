import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { apiFetch, formatDateTimeWib } from '../../lib/api';
import type { AdminUser } from '../../types';

interface AdminUsersProps {
  currentUser: AdminUser;
}

export function AdminUsers({ currentUser }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add Admin Modal
  const [addOpen, setAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState('');

  // Change own password
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ users: AdminUser[] }>('/api/admin/users', {}, true);
      setUsers(res.users);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memuat daftar pengguna admin.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setAddError('');
    try {
      await apiFetch(
        '/api/admin/users',
        {
          method: 'POST',
          body: JSON.stringify({
            username: newUsername.trim(),
            full_name: newFullName.trim(),
            password: newPassword,
          }),
        },
        true
      );
      setAddOpen(false);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      setNotice({ type: 'success', text: 'Akun administrator baru berhasil ditambahkan.' });
      await loadUsers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Gagal menambahkan akun admin.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' }, true);
      setNotice({
        type: 'success',
        text: `Akun "${deleteTarget.username}" berhasil dihapus.`,
      });
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus akun admin.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (nextPassword.length < 6) {
      setNotice({ type: 'error', text: 'Password baru minimal 6 karakter.' });
      return;
    }
    if (nextPassword !== confirmPassword) {
      setNotice({ type: 'error', text: 'Konfirmasi password baru tidak cocok.' });
      return;
    }
    setChangingPass(true);
    try {
      const res = await apiFetch<{ message: string }>(
        '/api/admin/me/password',
        {
          method: 'PUT',
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: nextPassword,
          }),
        },
        true
      );
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setNotice({ type: 'success', text: res.message });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah password.',
      });
    } finally {
      setChangingPass(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1677FF] focus:outline-none focus:ring-2 focus:ring-[#1677FF]/15';

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Admin Accounts Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <UserCog className="h-5 w-5 text-[#1677FF]" />
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Daftar Akun Administrator
                </h2>
                <p className="text-xs text-slate-500">
                  Kelola operator panitia yang memiliki akses ke Panel Admin SPMB.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAddError('');
                setAddOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Admin
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2.5 text-slate-500 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
              Memuat daftar pengguna...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Nama Lengkap</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">Dibuat</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {u.full_name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-[#1677FF]">
                              (Akun Anda)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">{u.username}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeWib(u.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={isSelf || users.length <= 1}
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                            title={
                              isSelf
                                ? 'Tidak dapat menghapus akun yang sedang login'
                                : 'Hapus akun admin'
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Change Own Password Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 h-fit">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <KeyRound className="h-5 w-5 text-[#1677FF]" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Ubah Password Saya
              </h2>
              <p className="text-xs text-slate-500">
                Login sebagai <span className="font-mono font-medium">{currentUser.username}</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password Saat Ini *
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password Baru *
              </label>
              <input
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Konfirmasi Password Baru *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <button
              type="submit"
              disabled={changingPass}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1677FF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60 transition-colors"
            >
              {changingPass && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Perbarui Password
            </button>
          </form>
        </div>
      </div>

      {/* Add Admin Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Tambah Akun Admin Baru
              </h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {addError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Contoh: Operator Panitia SPMB"
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Username *
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Huruf kecil tanpa spasi (misal: operator1)"
                  className={`${inputClass} font-mono`}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className={inputClass}
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1677FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0958D9] disabled:opacity-60"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Buat Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900">Hapus Akun Admin?</h3>
            <p className="text-sm text-slate-600">
              Akun <strong>{deleteTarget.full_name}</strong> (
              <span className="font-mono">{deleteTarget.username}</span>) tidak akan lagi dapat
              mengakses panel admin.
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
                onClick={handleDeleteUser}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Hapus Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
