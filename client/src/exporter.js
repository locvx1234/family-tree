// Xuất cây gia phả ra PNG / PDF / JSON để in ấn và lưu trữ.
import { jsPDF } from 'jspdf';
import { AVATAR } from './TreeSVG.jsx';

const PAD = 70;
const TITLE_H = 130;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Vẽ toàn bộ cây lên canvas: nền giấy, khung viền kép, tiêu đề, rồi ảnh SVG.
// avatars: [{src, x, y}] — vẽ đè trực tiếp lên canvas vì ảnh <image> lồng trong SVG
// không được trình duyệt đảm bảo tải xong khi raster hóa SVG qua thẻ <img>.
async function renderToCanvas(svgEl, treeName, scale = 2, avatars = []) {
  const vb = svgEl.viewBox.baseVal;
  const contentW = vb.width;
  const contentH = vb.height;
  const totalW = contentW + PAD * 2;
  const totalH = contentH + PAD * 2 + TITLE_H;

  // Chuẩn hóa SVG độc lập (font hệ thống nên không cần nhúng font).
  // Phải gỡ inline style (width/height 10px dùng để ẩn SVG) — CSS đè lên attribute
  // khiến cây bị raster hóa ở 10x10px rồi phóng to thành vệt mờ.
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute('style');
  clone.setAttribute('width', contentW);
  clone.setAttribute('height', contentH);
  const svgStr = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(totalW * scale);
  canvas.height = Math.round(totalH * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Nền giấy
  ctx.fillStyle = '#f7f0e0';
  ctx.fillRect(0, 0, totalW, totalH);

  // Khung viền kép truyền thống
  ctx.strokeStyle = '#7a1f1f';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, totalW - 32, totalH - 32);
  ctx.strokeStyle = '#b8892c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(26, 26, totalW - 52, totalH - 52);

  // Tiêu đề
  ctx.fillStyle = '#7a1f1f';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.min(44, totalW / 18)}px Georgia, serif`;
  ctx.fillText(treeName.toUpperCase(), totalW / 2, 82);
  ctx.fillStyle = '#b8892c';
  ctx.font = '20px Georgia, serif';
  ctx.fillText('❧ ─────── ❧', totalW / 2, 116);

  ctx.drawImage(img, PAD, PAD + TITLE_H, contentW, contentH);
  URL.revokeObjectURL(svgUrl);

  // Vẽ đè avatar (clip tròn, cover-fit) theo đúng tọa độ card trong layout
  for (const av of avatars) {
    try {
      const photo = await loadImage(av.src);
      const cx = PAD + (av.x - vb.x) + AVATAR.cx;
      const cy = PAD + TITLE_H + (av.y - vb.y) + AVATAR.cy;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, AVATAR.r, 0, Math.PI * 2);
      ctx.clip();
      const s = Math.max((AVATAR.r * 2) / photo.width, (AVATAR.r * 2) / photo.height);
      ctx.drawImage(photo, cx - (photo.width * s) / 2, cy - (photo.height * s) / 2, photo.width * s, photo.height * s);
      ctx.restore();
    } catch {
      // ảnh hỏng -> giữ nguyên placeholder trong SVG
    }
  }
  return canvas;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const safeName = (name) => (name || 'gia-pha').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-');

export async function exportPNG(svgEl, treeName, avatars = []) {
  const canvas = await renderToCanvas(svgEl, treeName, 2, avatars);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  downloadBlob(blob, `${safeName(treeName)}.png`);
}

export async function exportPDF(svgEl, treeName, avatars = []) {
  const canvas = await renderToCanvas(svgEl, treeName, 2, avatars);
  const wPt = canvas.width * 0.36; // 2x scale -> ~72dpi gốc
  const hPt = canvas.height * 0.36;
  const pdf = new jsPDF({
    orientation: wPt > hPt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [wPt, hPt],
  });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wPt, hPt);
  pdf.save(`${safeName(treeName)}.pdf`);
}

export function exportJSON(treeName, data) {
  const payload = { app: 'gia-pha-viet', version: 1, name: treeName, data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeName(treeName)}.json`);
}

// Đọc file JSON import; chấp nhận cả file export của app lẫn tree data thô
export function readImportedJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed && parsed.app === 'gia-pha-viet' && parsed.data) {
          resolve({ name: parsed.name || file.name.replace(/\.json$/i, ''), data: parsed.data });
        } else {
          resolve({ name: file.name.replace(/\.json$/i, ''), data: parsed });
        }
      } catch {
        reject(new Error('File không phải JSON hợp lệ'));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsText(file);
  });
}

// Resize ảnh avatar về tối đa 256px, trả về data URI JPEG
export function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}
