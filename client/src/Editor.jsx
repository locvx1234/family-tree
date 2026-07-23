import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { ToastContext } from './App.jsx';
import { computeLayout, generationMap, CARD_H } from './layout.js';
import { PersonCard, TreeLinks, GenerationLabels, initialOf } from './TreeSVG.jsx';
import {
  updatePerson, addSpouse, addChild, addGenerationAbove,
  deletePerson, countDeleted, movePartner, moveChild,
} from './treeOps.js';
import { exportPNG, exportPDF, exportJSON } from './exporter.js';
import AvatarCropModal, { prepareAvatarFile } from './AvatarCropModal.jsx';

const MARGIN = { left: 120, top: 30, right: 40, bottom: 40 };

export default function Editor({ treeId, onBack, username, onLogout }) {
  const toast = useContext(ToastContext);
  const [name, setName] = useState('');
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // saved | dirty | saving | error
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [exportOpen, setExportOpen] = useState(false);
  const [genModal, setGenModal] = useState(false);
  const [genAnchor, setGenAnchor] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [role, setRole] = useState('owner');
  const [owner, setOwner] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState(null);
  const [editors, setEditors] = useState([]);
  const [editorName, setEditorName] = useState('');
  const [avatarCrop, setAvatarCrop] = useState(null);

  const canvasRef = useRef(null);
  const exportSvgRef = useRef(null);
  const avatarInputRef = useRef(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef(null);
  const panRef = useRef(null);
  const pendingFitRef = useRef(false);

  const layout = useMemo(() => (data ? computeLayout(data) : null), [data]);
  const genMap = useMemo(() => (data ? generationMap(data) : {}), [data]);

  // ===== Tải dữ liệu =====
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getTree(treeId);
        setName(res.name);
        setData(res.data);
        setRole(res.role || 'owner');
        setOwner(res.owner || null);
        setShareToken(res.shareToken || null);
      } catch (err) {
        toast(err.message);
        onBack();
      }
    })();
  }, [treeId]);

  // ===== Fit lần đầu & sau thay đổi cấu trúc lớn =====
  useEffect(() => {
    if (layout && (!loadedRef.current || pendingFitRef.current)) {
      loadedRef.current = true;
      pendingFitRef.current = false;
      requestAnimationFrame(() => fitView(layout));
    }
  }, [layout]);

  const contentBounds = (lo) => ({
    x: -MARGIN.left,
    y: -MARGIN.top,
    w: lo.width + MARGIN.left + MARGIN.right,
    h: lo.height + MARGIN.top + MARGIN.bottom,
  });

  const fitView = (lo = layout) => {
    const el = canvasRef.current;
    if (!el || !lo) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const b = contentBounds(lo);
    const k = Math.min(cw / b.w, ch / b.h, 1.1);
    setView({
      k,
      tx: (cw - b.w * k) / 2 - b.x * k,
      ty: (ch - b.h * k) / 2 - b.y * k,
    });
  };

  // ===== Lưu (autosave + Ctrl+S) =====
  const doSave = async (payload) => {
    setSaveStatus('saving');
    try {
      await api.saveTree(treeId, payload);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      toast('Lưu thất bại: ' + err.message);
    }
  };

  const scheduleSave = (nextData, nextName) => {
    setSaveStatus('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ data: nextData ?? data, name: nextName ?? name });
    }, 1000);
  };

  const applyData = (next) => {
    setData(next);
    scheduleSave(next, undefined);
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        clearTimeout(saveTimer.current);
        if (data) doSave({ data, name });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, name]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ===== Pan & zoom =====
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const k = Math.min(3, Math.max(0.08, v.k * factor));
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        return {
          k,
          tx: px - ((px - v.tx) * k) / v.k,
          ty: py - ((py - v.ty) * k) / v.k,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [data !== null]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    canvasRef.current?.classList.add('panning');
  };
  const onPointerMove = (e) => {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
    setView((v) => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
  };
  const onPointerUp = () => {
    const p = panRef.current;
    panRef.current = null;
    canvasRef.current?.classList.remove('panning');
    if (p && !p.moved) setSelected(null); // click nền -> bỏ chọn
  };

  // ===== Thao tác trên người =====
  const person = selected && data ? data.persons[selected] : null;
  const partnerUnion = person ? Object.values(data.unions).find((u) => u.partners.includes(selected)) : null;
  const childUnion = person ? Object.values(data.unions).find((u) => u.children.includes(selected)) : null;

  const handleAddSpouse = () => {
    const { tree, newId } = addSpouse(data, selected);
    applyData(tree);
    setSelected(newId);
    toast('Đã thêm vợ/chồng — điền thông tin ở bảng bên phải');
  };

  const handleAddChild = () => {
    const { tree, newId } = addChild(data, selected);
    applyData(tree);
    setSelected(newId);
    toast('Đã thêm con — điền thông tin ở bảng bên phải');
  };

  const handleDelete = () => {
    const n = countDeleted(data, selected);
    const msg = n > 1
      ? `Xóa "${person.name}" sẽ xóa cả nhánh gồm ${n} người (vợ/chồng và con cháu). Tiếp tục?`
      : `Xóa "${person.name}"?`;
    if (!confirm(msg)) return;
    const res = deletePerson(data, selected);
    if (res.error) { toast(res.error); return; }
    if (res.deletedCount > 1 || n > 1) pendingFitRef.current = true;
    applyData(res.tree);
    setSelected(null);
    toast(`Đã xóa ${res.deletedCount} người`);
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setAvatarCrop(await prepareAvatarFile(file));
    } catch (err) { toast(err.message); }
  };

  const openGenModal = () => {
    const root = data.unions[data.rootId];
    if (root.partners.length === 1) {
      const { tree, newId } = addGenerationAbove(data, root.partners[0]);
      pendingFitRef.current = true;
      applyData(tree);
      setSelected(newId);
      toast('Đã thêm đời phía trên — có thể thêm vợ/chồng cho cụ mới');
    } else {
      setGenAnchor(root.partners[0]);
      setGenModal(true);
    }
  };

  const confirmGenAbove = () => {
    const { tree, newId } = addGenerationAbove(data, genAnchor);
    pendingFitRef.current = true;
    applyData(tree);
    setSelected(newId);
    setGenModal(false);
    toast('Đã thêm đời phía trên');
  };

  // ===== Chia sẻ =====
  const openShare = async () => {
    setShareOpen(true);
    try { setEditors(await api.listEditors(treeId)); } catch { setEditors([]); }
  };

  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : null;

  const enableShare = async () => {
    try {
      const res = await api.enableShare(treeId);
      setShareToken(res.shareToken);
    } catch (err) { toast(err.message); }
  };

  const disableShare = async () => {
    try {
      await api.disableShare(treeId);
      setShareToken(null);
      toast('Đã tắt liên kết công khai');
    } catch (err) { toast(err.message); }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Đã sao chép liên kết');
    } catch {
      prompt('Sao chép liên kết:', shareUrl);
    }
  };

  const addEditor = async (e) => {
    e.preventDefault();
    const uname = editorName.trim();
    if (!uname) return;
    try {
      const ed = await api.addEditor(treeId, uname);
      setEditors((list) => (list.some((x) => x.id === ed.id) ? list : [...list, ed]));
      setEditorName('');
      toast(`Đã cấp quyền chỉnh sửa cho "${ed.username}"`);
    } catch (err) { toast(err.message); }
  };

  const removeEditor = async (ed) => {
    try {
      await api.removeEditor(treeId, ed.id);
      setEditors((list) => list.filter((x) => x.id !== ed.id));
      toast(`Đã thu hồi quyền của "${ed.username}"`);
    } catch (err) { toast(err.message); }
  };

  const handleExport = async (kind) => {
    setExportOpen(false);
    if (kind === 'json') { exportJSON(name, data); return; }
    setExporting(true);
    try {
      const avatars = layout.cards
        .filter((c) => data.persons[c.pid]?.avatar)
        .map((c) => ({
          src: data.persons[c.pid].avatar,
          x: c.x,
          y: c.y,
          isDeceased: data.persons[c.pid].isDeceased ?? Boolean(data.persons[c.pid].death),
        }));
      if (kind === 'png') await exportPNG(exportSvgRef.current, name, avatars);
      else await exportPDF(exportSvgRef.current, name, avatars);
      toast(kind === 'png' ? 'Đã xuất ảnh PNG' : 'Đã xuất file PDF');
    } catch (err) {
      toast('Xuất file thất bại: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!data || !layout) {
    return <div className="empty-state" style={{ paddingTop: 120 }}>Đang tải gia phả…</div>;
  }

  const b = contentBounds(layout);
  const statusText = { saved: '✓ Đã lưu', dirty: 'Có thay đổi…', saving: 'Đang lưu…', error: '⚠ Lỗi lưu' }[saveStatus];

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button className="btn ghost small" onClick={onBack}>← Danh sách</button>
        <input
          className="tree-name-input"
          value={name}
          onChange={(e) => { setName(e.target.value); scheduleSave(undefined, e.target.value); }}
          title="Bấm để đổi tên gia phả"
        />
        <span className="save-status">{statusText}</span>
        {role === 'editor' && <span className="save-status">· của {owner}</span>}
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn ghost small" onClick={openGenModal}>⬆ Thêm đời trên</button>
        {role === 'owner' && <button className="btn ghost small" onClick={openShare}>🔗 Chia sẻ</button>}
        <div className="dropdown">
          <button className="btn gold small" onClick={() => setExportOpen((o) => !o)} disabled={exporting}>
            {exporting ? 'Đang xuất…' : '⬇ Xuất file'}
          </button>
          {exportOpen && (
            <div className="dropdown-menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={() => handleExport('png')}>🖼 Ảnh PNG (in ấn)</button>
              <button onClick={() => handleExport('pdf')}>📄 File PDF (in ấn)</button>
              <button onClick={() => handleExport('json')}>💾 File JSON (sao lưu)</button>
            </div>
          )}
        </div>
        <button className="btn ghost small" onClick={onLogout}>Đăng xuất</button>
      </div>

      <div className="editor-body">
        <div
          className="canvas-wrap"
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <svg width="100%" height="100%" style={{ display: 'block' }}>
            <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
              <GenerationLabels maxDepth={layout.maxDepth} />
              <TreeLinks links={layout.links} />
              {layout.cards.map((c) => (
                <PersonCard
                  key={c.pid}
                  person={data.persons[c.pid]}
                  x={c.x}
                  y={c.y}
                  selected={c.pid === selected}
                  onSelect={setSelected}
                />
              ))}
            </g>
          </svg>

          <div className="zoom-controls">
            <button onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))}>＋</button>
            <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.08, v.k / 1.2) }))}>－</button>
            <button className="fit" onClick={() => fitView()}>Vừa màn hình</button>
          </div>
        </div>

        {person && (
          <div className="side-panel" key={selected}>
            <h3>{person.name}</h3>
            <span className="gen-tag">Đời thứ {(genMap[selected] ?? 0) + 1}</span>

            <div className="avatar-edit">
              {person.avatar ? (
                <img className="avatar-preview" src={person.avatar} alt="" />
              ) : (
                <div className="avatar-preview">{initialOf(person.name)}</div>
              )}
              <div className="avatar-btns">
                <button className="btn ghost small" onClick={() => avatarInputRef.current?.click()}>Chọn ảnh…</button>
                {person.avatar && (
                  <button className="btn danger small" onClick={() => applyData(updatePerson(data, selected, { avatar: null }))}>
                    Gỡ ảnh
                  </button>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
            </div>

            <div className="field">
              <label>Họ và tên</label>
              <input value={person.name} onChange={(e) => applyData(updatePerson(data, selected, { name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Giới tính</label>
              <select value={person.gender} onChange={(e) => applyData(updatePerson(data, selected, { gender: e.target.value }))}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <label className="deceased-toggle">
              <input
                type="checkbox"
                checked={person.isDeceased ?? Boolean(person.death)}
                onChange={(e) => applyData(updatePerson(data, selected, { isDeceased: e.target.checked }))}
              />
              <span>
                <b>Người này đã mất</b>
                <small>Thẻ trên cây sẽ được thể hiện trang trọng, nhẹ nhàng hơn.</small>
              </span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Năm sinh</label>
                <input value={person.birth} placeholder="VD: 1920" onChange={(e) => applyData(updatePerson(data, selected, { birth: e.target.value }))} />
              </div>
              <div className="field">
                <label>Năm mất</label>
                <input
                  value={person.death}
                  placeholder="Không bắt buộc"
                  onChange={(e) => applyData(updatePerson(data, selected, {
                    death: e.target.value,
                    ...(e.target.value.trim() ? { isDeceased: true } : {}),
                  }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Số điện thoại (không bắt buộc)</label>
              <input
                type="tel"
                value={person.phone || ''}
                placeholder="VD: 0901 234 567"
                onChange={(e) => applyData(updatePerson(data, selected, { phone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Link mạng xã hội (không bắt buộc, mỗi link một dòng)</label>
              <textarea
                rows={3}
                value={person.socialLinks || ''}
                placeholder={'https://facebook.com/…\nhttps://zalo.me/…'}
                onChange={(e) => applyData(updatePerson(data, selected, { socialLinks: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Ghi chú (quê quán, nghề nghiệp, tiểu sử…)</label>
              <textarea rows={4} value={person.note} onChange={(e) => applyData(updatePerson(data, selected, { note: e.target.value }))} />
            </div>

            <div className="panel-section-title">Thêm thành viên</div>
            <div className="panel-actions">
              <button className="btn small" onClick={handleAddSpouse}>💍 Thêm vợ/chồng</button>
              <button className="btn small" onClick={handleAddChild}>👶 Thêm con</button>
            </div>

            {((partnerUnion && partnerUnion.partners.length > 1) || (childUnion && childUnion.children.length > 1)) && (
              <>
                <div className="panel-section-title">Sắp xếp vị trí</div>
                {partnerUnion && partnerUnion.partners.length > 1 && (
                  <div className="move-row">
                    <span>Trong hàng vợ chồng</span>
                    <button className="btn ghost small" onClick={() => applyData(movePartner(data, selected, -1))}>←</button>
                    <button className="btn ghost small" onClick={() => applyData(movePartner(data, selected, +1))}>→</button>
                  </div>
                )}
                {childUnion && childUnion.children.length > 1 && (
                  <div className="move-row">
                    <span>Trong hàng anh chị em</span>
                    <button className="btn ghost small" onClick={() => applyData(moveChild(data, selected, -1))}>←</button>
                    <button className="btn ghost small" onClick={() => applyData(moveChild(data, selected, +1))}>→</button>
                  </div>
                )}
              </>
            )}

            <div className="panel-section-title">Khác</div>
            <div className="panel-actions">
              <button className="btn danger full" onClick={handleDelete}>🗑 Xóa người này</button>
            </div>
          </div>
        )}
      </div>

      {/* SVG ẩn dùng riêng cho xuất file — viewBox trọn cây, không pan/zoom */}
      <svg
        ref={exportSvgRef}
        viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', left: -99999, top: 0, width: 10, height: 10 }}
      >
        <GenerationLabels maxDepth={layout.maxDepth} />
        <TreeLinks links={layout.links} />
        {layout.cards.map((c) => (
          <PersonCard key={c.pid} person={data.persons[c.pid]} x={c.x} y={c.y} selected={false} />
        ))}
      </svg>

      {shareOpen && (
        <div className="modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Chia sẻ gia phả</h3>

            <div className="panel-section-title">Liên kết công khai (ai có link đều xem được)</div>
            {shareToken ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input readOnly value={shareUrl} onFocus={(e) => e.target.select()}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #c9b48a', borderRadius: 5, background: '#fffdf6', fontSize: 13 }} />
                  <button className="btn small" onClick={copyShareUrl}>Sao chép</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>
                    Người xem không cần đăng nhập, chỉ xem và tải PNG/PDF.
                  </span>
                  <button className="btn danger small" onClick={disableShare}>Tắt chia sẻ</button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>Gia phả hiện ở chế độ riêng tư.</span>
                <button className="btn gold small" onClick={enableShare}>Tạo liên kết</button>
              </div>
            )}

            <div className="panel-section-title" style={{ marginTop: 22 }}>Người được quyền chỉnh sửa</div>
            <form onSubmit={addEditor} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                placeholder="Tên đăng nhập của người dùng…"
                value={editorName}
                onChange={(e) => setEditorName(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #c9b48a', borderRadius: 5, background: '#fffdf6' }}
              />
              <button className="btn small" type="submit">Thêm</button>
            </form>
            {editors.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                Chưa chia sẻ quyền chỉnh sửa cho ai.
              </div>
            ) : (
              editors.map((ed) => (
                <div className="move-row" key={ed.id}>
                  <span>👤 {ed.username}</span>
                  <button className="btn danger small" onClick={() => removeEditor(ed)}>Thu hồi</button>
                </div>
              ))
            )}

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setShareOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {genModal && (
        <div className="modal-backdrop" onClick={() => setGenModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Thêm đời phía trên</h3>
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 12 }}>
              Đời gốc hiện có nhiều người. Chọn người là <b>con ruột</b> của đời mới (cha mẹ sẽ được tạo phía trên người này):
            </p>
            {data.unions[data.rootId].partners.map((pid) => (
              <label className="radio-row" key={pid}>
                <input type="radio" name="gen-anchor" checked={genAnchor === pid} onChange={() => setGenAnchor(pid)} />
                {data.persons[pid].name}
              </label>
            ))}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setGenModal(false)}>Hủy</button>
              <button className="btn" onClick={confirmGenAbove}>Thêm đời trên</button>
            </div>
          </div>
        </div>
      )}

      {avatarCrop && (
        <AvatarCropModal
          source={avatarCrop}
          onCancel={() => setAvatarCrop(null)}
          onSave={(avatar) => {
            applyData(updatePerson(data, selected, { avatar }));
            setAvatarCrop(null);
            toast('Đã cắt và cập nhật ảnh đại diện');
          }}
        />
      )}
    </div>
  );
}
