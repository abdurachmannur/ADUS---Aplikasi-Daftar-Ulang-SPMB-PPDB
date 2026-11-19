import { useEffect, useState } from 'react';
import {
  Building2,
  ClipboardList,
  DatabaseBackup,
  ExternalLink,
  FileSignature,
  FileUp,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, clearAdminToken, getAdminToken } from '../../lib/api';
import type { AdminUser, PublicConfigResponse, SchoolProfile } from '../../types';
import { SchoolLogo } from '../SchoolHeader';
import { AdminDashboard } from './AdminDashboard';
import { AdminDocuments } from './AdminDocuments';
import { AdminFormOptions } from './AdminFormOptions';
import { AdminForms } from './AdminForms';
import { AdminLetterSettings } from './AdminLetterSettings';
import { AdminLogin } from './AdminLogin';
import { AdminMaintenance } from './AdminMaintenance';
import { AdminProfile } from './AdminProfile';
import { AdminStudents } from './AdminStudents';
import { AdminUsers } from './AdminUsers';

interface AdminShellProps {
  onNavigatePublic: () => void;
}

type AdminTab =
  | 'dashboard'
  | 'profile'
  | 'students'
  | 'forms'
  | 'options'
  | 'letters'
  | 'documents'
  | 'maintenance'
  | 'users';

const NAV_ITEMS: Array<{ key: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'profile', label: 'Atur Profil Sekolah', icon: Building2 },
  { key: 'students', label: 'Data Siswa', icon: Users },
  { key: 'forms', label: 'Data Formulir', icon: ClipboardList },
  { key: 'options', label: 'Master Pilihan Dropdown', icon: ListChecks },
  { key: 'letters', label: 'Template & Pengaturan Surat', icon: FileSignature },
  { key: 'documents', label: 'Lampiran PDF Tambahan', icon: FileUp },
  { key: 'maintenance', label: 'Backup, Restore & Tahun Baru', icon: DatabaseBackup },
  { key: 'users', label: 'Manajemen Pengguna', icon: UserCog },
];

export function AdminShell({ onNavigatePublic }: AdminShellProps) {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      const token = getAdminToken();
      try {
        const cfg = await apiFetch<PublicConfigResponse>('/api/public/config');
        if (active) setProfile(cfg.profile);
      } catch {
        // ignore
      }

      if (!token) {
        if (active) setCheckingAuth(false);
        return;
      }

      try {
        const res = await apiFetch<{ user: AdminUser }>('/api/admin/me', {}, true);
        if (active) setUser(res.user);
      } catch {
        clearAdminToken();
        if (active) setUser(null);
      } finally {
        if (active) setCheckingAuth(false);
      }
    }

    verifySession();
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    clearAdminToken();
    setUser(null);
    setActiveTab('dashboard');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center gap-3 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677FF]" />
        <span className="text-sm">Memeriksa sesi administrator...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AdminLogin
        onSuccess={(loggedUser) => setUser(loggedUser)}
        onBackPublic={onNavigatePublic}
      />
    );
  }

  const currentNav = NAV_ITEMS.find((item) => item.key === activeTab)!;

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#001529] text-slate-300 select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between gap-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-0.5 bg-white rounded-md shrink-0">
            <SchoolLogo
              src={profile?.logo_path}
              schoolName={profile?.school_name || 'SPMB'}
              size="sm"
            />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-white truncate">Panel SPMB</p>
            <p className="text-[11px] text-slate-400 truncate">
              {profile?.school_name || 'Administrasi'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-slate-400 hover:text-white"
          aria-label="Tutup menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveTab(item.key);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#1677FF] text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Portal Shortcut */}
      <div className="p-3 border-t border-white/10 space-y-1 shrink-0">
        <button
          type="button"
          onClick={onNavigatePublic}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          Lihat Halaman Publik
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 max-w-[80vw] h-full shadow-xl">{renderSidebarContent()}</div>
          <button
            type="button"
            aria-label="Tutup overlay menu"
            className="flex-1 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Enterprise Top Bar */}
        <header className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Panel Admin</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-bold text-slate-900 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user.full_name}</p>
              <p className="text-[11px] font-mono text-slate-500">{user.username}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </div>
        </header>

        {/* Active Module Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <AdminDashboard onNavigateTab={(tab) => setActiveTab(tab as AdminTab)} />
          )}
          {activeTab === 'profile' && (
            <AdminProfile onProfileUpdated={(updated) => setProfile(updated)} />
          )}
          {activeTab === 'students' && <AdminStudents />}
          {activeTab === 'forms' && <AdminForms />}
          {activeTab === 'options' && <AdminFormOptions />}
          {activeTab === 'letters' && <AdminLetterSettings />}
          {activeTab === 'documents' && <AdminDocuments />}
          {activeTab === 'maintenance' && (
            <AdminMaintenance onProfileUpdated={(updated) => setProfile(updated)} />
          )}
          {activeTab === 'users' && <AdminUsers currentUser={user} />}
        </main>
      </div>
    </div>
  );
}
