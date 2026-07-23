import React, { useEffect, useRef, useState } from 'react';

const OUTPUT_SIZE = 256;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve({ src: reader.result, image });
      image.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsDataURL(file);
  });
}

function cropSource(image, zoom, focalX, focalY) {
  const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  return {
    sx: (image.naturalWidth - side) * (focalX / 100),
    sy: (image.naturalHeight - side) * (focalY / 100),
    side,
  };
}

function drawCrop(canvas, image, zoom, focalX, focalY, size) {
  const ctx = canvas.getContext('2d');
  const { sx, sy, side } = cropSource(image, zoom, focalX, focalY);
  canvas.width = size;
  canvas.height = size;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
}

export async function prepareAvatarFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn một file ảnh');
  if (file.size > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 12 MB)');
  return readImage(file);
}

export default function AvatarCropModal({ source, onCancel, onSave }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);

  useEffect(() => {
    if (canvasRef.current && source?.image) {
      drawCrop(canvasRef.current, source.image, zoom, focalX, focalY, 320);
    }
  }, [source, zoom, focalX, focalY]);

  const startDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, focalX, focalY };
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const sensitivity = 100 / (260 * Math.max(0.65, zoom - 0.25));
    setFocalX(Math.max(0, Math.min(100, drag.focalX - (event.clientX - drag.x) * sensitivity)));
    setFocalY(Math.max(0, Math.min(100, drag.focalY - (event.clientY - drag.y) * sensitivity)));
  };

  const save = () => {
    const canvas = document.createElement('canvas');
    drawCrop(canvas, source.image, zoom, focalX, focalY, OUTPUT_SIZE);
    onSave(canvas.toDataURL('image/jpeg', 0.88));
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal avatar-crop-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Căn chỉnh ảnh đại diện</h3>
        <p className="crop-help">Kéo ảnh để chọn khuôn mặt, sau đó phóng to nếu cần.</p>
        <div className="crop-stage">
          <canvas
            ref={canvasRef}
            className="crop-canvas"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
          />
          <div className="crop-guide" aria-hidden="true" />
        </div>
        <div className="crop-control">
          <label htmlFor="avatar-zoom">Thu phóng</label>
          <span aria-hidden="true">−</span>
          <input
            id="avatar-zoom"
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <span aria-hidden="true">＋</span>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>Hủy</button>
          <button className="btn" type="button" onClick={save}>Dùng ảnh này</button>
        </div>
      </div>
    </div>
  );
}
