import React from 'react';
import { CARD_W, CARD_H } from './layout.js';

const COLORS = {
  card: '#fdf8ec',
  cardBorder: '#8c2f2f',
  cardInner: '#c9a227',
  line: '#9b7b33',
  male: '#34547a',
  female: '#a04858',
  other: '#6d5c4d',
  ink: '#3b2b20',
  inkSoft: '#7a685a',
  selected: '#c9861f',
};

// Vị trí & bán kính avatar trong card (dùng chung với exporter để vẽ đè lên canvas)
export const AVATAR = { cx: CARD_W / 2, cy: 52, r: 33 };

// Chữ cái đầu của tên (bỏ ký tự không phải chữ, vd "(mới)" -> "M")
export function initialOf(name) {
  const last = (name || '').trim().split(/\s+/).pop() || '';
  const letters = last.replace(/[^\p{L}]/gu, '');
  return (letters[0] || '?').toUpperCase();
}

// Cắt tên thành tối đa 2 dòng
function wrapName(name, maxChars = 15) {
  const words = (name || '').trim().split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + ' ' + w).length > maxChars) {
      if (lines.length === 2) { lines[1] = lines[1] + '…'; break; }
      lines.push(w);
    } else {
      lines[lines.length - 1] = cur ? cur + ' ' + w : w;
    }
  }
  return lines;
}

export function PersonCard({ person, x, y, selected, onSelect }) {
  const genderColor = COLORS[person.gender] || COLORS.other;
  const lines = wrapName(person.name);
  const years = [person.birth, person.death].filter(Boolean).join(' – ') || (person.birth === '' ? '' : person.birth);
  const clipId = `avatar-clip-${person.id}`;

  return (
    <g
      className="person-card"
      transform={`translate(${x},${y})`}
      onClick={(e) => { e.stopPropagation(); onSelect?.(person.id); }}
    >
      {selected && (
        <rect x={-5} y={-5} width={CARD_W + 10} height={CARD_H + 10} rx={14}
          fill="none" stroke={COLORS.selected} strokeWidth={3.5} opacity={0.9} />
      )}
      <rect className="card-bg" width={CARD_W} height={CARD_H} rx={10}
        fill={COLORS.card} stroke={COLORS.cardBorder} strokeWidth={1.6} />
      <rect x={4.5} y={4.5} width={CARD_W - 9} height={CARD_H - 9} rx={7}
        fill="none" stroke={COLORS.cardInner} strokeWidth={0.9} opacity={0.85} />
      {/* dải màu giới tính trên đỉnh */}
      <path d={`M 10 1.2 H ${CARD_W - 10}`} stroke={genderColor} strokeWidth={4.5} strokeLinecap="round" />

      {/* avatar */}
      <defs>
        <clipPath id={clipId}><circle cx={CARD_W / 2} cy={52} r={33} /></clipPath>
      </defs>
      <circle cx={CARD_W / 2} cy={52} r={35.5} fill="none" stroke={COLORS.cardInner} strokeWidth={2} />
      {person.avatar ? (
        <image href={person.avatar} x={CARD_W / 2 - 33} y={19} width={66} height={66}
          clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle cx={CARD_W / 2} cy={52} r={33} fill="#ece2cc" />
          <text x={CARD_W / 2} y={62} textAnchor="middle" fontSize={28} fill={genderColor}
            fontFamily="Georgia, serif" fontWeight="bold">
            {initialOf(person.name)}
          </text>
        </>
      )}

      {/* tên */}
      {lines.map((line, i) => (
        <text key={i} x={CARD_W / 2} y={112 + i * 19} textAnchor="middle" fontSize={14.5}
          fontWeight="bold" fill={COLORS.ink} fontFamily="Georgia, serif">
          {line}
        </text>
      ))}

      {/* năm sinh – mất */}
      <text x={CARD_W / 2} y={lines.length > 1 ? 154 : 140} textAnchor="middle" fontSize={12.5}
        fill={COLORS.inkSoft} fontFamily="Georgia, serif" fontStyle="italic">
        {years}
      </text>
      {/* giới tính */}
      <text x={CARD_W / 2} y={CARD_H - 12} textAnchor="middle" fontSize={11}
        fill={genderColor} fontFamily="Georgia, serif">
        {person.gender === 'male' ? 'Nam' : person.gender === 'female' ? 'Nữ' : ''}
      </text>
    </g>
  );
}

export function TreeLinks({ links }) {
  return (
    <g>
      {links.map((l, i) => {
        if (l.type === 'marriage') {
          // nét đôi truyền thống cho hôn nhân
          return (
            <g key={i}>
              <line x1={l.x1} y1={l.y - 2.5} x2={l.x2} y2={l.y - 2.5} stroke={COLORS.line} strokeWidth={1.6} />
              <line x1={l.x1} y1={l.y + 2.5} x2={l.x2} y2={l.y + 2.5} stroke={COLORS.line} strokeWidth={1.6} />
            </g>
          );
        }
        if (l.type === 'drop') {
          return <line key={i} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={COLORS.line} strokeWidth={1.6} />;
        }
        if (l.type === 'bus') {
          return <line key={i} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke={COLORS.line} strokeWidth={1.6} />;
        }
        return null;
      })}
    </g>
  );
}

// Nhãn "Đời 1, Đời 2..." bên trái
export function GenerationLabels({ maxDepth }) {
  const labels = [];
  for (let d = 0; d <= maxDepth; d++) {
    labels.push(
      <g key={d} transform={`translate(-92, ${d * (CARD_H + 110) + CARD_H / 2})`}>
        <rect x={-8} y={-16} width={72} height={32} rx={16} fill="none" stroke="#c9a227" strokeWidth={1.2} />
        <text x={28} y={5} textAnchor="middle" fontSize={14} fill="#8c2f2f"
          fontFamily="Georgia, serif" fontWeight="bold">
          Đời {d + 1}
        </text>
      </g>
    );
  }
  return <g>{labels}</g>;
}
