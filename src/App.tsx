import { useEffect, useState } from 'react';
import { AdminShell } from './components/admin/AdminShell';
import { PublicPortal } from './components/public/PublicPortal';

function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export default function App() {
  const [route, setRoute] = useState<'public' | 'admin'>(() =>
    isAdminRoute(window.location.pathname) ? 'admin' : 'public'
  );

  useEffect(() => {
    const handlePopState = () => {
      setRoute(isAdminRoute(window.location.pathname) ? 'admin' : 'public');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPublic = () => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setRoute('public');
    window.scrollTo({ top: 0 });
  };

  if (route === 'admin') {
    return <AdminShell onNavigatePublic={navigateToPublic} />;
  }

  return <PublicPortal />;
}
