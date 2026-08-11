import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react/custom-fetch';

// Prepend the proxy prefix in development if needed
// Assuming api calls go to /api which is proxied
setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''));

// Setup token getter for authentication
setAuthTokenGetter(null);

// Helper functions for token management
export function setToken(_token?: string) {
  localStorage.setItem('finance_session', '1');
}

export function clearToken() {
  localStorage.removeItem('finance_session');
}

export function hasToken(): boolean {
  return localStorage.getItem('finance_session') === '1';
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const apiError = error as { data?: unknown; message?: unknown };
  if (apiError.data && typeof apiError.data === 'object') {
    const message = (apiError.data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return typeof apiError.message === 'string' && apiError.message.trim() ? apiError.message : fallback;
}
