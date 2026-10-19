import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './Login.jsx';
import ConsoleShell from './ConsoleShell.jsx';
import Overview from './Overview.jsx';
import ArchiveManage from './ArchiveManage.jsx';
import ConsoleSettings from './ConsoleSettings.jsx';
import { ConsoleContext } from './ConsoleContext.jsx';
import { Spinner } from '../components/States.jsx';
import { api } from '../api.js';
import { useFetch, useDocumentTitle } from '../hooks.js';

function ConsoleRoutes() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="archives/:id" element={<ArchiveManage />} />
      <Route path="settings" element={<ConsoleSettings />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  );
}

export default function ConsoleApp() {
  useDocumentTitle('Console');
  const session = useFetch('/api/console/session');
  const [authenticated, setAuthenticated] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (session.data) setAuthenticated(session.data.authenticated);
  }, [session.data]);

  useEffect(() => {
    if (location.pathname === '/console') window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (authenticated === null) {
    return (
      <div className="console-boot">
        <Spinner size={22} />
        <span>Opening the console…</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Login
        demoMode={session.data?.demoMode}
        hubName={session.data?.hubName}
        onSuccess={() => {
          setAuthenticated(true);
          session.reload();
        }}
      />
    );
  }

  const signOut = async () => {
    try {
      await api('/api/console/session', { method: 'DELETE' });
    } catch {
      // The session is being discarded either way.
    }
    setAuthenticated(false);
  };

  const onExpired = () => setAuthenticated(false);

  return (
    <ConsoleContext.Provider
      value={{ onExpired, demoMode: session.data?.demoMode, hubName: session.data?.hubName }}
    >
      <ConsoleShell
        hubName={session.data?.hubName}
        demoMode={session.data?.demoMode}
        onSignOut={signOut}
      >
        <ConsoleRoutes />
      </ConsoleShell>
    </ConsoleContext.Provider>
  );
}
