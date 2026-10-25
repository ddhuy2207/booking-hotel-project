import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 15000,
});

/** Lấy phần body (response.data) của request axios. Dùng chung cho mọi file trong api/. */
export const unwrap = (promise) => promise.then((response) => response.data);

function getCookie(name) {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

const SAFE_METHODS = ['get', 'head', 'options'];

api.interceptors.request.use((config) => {
  if (!SAFE_METHODS.includes((config.method || 'get').toLowerCase())) {
    const csrf = getCookie('csrf_access_token');
    if (csrf) config.headers['X-CSRF-TOKEN'] = csrf;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired/invalid: notify AuthContext so it clears the logged-in state.
    // Requests flagged with skipAuthEvent (login, fetching the profile on startup) are ignored.
    if (error.response?.status === 401 && !error.config?.skipAuthEvent) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default api;
