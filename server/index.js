import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { sampleTreeNguyen, sampleTreeTran } from './sampleTrees.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR can be overridden by deployments that mount persistent storage
// outside the application directory. It defaults to server/data locally.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// JWT secret: sinh ngẫu nhiên lần đầu và lưu lại để token không bị mất hiệu lực khi restart
const SECRET_FILE = path.join(DATA_DIR, 'jwt-secret');
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
}
const JWT_SECRET = process.env.JWT_SECRET || fs.readFileSync(SECRET_FILE, 'utf8').trim();

const db = new DatabaseSync(path.join(DATA_DIR, 'familytree.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS tree_editors (
    tree_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (tree_id, user_id)
  );
`);
// Migration: cột share_token cho các DB tạo trước khi có chức năng chia sẻ
try { db.exec('ALTER TABLE trees ADD COLUMN share_token TEXT'); } catch {}
// Migration: thông tin định danh Google cho các DB tạo trước khi có SSO.
try { db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN email TEXT'); } catch {}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL');

const now = () => new Date().toISOString();

function createTree(userId, name, data) {
  const stmt = db.prepare('INSERT INTO trees (user_id, name, data, updated_at) VALUES (?, ?, ?, ?)');
  const res = stmt.run(userId, name, JSON.stringify(data), now());
  return Number(res.lastInsertRowid);
}

function seedSampleTrees(userId) {
  createTree(userId, 'Gia phả họ Nguyễn (mẫu)', sampleTreeNguyen());
  createTree(userId, 'Gia phả họ Trần (mẫu — 1 vợ 2 chồng)', sampleTreeTran());
}

// Tài khoản demo tạo sẵn
(function seedDemo() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
  if (!existing) {
    const hash = bcrypt.hashSync('demo123', 10);
    const res = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run('demo', hash, now());
    seedSampleTrees(Number(res.lastInsertRowid));
    console.log('Đã tạo tài khoản demo (demo / demo123) kèm dữ liệu mẫu');
  }
})();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));

// Lightweight endpoint used by Docker/hosting health checks.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  }
}

const makeToken = (uid) => jwt.sign({ uid }, JWT_SECRET, { expiresIn: '30d' });

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
const googleEnabled = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function googleRedirectUri(req) {
  return GOOGLE_REDIRECT_URI || `${requestOrigin(req)}/api/auth/google/callback`;
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
    return cookies;
  }, {});
}

function stateCookie(req, value, maxAge = 600) {
  const secure = requestOrigin(req).startsWith('https://');
  return [
    `giapha_google_state=${encodeURIComponent(value)}`,
    'Path=/api/auth/google',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function popupResult(res, payload, status = 200) {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  res.status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
    .send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Đăng nhập Google</title>
<style>body{font:16px system-ui,sans-serif;text-align:center;padding:48px;color:#3b2b20;background:#f7f0e0}</style></head>
<body><p>Đang hoàn tất đăng nhập…</p><script>
const result=${serialized};
if (window.opener) {
  window.opener.postMessage(result, window.location.origin);
  window.close();
} else if (result.token) {
  localStorage.setItem('giapha_token', result.token);
  localStorage.setItem('giapha_user', result.username);
  window.location.replace('/');
} else {
  document.body.innerHTML = '<p>' + (result.error || 'Không thể đăng nhập') + '</p><p><a href="/">Về trang chủ</a></p>';
}
</script></body></html>`);
}

function uniqueGoogleUsername(email, sub) {
  const localPart = String(email || 'google').split('@')[0];
  const clean = localPart.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 18) || 'google';
  const suffix = String(sub).replace(/[^a-zA-Z0-9]/g, '').slice(-6) || crypto.randomBytes(3).toString('hex');
  let candidate = `${clean}_${suffix}`.slice(0, 30);
  let counter = 1;
  while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(candidate)) {
    candidate = `${clean.slice(0, 24)}_${counter++}`.slice(0, 30);
  }
  return candidate;
}

app.get('/api/auth/google/status', (_req, res) => {
  res.json({ enabled: googleEnabled });
});

app.get('/api/auth/google', (req, res) => {
  if (!googleEnabled) return res.status(503).send('Đăng nhập Google chưa được cấu hình');
  const state = crypto.randomBytes(24).toString('base64url');
  const redirectUri = googleRedirectUri(req);
  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
  res.setHeader('Set-Cookie', stateCookie(req, state));
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  res.setHeader('Set-Cookie', stateCookie(req, '', 0));
  const expectedState = parseCookies(req).giapha_google_state;
  const state = String(req.query.state || '');
  const expectedBuffer = Buffer.from(expectedState || '');
  const stateBuffer = Buffer.from(state);
  if (!expectedState || !state || expectedBuffer.length !== stateBuffer.length
    || !crypto.timingSafeEqual(expectedBuffer, stateBuffer)) {
    return popupResult(res, { type: 'giapha:google-auth', error: 'Phiên đăng nhập Google không hợp lệ. Vui lòng thử lại.' }, 400);
  }
  if (req.query.error) {
    return popupResult(res, { type: 'giapha:google-auth', error: 'Bạn đã hủy đăng nhập Google.' }, 400);
  }
  const code = String(req.query.code || '');
  if (!code) {
    return popupResult(res, { type: 'giapha:google-auth', error: 'Google không trả về mã đăng nhập hợp lệ.' }, 400);
  }

  try {
    const redirectUri = googleRedirectUri(req);
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error('Missing Google ID token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || !profile.email_verified) {
      return popupResult(res, {
        type: 'giapha:google-auth',
        error: 'Tài khoản Google cần có email đã được xác minh.',
      }, 403);
    }

    let user = db.prepare('SELECT id, username FROM users WHERE google_sub = ?').get(profile.sub);
    if (!user) {
      const username = uniqueGoogleUsername(profile.email, profile.sub);
      // Tài khoản Google không dùng mật khẩu cục bộ; giá trị ngẫu nhiên này giữ tương thích DB cũ.
      const unusablePassword = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      const result = db.prepare(`
        INSERT INTO users (username, password_hash, google_sub, email, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, unusablePassword, profile.sub, profile.email, now());
      user = { id: Number(result.lastInsertRowid), username };
      seedSampleTrees(user.id);
    } else {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(profile.email, user.id);
    }

    return popupResult(res, {
      type: 'giapha:google-auth',
      token: makeToken(user.id),
      username: user.username,
    });
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return popupResult(res, {
      type: 'giapha:google-auth',
      error: 'Không thể xác minh tài khoản Google. Vui lòng thử lại.',
    }, 502);
  }
});

// Quyền truy cập một gia phả: 'owner' | 'editor' | null
function treeAccess(treeId, userId) {
  const tree = db.prepare('SELECT * FROM trees WHERE id = ?').get(treeId);
  if (!tree) return { tree: null, role: null };
  if (tree.user_id === userId) return { tree, role: 'owner' };
  const ed = db.prepare('SELECT 1 FROM tree_editors WHERE tree_id = ? AND user_id = ?').get(treeId, userId);
  return { tree, role: ed ? 'editor' : null };
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Tên đăng nhập 3–30 ký tự, chỉ gồm chữ, số, dấu _ . -' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, hash, now());
  const uid = Number(result.lastInsertRowid);
  seedSampleTrees(uid);
  res.json({ token: makeToken(uid), username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  res.json({ token: makeToken(user.id), username: user.username });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Không tìm thấy người dùng' });
  res.json({ username: user.username });
});

app.get('/api/trees', auth, (req, res) => {
  const summarize = (r, role, owner) => {
    let personCount = 0;
    try { personCount = Object.keys(JSON.parse(r.data).persons || {}).length; } catch {}
    return { id: r.id, name: r.name, updatedAt: r.updated_at, personCount, role, owner };
  };
  const own = db.prepare('SELECT id, name, data, updated_at FROM trees WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.userId)
    .map((r) => summarize(r, 'owner', null));
  const shared = db.prepare(`
    SELECT t.id, t.name, t.data, t.updated_at, u.username AS owner
    FROM trees t
    JOIN tree_editors e ON e.tree_id = t.id
    JOIN users u ON u.id = t.user_id
    WHERE e.user_id = ? ORDER BY t.updated_at DESC
  `).all(req.userId)
    .map((r) => summarize(r, 'editor', r.owner));
  res.json([...own, ...shared]);
});

app.post('/api/trees', auth, (req, res) => {
  const { name, data } = req.body || {};
  const treeName = (name || '').trim() || 'Gia phả mới';
  const treeData = data && validateTreeData(data) ? data : newEmptyTree();
  const id = createTree(req.userId, treeName, treeData);
  res.json({ id, name: treeName });
});

app.get('/api/trees/:id', auth, (req, res) => {
  const { tree: row, role } = treeAccess(Number(req.params.id), req.userId);
  if (!row || !role) return res.status(404).json({ error: 'Không tìm thấy gia phả' });
  const owner = db.prepare('SELECT username FROM users WHERE id = ?').get(row.user_id);
  res.json({
    id: row.id,
    name: row.name,
    data: JSON.parse(row.data),
    updatedAt: row.updated_at,
    role,
    owner: owner?.username || null,
    shareToken: role === 'owner' ? row.share_token : undefined,
  });
});

app.put('/api/trees/:id', auth, (req, res) => {
  const { tree: row, role } = treeAccess(Number(req.params.id), req.userId);
  if (!row || !role) return res.status(404).json({ error: 'Không tìm thấy gia phả' });
  const { name, data } = req.body || {};
  if (data !== undefined && !validateTreeData(data)) {
    return res.status(400).json({ error: 'Dữ liệu gia phả không hợp lệ' });
  }
  const newName = name !== undefined ? String(name).trim() || row.name : row.name;
  if (data !== undefined) {
    db.prepare('UPDATE trees SET name = ?, data = ?, updated_at = ? WHERE id = ?')
      .run(newName, JSON.stringify(data), now(), row.id);
  } else {
    db.prepare('UPDATE trees SET name = ?, updated_at = ? WHERE id = ?').run(newName, now(), row.id);
  }
  res.json({ ok: true });
});

app.delete('/api/trees/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM trees WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.userId);
  if (!result.changes) return res.status(404).json({ error: 'Không tìm thấy gia phả' });
  db.prepare('DELETE FROM tree_editors WHERE tree_id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ===== Chia sẻ công khai (link xem cho người không đăng nhập) =====

function requireOwner(req, res) {
  const { tree, role } = treeAccess(Number(req.params.id), req.userId);
  if (!tree || !role) { res.status(404).json({ error: 'Không tìm thấy gia phả' }); return null; }
  if (role !== 'owner') { res.status(403).json({ error: 'Chỉ chủ sở hữu mới quản lý được chia sẻ' }); return null; }
  return tree;
}

app.post('/api/trees/:id/share', auth, (req, res) => {
  const tree = requireOwner(req, res);
  if (!tree) return;
  const token = tree.share_token || crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE trees SET share_token = ? WHERE id = ?').run(token, tree.id);
  res.json({ shareToken: token });
});

app.delete('/api/trees/:id/share', auth, (req, res) => {
  const tree = requireOwner(req, res);
  if (!tree) return;
  db.prepare('UPDATE trees SET share_token = NULL WHERE id = ?').run(tree.id);
  res.json({ ok: true });
});

// Xem công khai — không cần đăng nhập
app.get('/api/shared/:token', (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: 'Liên kết không hợp lệ' });
  const row = db.prepare(`
    SELECT t.name, t.data, t.updated_at, u.username AS owner
    FROM trees t JOIN users u ON u.id = t.user_id
    WHERE t.share_token = ?
  `).get(token);
  if (!row) return res.status(404).json({ error: 'Liên kết không tồn tại hoặc đã bị tắt chia sẻ' });
  res.json({ name: row.name, data: JSON.parse(row.data), updatedAt: row.updated_at, owner: row.owner });
});

// ===== Quyền chỉnh sửa cho user khác =====

app.get('/api/trees/:id/editors', auth, (req, res) => {
  const tree = requireOwner(req, res);
  if (!tree) return;
  const rows = db.prepare(`
    SELECT u.id, u.username FROM tree_editors e JOIN users u ON u.id = e.user_id WHERE e.tree_id = ?
  `).all(tree.id);
  res.json(rows);
});

app.post('/api/trees/:id/editors', auth, (req, res) => {
  const tree = requireOwner(req, res);
  if (!tree) return;
  const username = String((req.body || {}).username || '').trim();
  const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: `Không tìm thấy người dùng "${username}"` });
  if (user.id === req.userId) return res.status(400).json({ error: 'Bạn đã là chủ sở hữu gia phả này' });
  db.prepare('INSERT OR IGNORE INTO tree_editors (tree_id, user_id) VALUES (?, ?)').run(tree.id, user.id);
  res.json({ id: user.id, username: user.username });
});

app.delete('/api/trees/:id/editors/:userId', auth, (req, res) => {
  const tree = requireOwner(req, res);
  if (!tree) return;
  db.prepare('DELETE FROM tree_editors WHERE tree_id = ? AND user_id = ?').run(tree.id, Number(req.params.userId));
  res.json({ ok: true });
});

function newEmptyTree() {
  return {
    version: 1,
    persons: {
      p1: {
        id: 'p1',
        name: 'Cụ tổ',
        gender: 'male',
        birth: '',
        death: '',
        isDeceased: false,
        phone: '',
        socialLinks: '',
        note: '',
        avatar: null,
      },
    },
    unions: { u1: { id: 'u1', partners: ['p1'], children: [] } },
    rootId: 'u1',
  };
}

function validateTreeData(data) {
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

// Production: phục vụ frontend đã build
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const PORT = process.env.API_PORT || (process.env.NODE_ENV === 'production' && process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API server chạy tại http://localhost:${PORT}`));
