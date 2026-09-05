import { getLang, t } from './i18n.js';

let csrfToken = null;

export function setCsrf(token) { csrfToken = token; }
export function getCsrf() { return csrfToken; }

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Das Backend verlangt bei allen verändernden Anfragen ein CSRF-Token im Header.
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', t('common.offline'));
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* kein JSON */ }

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'ERROR', err.message || t('common.error'));
  }
  return data;
}

const withLang = (path) => path + (path.includes('?') ? '&' : '?') + 'lang=' + getLang();

export const api = {
  // Auth
  register: (b) => call('POST', '/api/auth/register', b),
  login: (b) => call('POST', '/api/auth/login', b),
  logout: () => call('POST', '/api/auth/logout'),
  me: () => call('GET', '/api/auth/me'),

  // Profil & Tribe
  profile: () => call('GET', '/api/users/me'),
  updateProfile: (b) => call('PATCH', '/api/users/me', b),
  uploadAvatar: (b) => call('POST', '/api/users/me/avatar', b),
  uploadItemImage: (id, b) => call('POST', `/api/items/${id}/image`, b),
  dinos: (q = {}) => {
    const p = new URLSearchParams();
    if (q.search) p.set('search', q.search);
    if (q.species) p.set('species', q.species);
    if (q.status) p.set('status', q.status);
    return call('GET', `/api/dinos?${p}`);
  },
  dino: (id) => call('GET', `/api/dinos/${id}`),
  createDino: (b) => call('POST', '/api/dinos', b),
  updateDino: (id, b) => call('PATCH', `/api/dinos/${id}`, b),
  deleteDino: (id) => call('DELETE', `/api/dinos/${id}`),
  uploadDinoImage: (id, b) => call('POST', `/api/dinos/${id}/image`, b),
  servers: () => call('GET', '/api/servers'),
  server: (id) => call('GET', `/api/servers/${id}`),
  createServer: (b) => call('POST', '/api/servers', b),
  updateServer: (id, b) => call('PATCH', `/api/servers/${id}`, b),
  deleteServer: (id) => call('DELETE', `/api/servers/${id}`),
  createMarker: (serverId, b) => call('POST', `/api/servers/${serverId}/markers`, b),
  updateMarker: (id, b) => call('PATCH', `/api/markers/${id}`, b),
  deleteMarker: (id) => call('DELETE', `/api/markers/${id}`),
  uploadMarkerImage: (id, b) => call('POST', `/api/markers/${id}/image`, b),
  user: (id) => call('GET', `/api/users/${id}`),
  myTribe: () => call('GET', '/api/tribes/me'),

  // Katalog
  categories: () => call('GET', withLang('/api/categories')),
  items: (q = {}) => {
    const p = new URLSearchParams();
    if (q.search) p.set('search', q.search);
    if (q.categoryId) p.set('categoryId', q.categoryId);
    if (q.productType) p.set('productType', q.productType);
    p.set('lang', getLang());
    return call('GET', `/api/items?${p}`);
  },

  // Bestellungen
  orders: (scope) => call('GET', withLang('/api/orders' + (scope ? `?scope=${scope}` : ''))),
  order: (id) => call('GET', withLang(`/api/orders/${id}`)),
  createOrder: (b) => call('POST', '/api/orders', b),
  claimOrder: (id) => call('POST', `/api/orders/${id}/claim`),
  releaseOrder: (id) => call('POST', `/api/orders/${id}/release`),
  assignOrder: (id, userId) => call('POST', `/api/orders/${id}/assign`, { userId }),
  cancelOrder: (id) => call('POST', `/api/orders/${id}/cancel`),
  setItemStatus: (id, itemId, status) => call('PATCH', `/api/orders/${id}/items/${itemId}`, { status }),
  comments: (id) => call('GET', `/api/orders/${id}/comments`),
  addComment: (id, body) => call('POST', `/api/orders/${id}/comments`, { body }),

  // Mitteilungen
  notifications: () => call('GET', '/api/notifications'),
  markRead: (id) => call('PATCH', `/api/notifications/${id}/read`),
  markAllRead: () => call('POST', '/api/notifications/read-all'),
  notifPrefs: () => call('GET', '/api/notifications/preferences'),
  saveNotifPrefs: (preferences) => call('PUT', '/api/notifications/preferences', { preferences }),

  // Admin
  members: (tribeId) => call('GET', '/api/admin/members' + (tribeId ? `?tribeId=${tribeId}` : '')),
  approve: (id, tribeId) => call('PATCH', `/api/admin/members/${id}/approve` + (tribeId ? `?tribeId=${tribeId}` : '')),
  reject: (id, tribeId) => call('PATCH', `/api/admin/members/${id}/reject` + (tribeId ? `?tribeId=${tribeId}` : '')),
  disableMember: (id, tribeId) => call('PATCH', `/api/admin/members/${id}/disable` + (tribeId ? `?tribeId=${tribeId}` : '')),
  setBreeder: (id, on, tribeId) =>
    call('PATCH', `/api/admin/members/${id}/roles` + (tribeId ? `?tribeId=${tribeId}` : ''), { breederCrafter: on }),
  auditLogs: () => call('GET', '/api/admin/audit-logs'),

  // News
  news: () => call('GET', '/api/news'),
  adminNews: (tribeId) => call('GET', '/api/admin/news' + (tribeId ? `?tribeId=${tribeId}` : '')),
  createNews: (b, tribeId) => call('POST', '/api/admin/news' + (tribeId ? `?tribeId=${tribeId}` : ''), b),
  updateNews: (id, b, tribeId) => call('PATCH', `/api/admin/news/${id}` + (tribeId ? `?tribeId=${tribeId}` : ''), b),
  deleteNews: (id, tribeId) => call('DELETE', `/api/admin/news/${id}` + (tribeId ? `?tribeId=${tribeId}` : '')),

  // Developer
  tribes: () => call('GET', '/api/developer/tribes'),
  createTribe: (b) => call('POST', '/api/developer/tribes', b),
  updateTribe: (id, b) => call('PATCH', `/api/developer/tribes/${id}`, b),
  allUsers: (tribeId) => call('GET', '/api/developer/users' + (tribeId ? `?tribeId=${tribeId}` : '')),
  setRoles: (id, roles) => call('PATCH', `/api/developer/users/${id}/roles`, { roles }),
  deleteUser: (id) => call('DELETE', `/api/developer/users/${id}`),
  testMail: () => call('POST', '/api/developer/test-mail'),
  devAuditLogs: () => call('GET', '/api/developer/audit-logs'),
};
