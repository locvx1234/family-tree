import React, { useState } from 'react';
import { api, setSession } from './api.js';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <div className="field">
            <label>Mật khẩu</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label>Nhập lại mật khẩu</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
          )}
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            {loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>

        <div className="hint-msg">
          Tài khoản dùng thử: <b>demo</b> / <b>demo123</b><br />
          Tài khoản mới sẽ được tặng sẵn 2 gia phả mẫu.
        </div>
      </div>
    </div>
  );
}
