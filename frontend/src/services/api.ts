import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 25_000
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('fortatech.token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('fortadocs:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  if (!axios.isAxiosError(error)) return failureCount < 1;
  const status = error.response?.status;
  return !status || status >= 500;
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(' ');
  if (message && typeof message === 'object' && 'message' in message) {
    return String(message.message);
  }
  if (error.code === 'ECONNABORTED') {
    return 'O servidor demorou para responder. Tente novamente.';
  }
  return fallback;
}
