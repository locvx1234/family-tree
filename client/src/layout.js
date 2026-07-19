// Engine tính toán bố cục cây gia phả.
// Quy tắc:
//  - Mỗi đời (thế hệ) nằm trên một hàng ngang.
//  - Thứ tự partners trong union = thứ tự trái -> phải (chồng bên trái vợ cả, vợ hai kế tiếp...).
//  - Thứ tự children = con cả -> con út, trái -> phải.
//  - Mỗi người chỉ là partner của tối đa 1 union (đa thê / đa phu nằm chung trong 1 union).

export const CARD_W = 150;
export const CARD_H = 184;
export const SPOUSE_GAP = 18;
export const SIB_GAP = 46;
export const ROW_GAP = 110;
export const MARRIAGE_Y = 0.42; // tỉ lệ chiều cao card nơi vẽ đường hôn nhân

export function unionOfPartner(tree, pid) {
  return Object.values(tree.unions).find((u) => u.partners.includes(pid)) || null;
}

export function unionOfChild(tree, pid) {
  return Object.values(tree.unions).find((u) => u.children.includes(pid)) || null;
}

// Trả về { cards: [{pid, x, y, depth}], links: [...], width, height, maxDepth }
export function computeLayout(tree) {
  const partnerUnion = {};
  for (const u of Object.values(tree.unions)) {
    for (const p of u.partners) partnerUnion[p] = u;
  }

  const widthMemo = {};
  const childSubtreeWidth = (pid) => {
    const u = partnerUnion[pid];
    return u ? unionWidth(u) : CARD_W;
  };
  const unionWidth = (u) => {
    if (widthMemo[u.id] !== undefined) return widthMemo[u.id];
    widthMemo[u.id] = 0; // chặn đệ quy vô hạn nếu dữ liệu lỗi vòng lặp
    const pw = u.partners.length * CARD_W + Math.max(0, u.partners.length - 1) * SPOUSE_GAP;
    let cw = 0;
    u.children.forEach((c, i) => { cw += childSubtreeWidth(c) + (i > 0 ? SIB_GAP : 0); });
    widthMemo[u.id] = Math.max(pw, cw, CARD_W);
    return widthMemo[u.id];
  };

  const cards = [];
  const links = [];
  const cardPos = {};
  let maxDepth = 0;
  const rowY = (depth) => depth * (CARD_H + ROW_GAP);
  const placed = new Set(); // chống lặp vô hạn với dữ liệu lỗi

  function placeUnion(u, x, depth) {
    if (placed.has(u.id)) return;
    placed.add(u.id);
    maxDepth = Math.max(maxDepth, depth);
    const w = unionWidth(u);
    const y = rowY(depth);

    // Hàng vợ chồng, căn giữa theo bề rộng subtree
    const pw = u.partners.length * CARD_W + Math.max(0, u.partners.length - 1) * SPOUSE_GAP;
    let px = x + (w - pw) / 2;
    for (const pid of u.partners) {
      cards.push({ pid, x: px, y, depth });
      cardPos[pid] = { x: px, y };
      px += CARD_W + SPOUSE_GAP;
    }

    // Đường hôn nhân nối các partner kề nhau (nét đôi)
    const mY = y + CARD_H * MARRIAGE_Y;
    for (let i = 0; i < u.partners.length - 1; i++) {
      const a = cardPos[u.partners[i]];
      const b = cardPos[u.partners[i + 1]];
      links.push({ type: 'marriage', x1: a.x + CARD_W, x2: b.x, y: mY });
    }

    // Các con
    if (u.children.length > 0) {
      let cwTotal = 0;
      u.children.forEach((c, i) => { cwTotal += childSubtreeWidth(c) + (i > 0 ? SIB_GAP : 0); });
      let cx = x + (w - cwTotal) / 2;
      const busY = y + CARD_H + ROW_GAP / 2;
      const dropXs = [];

      for (const c of u.children) {
        const cw = childSubtreeWidth(c);
        const cu = partnerUnion[c];
        if (cu) {
          placeUnion(cu, cx, depth + 1);
        } else {
          const ccx = cx + (cw - CARD_W) / 2;
          cards.push({ pid: c, x: ccx, y: rowY(depth + 1), depth: depth + 1 });
          cardPos[c] = { x: ccx, y: rowY(depth + 1) };
          maxDepth = Math.max(maxDepth, depth + 1);
        }
        const pos = cardPos[c];
        if (pos) {
          const dx = pos.x + CARD_W / 2;
          dropXs.push(dx);
          links.push({ type: 'drop', x: dx, y1: busY, y2: rowY(depth + 1) });
        }
        cx += cw + SIB_GAP;
      }

      // Đường trục ngang (bus) + nhánh rơi từ hàng cha mẹ
      const rowCenterX = x + w / 2;
      // Số partner lẻ -> trục rơi trúng giữa card giữa, bắt đầu từ đáy card; chẵn -> từ đường hôn nhân
      const stubTop = u.partners.length % 2 === 1 ? y + CARD_H : mY;
      links.push({ type: 'drop', x: rowCenterX, y1: stubTop, y2: busY });
      const minX = Math.min(...dropXs, rowCenterX);
      const maxX = Math.max(...dropXs, rowCenterX);
      if (maxX > minX) links.push({ type: 'bus', x1: minX, x2: maxX, y: busY });
    }
  }

  const root = tree.unions[tree.rootId];
  if (root) placeUnion(root, 0, 0);

  const width = root ? unionWidth(root) : CARD_W;
  const height = (maxDepth + 1) * CARD_H + maxDepth * ROW_GAP;
  return { cards, links, cardPos, width, height, maxDepth };
}

// Đời (thế hệ) của từng người: partner cùng union = cùng đời với người gốc
export function generationMap(tree) {
  const gen = {};
  const root = tree.unions[tree.rootId];
  if (!root) return gen;
  const visit = (u, depth) => {
    for (const p of u.partners) if (gen[p] === undefined) gen[p] = depth;
    for (const c of u.children) {
      if (gen[c] !== undefined) continue;
      gen[c] = depth + 1;
      const cu = unionOfPartner(tree, c);
      if (cu) visit(cu, depth + 1);
    }
  };
  visit(root, 0);
  return gen;
}
