const BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('admin_token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export const api = {
  // 公开
  getVersions: (channel) => request('/versions' + (channel ? '?channel=' + channel : '')),
  getLatest: (channel) => request('/versions/latest' + (channel ? '?channel=' + channel : '')),
  getVersion: (version) => request('/versions/' + version),

  // 管理
  login: (username, password) => request('/admin/login', { method: 'POST', body: { username, password } }),
  checkAuth: () => request('/admin/check'),
  createVersion: (data) => request('/admin/versions', { method: 'POST', body: data }),
  updateVersion: (id, data) => request('/admin/versions/' + id, { method: 'PUT', body: data }),
  deleteVersion: (id) => request('/admin/versions/' + id, { method: 'DELETE' }),
  uploadAsset: (id, platform, file) => {
    const fd = new FormData();
    fd.append('platform', platform);
    fd.append('file', file);
    return request('/admin/versions/' + id + '/upload', { method: 'POST', body: fd });
  },
  deleteAsset: (id, platform) => request('/admin/versions/' + id + '/assets/' + platform, { method: 'DELETE' }),
};

export function downloadUrl(version, platform) {
  return '/download/' + version + '/' + platform;
}
