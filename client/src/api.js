const TOKEN_KEY = 'giapha_token';
const USER_KEY = 'giapha_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUsername = () => localStorage.getItem(USER_KEY);

export function setSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401) {
      clearSession();
      window.dispatchEvent(new Event('giapha:logout'));
    }
    throw new Error(body?.error || `Lỗi máy chủ (${res.status})`);
  }
  return body;
}

export const api = {
  register: (username, password) => request('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/me'),
  listTrees: () => request('/api/trees'),
  createTree: (name, data) => request('/api/trees', { method: 'POST', body: JSON.stringify({ name, data }) }),
  getTree: (id) => request(`/api/trees/${id}`),
  saveTree: (id, payload) => request(`/api/trees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTree: (id) => request(`/api/trees/${id}`, { method: 'DELETE' }),
  // Chia sẻ
  getShared: (token) => request(`/api/shared/${token}`),
  enableShare: (id) => request(`/api/trees/${id}/share`, { method: 'POST' }),
  disableShare: (id) => request(`/api/trees/${id}/share`, { method: 'DELETE' }),
  listEditors: (id) => request(`/api/trees/${id}/editors`),
  addEditor: (id, username) => request(`/api/trees/${id}/editors`, { method: 'POST', body: JSON.stringify({ username }) }),
  removeEditor: (id, userId) => request(`/api/trees/${id}/editors/${userId}`, { method: 'DELETE' }),
};
