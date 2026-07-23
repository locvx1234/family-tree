import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { computeLayout, generationMap } from './layout.js';
import { PersonCard, TreeLinks, GenerationLabels, initialOf } from './TreeSVG.jsx';
import { exportPNG, exportPDF } from './exporter.js';

const MARGIN = { left: 120, top: 30, right: 40, bottom: 40 };

function safeSocialLinks(value) {
  return String(value || '')
    .split(/\s+/)
    .map((link) => link.trim())
    .filter((link) => {
      if (!/^https?:\/\//i.test(link)) return false;
      try { return Boolean(new URL(link).hostname); } catch { return false; }
    });
}

// Trang xem gia phả công khai qua link chia sẻ — không cần đăng nhập, chỉ đọc.
export default function SharedView({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef(null);
  const exportSvgRef = useRef(null);
  const panRef = useRef(null);
  const fittedRef = useRef(false);

  const layout = useMemo(() => (info ? computeLayout(info.data) : null), [info]);
  const genMap = useMemo(() => (info ? generationMap(info.data) : {}), [info]);

  useEffect(() => {
    api.getShared(token).then(setInfo).catch((err) => setError(err.message));
  }, [token]);

  const contentBounds = (lo) => ({
    x: -MARGIN.left,
    y: -MARGIN.top,
    w: lo.width + MARGIN.left + MARGIN.right,
    h: lo.height + MARGIN.top + MARGIN.bottom,
  });

  const fitView = (lo = layout) => {
    const el = canvasRef.current;
    if (!el || !lo) return;
    const b = contentBounds(lo);
    const k = Math.min(el.clientWidth / b.w, el.clientHeight / b.h, 1.1);
    setView({ k, tx: (el.clientWidth - b.w * k) / 2 - b.x * k, ty: (el.clientHeight - b.h * k) / 2 - b.y * k });
  };

  useEffect(() => {
    if (layout && !fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => fitView(layout));
    }
  }, [layout]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setView((v) => {
        const k = Math.min(3, Math.max(0.08, v.k * Math.exp(-e.deltaY * 0.0015)));
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        return { k, tx: px - ((px - v.tx) * k) / v.k, ty: py - ((py - v.ty) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [info !== null]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    canvasRef.current?.classList.add('panning');
  };
  const onPointerMove = (e) => {
    const p = panRef.current;
    if (!p) return;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 3) p.moved = true;
    setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
  };
  const onPointerUp = () => {
    const p = panRef.current;
    panRef.current = null;
    canvasRef.current?.classList.remove('panning');
    if (p && !p.moved) setSelected(null);
  };

  const handleExport = async (kind) => {
    setExporting(true);
    try {
      const avatars = layout.cards
        .filter((c) => info.data.persons[c.pid]?.avatar)
        .map((c) => ({
          src: info.data.persons[c.pid].avatar,
          x: c.x,
          y: c.y,
          isDeceased: info.data.persons[c.pid].isDeceased ?? Boolean(info.data.persons[c.pid].death),
        }));
      if (kind === 'png') await exportPNG(exportSvgRef.current, info.name, avatars);
      else await exportPDF(exportSvgRef.current, info.name, avatars);
    } finally {
      setExporting(false);
    }
  };

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="brand">
            <div className="ornament">❧ ❧ ❧</div>
            <div className="brand-title">GIA PHẢ VIỆT</div>
          </div>
          <div className="error-msg">{error}</div>
          <a className="btn" href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}>Về trang chủ</a>
        </div>
      </div>
    );
  }

  if (!info || !layout) {
    return <div className="empty-state" style={{ paddingTop: 120 }}>Đang tải gia phả…</div>;
  }

  const b = contentBounds(layout);
  const person = selected ? info.data.persons[selected] : null;

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--red)', letterSpacing: 1 }}>🌳 GIA PHẢ VIỆT</span>
        <span style={{ fontSize: 15, fontWeight: 'bold' }}>{info.name}</span>
        <span className="save-status">của {info.owner} · chế độ xem</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn gold small" onClick={() => handleExport('png')} disabled={exporting}>🖼 Tải PNG</button>
        <button className="btn gold small" onClick={() => handleExport('pdf')} disabled={exporting}>📄 Tải PDF</button>
        <a className="btn ghost small" href="/" style={{ textDecoration: 'none' }}>Về trang chủ</a>
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
                  person={info.data.persons[c.pid]}
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
            <span className="gen-tag">
              Đời thứ {(genMap[selected] ?? 0) + 1}
              {(person.isDeceased ?? Boolean(person.death)) && <span className="deceased-label">Đã mất</span>}
            </span>
            <div className="avatar-edit">
              {person.avatar ? (
                <img className="avatar-preview" src={person.avatar} alt="" />
              ) : (
                <div className="avatar-preview">{initialOf(person.name)}</div>
              )}
            </div>
            <div className="field"><label>Giới tính</label>
              <div>{person.gender === 'male' ? 'Nam' : person.gender === 'female' ? 'Nữ' : 'Khác'}</div>
            </div>
            {(person.birth || person.death) && (
              <div className="field"><label>Năm sinh – mất</label>
                <div>{[person.birth || '?', person.death].filter(Boolean).join(' – ')}</div>
              </div>
            )}
            {person.phone && (
              <div className="field"><label>Số điện thoại</label>
                <a className="profile-link" href={`tel:${person.phone.replace(/[^\d+]/g, '')}`}>{person.phone}</a>
              </div>
            )}
            {safeSocialLinks(person.socialLinks).length > 0 && (
              <div className="field"><label>Mạng xã hội</label>
                <div className="profile-links">
                  {safeSocialLinks(person.socialLinks).map((link) => (
                    <a className="profile-link" href={link} target="_blank" rel="noreferrer" key={link}>
                      {new URL(link).hostname.replace(/^www\./, '')}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {person.note && (
              <div className="field"><label>Ghi chú</label>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{person.note}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SVG ẩn dùng cho xuất file */}
      <svg
        ref={exportSvgRef}
        viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', left: -99999, top: 0, width: 10, height: 10 }}
      >
        <GenerationLabels maxDepth={layout.maxDepth} />
        <TreeLinks links={layout.links} />
        {layout.cards.map((c) => (
          <PersonCard key={c.pid} person={info.data.persons[c.pid]} x={c.x} y={c.y} selected={false} />
        ))}
      </svg>
    </div>
  );
}
