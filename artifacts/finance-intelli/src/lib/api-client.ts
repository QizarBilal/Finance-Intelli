import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react/custom-fetch';

// Prepend the proxy prefix in development if needed
// Assuming api calls go to /api which is proxied
setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''));

// Setup token getter for authentication
setAuthTokenGetter(() => {
  return localStorage.getItem('finance_token');
});

// Helper functions for token management
export function setToken(token: string) {
  localStorage.setItem('finance_token', token);
}

export function clearToken() {
  localStorage.removeItem('finance_token');
}

export function hasToken(): boolean {
  return !!localStorage.getItem('finance_token');
}
