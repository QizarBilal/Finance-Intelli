import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react/custom-fetch';

// Prepend the proxy prefix in development if needed
// Assuming api calls go to /api which is proxied
setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''));

// Setup token getter for authentication
setAuthTokenGetter(null);

// Helper functions for token management
export function setToken(_token?: string) {
  sessionStorage.setItem('finance_session', '1');
}

export function clearToken() {
  sessionStorage.removeItem('finance_session');
}

export function hasToken(): boolean {
  return true;
}
