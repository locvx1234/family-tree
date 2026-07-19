import React, { useEffect, useState, useCallback } from 'react';
import { getToken, getUsername, clearSession } from './api.js';
import Auth from './Auth.jsx';
import Dashboard from './Dashboard.jsx';
import Editor from './Editor.jsx';
import SharedView from './SharedView.jsx';

// Link chia sẻ công khai dạng /share/<token> — xem không cần đăng nhập
const SHARE_TOKEN = (window.location.pathname.match(/^\/share\/([a-f0-9]{32})$/) || [])[1] || null;

export const ToastContext = React.createContext(() => {});

export default function App() {
  const [user, setUser] = useState(getToken() ? getUsername() : null);
  const [openTreeId, setOpenTreeId] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const onLogout = () => { setUser(null); setOpenTreeId(null); };
    window.addEventListener('giapha:logout', onLogout);
    return () => window.removeEventListener('giapha:logout', onLogout);
  }, []);

  const logout = () => {
    clearSession();
    setUser(null);
    setOpenTreeId(null);
  };

  let view;
  if (SHARE_TOKEN) {
    view = <SharedView token={SHARE_TOKEN} />;
  } else if (!user) {
    view = <Auth onLogin={(username) => setUser(username)} />;
  } else if (openTreeId) {
    view = <Editor treeId={openTreeId} onBack={() => setOpenTreeId(null)} username={user} onLogout={logout} />;
  } else {
    view = <Dashboard username={user} onLogout={logout} onOpen={setOpenTreeId} />;
  }

  return (
    <ToastContext.Provider value={showToast}>
      {view}
      {toast && <div className="toast">{toast}</div>}
    </ToastContext.Provider>
  );
}
