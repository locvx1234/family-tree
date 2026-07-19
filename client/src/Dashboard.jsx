import React, { useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { ToastContext } from './App.jsx';
import { readImportedJSON } from './exporter.js';
import { validateTreeData } from './treeOps.js';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function Dashboard({ username, onLogout, onOpen }) {
  const [trees, setTrees] = useState(null);
  const [error, setError] = useState('');
  const toast = useContext(ToastContext);
  const fileRef = useRef();

  const load = async () => {
    try {
      setTrees(await api.listTrees());
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const createNew = async () => {
    const name = prompt('Tên gia phả mới:', 'Gia phả họ …');
    if (name === null) return;
    try {
      const res = await api.createTree(name);
      toast('Đã tạo gia phả mới');
      onOpen(res.id);
    } catch (err) { toast(err.message); }
  };

  const rename = async (tree) => {
    const name = prompt('Tên mới:', tree.name);
    if (name === null || !name.trim()) return;
    try {
      await api.saveTree(tree.id, { name: name.trim() });
      load();
    } catch (err) { toast(err.message); }
  };

  const remove = async (tree) => {
    if (!confirm(`Xóa gia phả "${tree.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await api.deleteTree(tree.id);
      toast('Đã xóa gia phả');
      load();
    } catch (err) { toast(err.message); }
  };

  const importJSON = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { name, data } = await readImportedJSON(file);
      if (!validateTreeData(data)) throw new Error('Cấu trúc dữ liệu gia phả không hợp lệ');
      const res = await api.createTree(name, data);
      toast('Đã nhập gia phả từ file');
      onOpen(res.id);
    } catch (err) { toast(err.message); }
  };

  return (
    <div>
      <div className="topbar">
        <div className="logo">🌳 GIA PHẢ VIỆT<small>Lưu giữ cội nguồn</small></div>
        <div className="spacer" />
        <div className="user">Xin chào, <b>{username}</b></div>
        <button className="btn ghost small" onClick={onLogout}>Đăng xuất</button>
      </div>

      <div className="dash">
        <div className="dash-head">
          <h1>Gia phả của tôi</h1>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>⬆ Nhập từ JSON</button>
          <button className="btn gold" onClick={createNew}>＋ Tạo gia phả mới</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importJSON} />
        </div>

        {error && <div className="error-msg">{error}</div>}

        {trees === null ? (
          <div className="empty-state">Đang tải…</div>
        ) : trees.length === 0 ? (
          <div className="empty-state">Chưa có gia phả nào. Hãy tạo gia phả đầu tiên của bạn.</div>
        ) : (
          <div className="tree-grid">
            {trees.map((t) => (
              <div className="tree-card" key={`${t.role}-${t.id}`}>
                <h3 onClick={() => onOpen(t.id)}>{t.name}</h3>
                <div className="meta">
                  {t.personCount} thành viên · Cập nhật {formatDate(t.updatedAt)}
                  {t.role === 'editor' && (
                    <div style={{ marginTop: 4, color: 'var(--gold)' }}>
                      🔗 Được chia sẻ bởi <b>{t.owner}</b>
                    </div>
                  )}
                </div>
                <div className="actions">
                  <button className="btn small" onClick={() => onOpen(t.id)}>Mở</button>
                  {t.role === 'owner' && (
                    <>
                      <button className="btn ghost small" onClick={() => rename(t)}>Đổi tên</button>
                      <button className="btn danger small" onClick={() => remove(t)}>Xóa</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
