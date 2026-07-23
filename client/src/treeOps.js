// Các thao tác chỉnh sửa dữ liệu cây gia phả (thuần, trả về tree mới).

export function uid(prefix = 'p') {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

const clone = (tree) => JSON.parse(JSON.stringify(tree));
const findPartnerUnion = (t, pid) => Object.values(t.unions).find((u) => u.partners.includes(pid)) || null;
const findChildUnion = (t, pid) => Object.values(t.unions).find((u) => u.children.includes(pid)) || null;

export function newPerson(overrides = {}) {
  return {
    id: uid('p'),
    name: 'Chưa đặt tên',
    gender: 'male',
    birth: '',
    death: '',
    isDeceased: false,
    phone: '',
    socialLinks: '',
    note: '',
    avatar: null,
    ...overrides,
  };
}

export function updatePerson(tree, pid, fields) {
  const t = clone(tree);
  Object.assign(t.persons[pid], fields);
  return t;
}

// Thêm vợ/chồng: chèn ngay bên phải người được chọn trong hàng partners
export function addSpouse(tree, pid) {
  const t = clone(tree);
  let u = findPartnerUnion(t, pid);
  if (!u) {
    u = { id: uid('u'), partners: [pid], children: [] };
    t.unions[u.id] = u;
  }
  const base = t.persons[pid];
  const sp = newPerson({
    name: 'Vợ/Chồng mới',
    gender: base.gender === 'male' ? 'female' : 'male',
  });
  t.persons[sp.id] = sp;
  const idx = u.partners.indexOf(pid);
  u.partners.splice(idx + 1, 0, sp.id);
  return { tree: t, newId: sp.id };
}

// Thêm con: nối vào cuối danh sách con (con út)
export function addChild(tree, pid) {
  const t = clone(tree);
  let u = findPartnerUnion(t, pid);
  if (!u) {
    u = { id: uid('u'), partners: [pid], children: [] };
    t.unions[u.id] = u;
  }
  const child = newPerson({ name: 'Con mới' });
  t.persons[child.id] = child;
  u.children.push(child.id);
  return { tree: t, newId: child.id };
}

// Thêm đời phía trên: tạo cha (union mới) cho một partner của union gốc, union mới thành gốc
export function addGenerationAbove(tree, anchorPid) {
  const t = clone(tree);
  const father = newPerson({ name: 'Cụ tổ (mới)', gender: 'male' });
  t.persons[father.id] = father;
  const u = { id: uid('u'), partners: [father.id], children: [anchorPid] };
  t.unions[u.id] = u;
  t.rootId = u.id;
  return { tree: t, newId: father.id };
}

// Đếm số người sẽ bị xóa nếu xóa pid (để hiển thị cảnh báo)
export function countDeleted(tree, pid) {
  const r = planDelete(tree, pid);
  return r.error ? 0 : r.toDelete.size;
}

// Xác định tập người bị xóa khi xóa pid:
//  - Vợ/chồng "gả vào" (không phải con của ai) và union còn partner khác: chỉ xóa mình họ, con giữ lại.
//  - Người "gốc máu" có gia đình riêng: xóa cả nhánh (vợ/chồng gả vào + toàn bộ con cháu).
//  - Partner duy nhất của union còn con: chặn, yêu cầu xóa các con trước.
function planDelete(tree, pid) {
  const parentU = findChildUnion(tree, pid);
  const ownU = findPartnerUnion(tree, pid);
  const isChildAnywhere = (id) => !!findChildUnion(tree, id);
  const toDelete = new Set();

  const collectBranch = (id) => {
    if (toDelete.has(id)) return;
    toDelete.add(id);
    const u = findPartnerUnion(tree, id);
    if (!u) return;
    for (const p of u.partners) {
      if (p !== id && !isChildAnywhere(p)) toDelete.add(p); // vợ/chồng gả vào đi theo nhánh
    }
    for (const c of u.children) collectBranch(c);
  };

  if (ownU && ownU.children.length > 0) {
    const marriedIn = !parentU && ownU.partners.length > 1;
    if (marriedIn) {
      toDelete.add(pid); // chỉ xóa người gả vào, con cháu giữ lại theo partner còn lại
    } else if (ownU.partners.length === 1 && !parentU) {
      // Partner duy nhất ở gốc, có đúng 1 con -> cho xóa, con trở thành gốc mới (hoàn tác "thêm đời trên")
      if (ownU.id === tree.rootId && ownU.children.length === 1) {
        toDelete.add(pid);
      } else {
        return { error: 'Không thể xóa khi người này vẫn còn con cháu. Hãy xóa các nhánh con trước.' };
      }
    } else {
      collectBranch(pid); // gốc máu -> xóa cả nhánh
    }
  } else if (ownU && parentU) {
    // là con, có vợ/chồng nhưng chưa có con -> xóa cả vợ/chồng gả vào
    toDelete.add(pid);
    for (const p of ownU.partners) if (!isChildAnywhere(p)) toDelete.add(p);
  } else {
    toDelete.add(pid);
  }

  const remaining = Object.keys(tree.persons).filter((id) => !toDelete.has(id));
  if (remaining.length === 0) return { error: 'Gia phả phải còn ít nhất một người.' };
  return { toDelete };
}

export function deletePerson(tree, pid) {
  const plan = planDelete(tree, pid);
  if (plan.error) return { error: plan.error };
  const { toDelete } = plan;
  const t = clone(tree);

  for (const id of toDelete) delete t.persons[id];
  for (const u of Object.values(t.unions)) {
    u.partners = u.partners.filter((p) => !toDelete.has(p));
    u.children = u.children.filter((c) => !toDelete.has(c));
  }
  for (const u of Object.values(t.unions)) {
    if (u.partners.length === 0) delete t.unions[u.id];
  }

  // Nếu union gốc bị xóa -> chọn gốc mới là union không có partner nào là con của union khác
  if (!t.unions[t.rootId]) {
    const all = Object.values(t.unions);
    const childIds = new Set(all.flatMap((u) => u.children));
    const newRoot = all.find((u) => !u.partners.some((p) => childIds.has(p))) || all[0];
    if (newRoot) {
      t.rootId = newRoot.id;
    } else {
      const firstPid = Object.keys(t.persons)[0];
      const u = { id: uid('u'), partners: [firstPid], children: [] };
      t.unions[u.id] = u;
      t.rootId = u.id;
    }
  }
  return { tree: t, deletedCount: toDelete.size };
}

// Di chuyển trong hàng vợ chồng
export function movePartner(tree, pid, dir) {
  const t = clone(tree);
  const u = findPartnerUnion(t, pid);
  if (!u) return t;
  const i = u.partners.indexOf(pid);
  const j = i + dir;
  if (j < 0 || j >= u.partners.length) return t;
  [u.partners[i], u.partners[j]] = [u.partners[j], u.partners[i]];
  return t;
}

// Di chuyển trong hàng anh chị em
export function moveChild(tree, pid, dir) {
  const t = clone(tree);
  const u = Object.values(t.unions).find((x) => x.children.includes(pid));
  if (!u) return t;
  const i = u.children.indexOf(pid);
  const j = i + dir;
  if (j < 0 || j >= u.children.length) return t;
  [u.children[i], u.children[j]] = [u.children[j], u.children[i]];
  return t;
}

export function validateTreeData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.persons || typeof data.persons !== 'object') return false;
  if (!data.unions || typeof data.unions !== 'object') return false;
  if (!data.rootId || !data.unions[data.rootId]) return false;
  for (const u of Object.values(data.unions)) {
    if (!Array.isArray(u.partners) || !Array.isArray(u.children)) return false;
    for (const pid of [...u.partners, ...u.children]) {
      if (!data.persons[pid]) return false;
    }
  }
  return true;
}
