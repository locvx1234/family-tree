import React, { useEffect, useState } from 'react';
import { api, setSession } from './api.js';

function PasswordField({ label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          title={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={visible}
        >
          <span aria-hidden="true">{visible ? '🙈' : '👁'}</span>
        </button>
      </div>
    </div>
  );
}

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    api.googleStatus().then((res) => setGoogleEnabled(Boolean(res.enabled))).catch(() => {});
  }, []);

  useEffect(() => {
    const receiveGoogleLogin = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'giapha:google-auth') return;
      if (event.data.error) {
        setError(event.data.error);
        setLoading(false);
        return;
      }
      setSession(event.data.token, event.data.username);
      onLogin(event.data.username);
    };
    window.addEventListener('message', receiveGoogleLogin);
    return () => window.removeEventListener('message', receiveGoogleLogin);
  }, [onLogin]);

  const loginWithGoogle = () => {
    setError('');
    const width = 520;
    const height = 680;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(
      '/api/auth/google',
      'giapha-google-login',
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
    );
    if (!popup) setError('Trình duyệt đã chặn cửa sổ đăng nhập Google. Vui lòng cho phép popup và thử lại.');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await api.login(username.trim(), password)
        : await api.register(username.trim(), password);
      setSession(res.token, res.username);
      onLogin(res.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <div className="ornament">❧ ❧ ❧</div>
          <div className="brand-title">GIA PHẢ VIỆT</div>
          <div className="brand-sub">Lưu giữ cội nguồn — Kết nối các thế hệ</div>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            Đăng nhập
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            Đăng ký
          </button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Tên đăng nhập</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <PasswordField
            label="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <PasswordField
              label="Nhập lại mật khẩu"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            {loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="auth-divider"><span>hoặc</span></div>
            <button className="google-login-btn" type="button" onClick={loginWithGoogle}>
              <span className="google-mark" aria-hidden="true">G</span>
              Tiếp tục với Google
            </button>
          </>
        )}

        <div className="hint-msg">
          Tài khoản dùng thử: <b>demo</b> / <b>demo123</b><br />
          Tài khoản mới sẽ được tặng sẵn 2 gia phả mẫu.
        </div>
      </div>
    </div>
  );
}
